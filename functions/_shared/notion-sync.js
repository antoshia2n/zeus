/**
 * _shared/notion-sync.js
 * Notion 5DB → zeus_items 同期のコアロジック
 *
 * 呼び出し元:
 *   - /api/external/sync-from-notion.js（ZEUS_EXTERNAL_SECRET 認証 / shia2n-mcp Cron）
 *   - /api/ui/sync-from-notion.js（Firebase ID Token 認証 / Settings 手動ボタン）
 */

// ─── 定数 ──────────────────────────────────────────────────────────────────────

const NOTION_DBS = [
  { source: "notion-inbox",   dbId: "31c9c6c1c439800f8093dd4e9dca241c", label: "inbox" },
  { source: "notion-input",   dbId: "31b9c6c1c43980b48b91d7128950f794", label: "インプットDB" },
  { source: "notion-output",  dbId: "31b9c6c1c43980c5b8ccdf3b7fea572a", label: "アウトプットDB" },
  { source: "notion-asset",   dbId: "31b9c6c1c43980bd963fc2ca909feacb", label: "アセットDB" },
  { source: "notion-project", dbId: "31b9c6c1c4398069b884f0916da9e795", label: "プロジェクトDB" },
];

// source_app の全候補（DELETE filter に使用）
const NOTION_SOURCE_APPS = NOTION_DBS.map(d => d.source).join(",");

const VOYAGE_BATCH_SIZE  = 20;  // Voyage AI 1リクエストあたり件数
const SUPABASE_BATCH_SIZE = 50; // Supabase 1リクエストあたり INSERT 件数

// ─── Supabase ユーティリティ ────────────────────────────────────────────────────

function getSupaConfig(env) {
  const url = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return { url, key };
}

function supaHeaders(key, returnRepresentation = false) {
  return {
    "Content-Type":  "application/json",
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Prefer":        returnRepresentation ? "return=representation" : "",
  };
}

async function supaDelete(env, table, filter) {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method:  "DELETE",
    headers: supaHeaders(key),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase DELETE ${table}: ${res.status} ${body.slice(0, 200)}`);
  }
}

async function supaSelect(env, table, filter) {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    headers: supaHeaders(key),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase SELECT ${table}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// 複数行を SUPABASE_BATCH_SIZE ずつ INSERT し、挿入された全行を返す
async function supaBulkInsert(env, table, rows) {
  if (rows.length === 0) return [];
  const { url, key } = getSupaConfig(env);
  const results = [];

  for (let i = 0; i < rows.length; i += SUPABASE_BATCH_SIZE) {
    const batch = rows.slice(i, i + SUPABASE_BATCH_SIZE);
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method:  "POST",
      headers: supaHeaders(key, true),
      body:    JSON.stringify(batch),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`supabase bulk INSERT ${table}: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    results.push(...(Array.isArray(data) ? data : [data]));
  }
  return results;
}

// ─── Voyage AI ─────────────────────────────────────────────────────────────────

async function embedBatch(texts, env) {
  if (!env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY not configured");

  const input = texts.map(t => (t || "").slice(0, 120000));
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model:            "voyage-3.5",
      input,
      input_type:       "document",
      output_dimension: 1024,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.data.map(d => d.embedding);
}

// ─── Notion API ─────────────────────────────────────────────────────────────────

async function fetchAllNotionPages(notionKey, dbId) {
  const pages  = [];
  let   cursor = undefined;

  do {
    const reqBody = { page_size: 100 };
    if (cursor) reqBody.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${notionKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type":   "application/json",
      },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[notion-sync] DB ${dbId} fetch failed: ${res.status} ${body.slice(0, 200)}`);
      break;
    }

    const data = await res.json();
    pages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

// ─── プロジェクト upsert ────────────────────────────────────────────────────────

async function upsertProject(env, userId, name, description) {
  // 既存プロジェクトを名前で検索
  const existing = await supaSelect(
    env,
    "zeus_projects",
    `user_id=eq.${encodeURIComponent(userId)}&name=eq.${encodeURIComponent(name)}&select=id`
  );
  if (existing.length > 0) return existing[0].id;

  // 新規作成
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/zeus_projects`, {
    method:  "POST",
    headers: supaHeaders(key, true),
    body:    JSON.stringify({ user_id: userId, name, description }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase INSERT zeus_projects: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (Array.isArray(data) ? data[0] : data).id;
}

// ─── Notion ページ → zeus_items 行 ──────────────────────────────────────────────

function buildItemRow(source, userId, page) {
  const props = page.properties || {};
  const title = extractTitle(props) || "（無題）";
  const parts = [];

  if (source === "notion-inbox") {
    const genre = extractMultiSelect(props["ジャンル"]);
    const type  = extractMultiSelect(props["タイプ"]);
    if (genre.length) parts.push(`ジャンル: ${genre.join(", ")}`);
    if (type.length)  parts.push(`タイプ: ${type.join(", ")}`);

  } else if (source === "notion-input") {
    const st   = extractSelect(props["source_type"]);
    const tags = extractMultiSelect(props["topic_tag"]);
    if (st)          parts.push(`種別: ${st}`);
    if (tags.length) parts.push(`タグ: ${tags.join(", ")}`);

  } else if (source === "notion-output") {
    const media  = extractMultiSelect(props["media"]);
    const status = extractSelect(props["status"]);
    const tags   = extractMultiSelect(props["topic_tag"]);
    const honbun = extractRichText(props["本文"]);
    if (status)       parts.push(`ステータス: ${status}`);
    if (media.length) parts.push(`メディア: ${media.join(", ")}`);
    if (tags.length)  parts.push(`タグ: ${tags.join(", ")}`);
    if (honbun)       parts.push(honbun.slice(0, 600));

  } else if (source === "notion-asset") {
    const at   = extractSelect(props["asset_type"]);
    const tags = extractMultiSelect(props["topic_tag"]);
    if (at)          parts.push(`種別: ${at}`);
    if (tags.length) parts.push(`タグ: ${tags.join(", ")}`);

  } else if (source === "notion-project") {
    const status = extractSelect(props["status"]);
    const area   = extractSelect(props["事業領域"]);
    const goal   = extractRichText(props["goal"]);
    if (status) parts.push(`ステータス: ${status}`);
    if (area)   parts.push(`事業領域: ${area}`);
    if (goal)   parts.push(`ゴール: ${goal}`);
  }

  return {
    user_id:    userId,
    item_type:  "text",
    title,
    content:    parts.join("\n") || title,
    source_app: source,
    source_url: null,
    file_url:   null,
    metadata:   { notion_page_id: page.id },
    embedding:  null, // embed loop で設定
    folder_id:  null,
  };
}

function extractTitle(props) {
  for (const v of Object.values(props)) {
    if (v?.type === "title") {
      return (v.title || []).map(t => t.plain_text).join("").trim();
    }
  }
  return "";
}
function extractRichText(f) {
  return (f?.rich_text || []).map(t => t.plain_text).join("").trim();
}
function extractSelect(f) {
  return f?.select?.name || "";
}
function extractMultiSelect(f) {
  return (f?.multi_select || []).map(o => o.name);
}

// ─── メイン同期関数（外部から呼ぶ） ────────────────────────────────────────────────

/**
 * @param {Env} env
 * @param {boolean} forceFullDelete
 *   true  → user_id に紐づく全 zeus_items を削除（初回移行専用）
 *   false → source_app=notion-* のアイテムのみ削除（通常同期・デフォルト）
 * @returns {{ ok: true, total_imported: number, by_source: Record<string, number> }}
 */
export async function runNotionSync(env, forceFullDelete = false) {
  // 環境変数チェック
  const notionKey = env.NOTION_API_KEY;
  const userId    = env.MCP_DEFAULT_USER_ID || env.VITE_USER_UID;
  if (!notionKey) throw new Error("NOTION_API_KEY not configured");
  if (!userId)    throw new Error("User ID (MCP_DEFAULT_USER_ID / VITE_USER_UID) not configured");

  // 1. 既存のNotion同期アイテムを削除
  //    CASCADE により zeus_item_projects も自動削除される
  const deleteFilter = forceFullDelete
    ? `user_id=eq.${encodeURIComponent(userId)}`
    : `source_app=in.(${NOTION_SOURCE_APPS})&user_id=eq.${encodeURIComponent(userId)}`;

  await supaDelete(env, "zeus_items", deleteFilter);

  // 2. DB ごとに同期
  const bySource    = {};
  let   totalImported = 0;

  for (const { source, dbId, label } of NOTION_DBS) {
    // プロジェクト upsert（なければ作成、あればIDを再利用）
    const projectId = await upsertProject(
      env, userId, source, `Notionナレッジ: ${label}`
    );

    // Notion 全ページ取得
    const pages = await fetchAllNotionPages(notionKey, dbId);
    if (pages.length === 0) {
      bySource[source] = 0;
      continue;
    }

    // zeus_items 行を構築
    const rows = pages.map(p => buildItemRow(source, userId, p));

    // Voyage AI バッチ Embedding
    for (let i = 0; i < rows.length; i += VOYAGE_BATCH_SIZE) {
      const batch = rows.slice(i, i + VOYAGE_BATCH_SIZE);
      const texts = batch.map(r => `${r.title}\n\n${r.content}`);
      let embeddings;
      try {
        embeddings = await embedBatch(texts, env);
      } catch (e) {
        // Embedding 失敗時は null のまま進める（全文検索には影響なし）
        console.error(`[notion-sync] embed failed ${source} offset ${i}:`, e.message);
        embeddings = batch.map(() => null);
      }
      batch.forEach((r, idx) => { r.embedding = embeddings[idx]; });
    }

    // zeus_items 一括 INSERT
    const insertedItems = await supaBulkInsert(env, "zeus_items", rows);

    // zeus_item_projects 一括 INSERT
    const projectLinks = insertedItems.map(r => ({
      item_id:    r.id,
      project_id: projectId,
    }));
    await supaBulkInsert(env, "zeus_item_projects", projectLinks);

    bySource[source]  = pages.length;
    totalImported    += pages.length;
  }

  return { ok: true, total_imported: totalImported, by_source: bySource };
}
