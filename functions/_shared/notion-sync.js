/**
 * _shared/notion-sync.js
 * Notion 5DB → zeus_items 同期のコアロジック
 *
 * 呼び出し元:
 *   - /api/external/sync-from-notion.js（ZEUS_EXTERNAL_SECRET 認証 / shia2n-mcp Cron）
 *   - /api/ui/sync-from-notion.js（Firebase ID Token 認証 / Settings 手動ボタン）
 *
 * v2: ページ本文（ブロックコンテンツ）取得を追加
 *   - 各ページに /v1/blocks/{page_id}/children を叩いてテキストを結合
 *   - Notion API レート制限対策：並列数 BLOCK_CONCURRENCY=3 で制御
 *   - content = ページ本文テキスト（あれば）+ プロパティのメタ情報
 */

// ─── 定数 ──────────────────────────────────────────────────────────────────────

const NOTION_DBS = [
  { source: "notion-inbox",   dbId: "31c9c6c1c439800f8093dd4e9dca241c", label: "inbox" },
  { source: "notion-input",   dbId: "31b9c6c1c43980b48b91d7128950f794", label: "インプットDB" },
  { source: "notion-output",  dbId: "31b9c6c1c43980c5b8ccdf3b7fea572a", label: "アウトプットDB" },
  { source: "notion-asset",   dbId: "31b9c6c1c43980bd963fc2ca909feacb", label: "アセットDB" },
  { source: "notion-project", dbId: "31b9c6c1c4398069b884f0916da9e795", label: "プロジェクトDB" },
];

const NOTION_SOURCE_APPS  = NOTION_DBS.map(d => d.source).join(",");
const VOYAGE_BATCH_SIZE   = 20; // Voyage AI 1リクエストあたり件数
const SUPABASE_BATCH_SIZE = 50; // Supabase 1リクエストあたり INSERT 件数
const BLOCK_CONCURRENCY   = 3;  // Notion blocks API 同時リクエスト数（レート制限対策）

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

function notionHeaders(notionKey) {
  return {
    "Authorization":  `Bearer ${notionKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type":   "application/json",
  };
}

// DB全ページを取得（ページネーション対応）
async function fetchAllNotionPages(notionKey, dbId) {
  const pages  = [];
  let   cursor = undefined;

  do {
    const reqBody = { page_size: 100 };
    if (cursor) reqBody.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method:  "POST",
      headers: notionHeaders(notionKey),
      body:    JSON.stringify(reqBody),
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

// 1ページのブロックコンテンツを再帰取得してプレーンテキストに変換
async function fetchPageBlockText(notionKey, pageId) {
  const lines  = [];
  let   cursor = undefined;

  do {
    const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: notionHeaders(notionKey) });

    if (!res.ok) break;

    const data = await res.json();

    for (const block of (data.results || [])) {
      const text = extractBlockText(block);
      if (text) lines.push(text);
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return lines.join("\n").trim();
}

// ブロック1件のテキストを抽出（主要タイプのみ対応）
function extractBlockText(block) {
  const type = block.type;
  const b    = block[type];
  if (!b) return "";

  // rich_text を持つブロックタイプ
  const richTextTypes = [
    "paragraph", "heading_1", "heading_2", "heading_3",
    "bulleted_list_item", "numbered_list_item",
    "toggle", "quote", "callout",
  ];

  if (richTextTypes.includes(type)) {
    return (b.rich_text || []).map(t => t.plain_text).join("").trim();
  }

  if (type === "code") {
    const text = (b.rich_text || []).map(t => t.plain_text).join("").trim();
    return text ? `\`\`\`\n${text}\n\`\`\`` : "";
  }

  if (type === "divider") return "---";

  return "";
}

// 並列数を BLOCK_CONCURRENCY に制限して全ページのブロックテキストを取得
async function fetchBlockTextsInBatches(notionKey, pageIds) {
  const results = new Map(); // page_id → text

  for (let i = 0; i < pageIds.length; i += BLOCK_CONCURRENCY) {
    const chunk = pageIds.slice(i, i + BLOCK_CONCURRENCY);
    const texts = await Promise.all(
      chunk.map(id => fetchPageBlockText(notionKey, id).catch(() => ""))
    );
    chunk.forEach((id, idx) => results.set(id, texts[idx]));
  }

  return results;
}

// ─── プロジェクト upsert ────────────────────────────────────────────────────────

async function upsertProject(env, userId, name, description) {
  const existing = await supaSelect(
    env,
    "zeus_projects",
    `user_id=eq.${encodeURIComponent(userId)}&name=eq.${encodeURIComponent(name)}&select=id`
  );
  if (existing.length > 0) return existing[0].id;

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

// blockText: fetchBlockTextsInBatches で取得済みの本文テキスト
function buildItemRow(source, userId, page, blockText) {
  const props = page.properties || {};
  const title = extractTitle(props) || "（無題）";

  // 本文はブロックテキストを優先、なければプロパティメタ情報
  const bodyParts = [];

  if (source === "notion-inbox") {
    const genre = extractMultiSelect(props["ジャンル"]);
    const type  = extractMultiSelect(props["タイプ"]);
    if (genre.length) bodyParts.push(`ジャンル: ${genre.join(", ")}`);
    if (type.length)  bodyParts.push(`タイプ: ${type.join(", ")}`);

  } else if (source === "notion-input") {
    const st   = extractSelect(props["source_type"]);
    const tags = extractMultiSelect(props["topic_tag"]);
    if (st)          bodyParts.push(`種別: ${st}`);
    if (tags.length) bodyParts.push(`タグ: ${tags.join(", ")}`);

  } else if (source === "notion-output") {
    const media  = extractMultiSelect(props["media"]);
    const status = extractSelect(props["status"]);
    const tags   = extractMultiSelect(props["topic_tag"]);
    const honbun = extractRichText(props["本文"]);
    if (status)       bodyParts.push(`ステータス: ${status}`);
    if (media.length) bodyParts.push(`メディア: ${media.join(", ")}`);
    if (tags.length)  bodyParts.push(`タグ: ${tags.join(", ")}`);
    // プロパティ「本文」があればそれも使う
    if (honbun)       bodyParts.push(honbun);

  } else if (source === "notion-asset") {
    const at   = extractSelect(props["asset_type"]);
    const tags = extractMultiSelect(props["topic_tag"]);
    if (at)          bodyParts.push(`種別: ${at}`);
    if (tags.length) bodyParts.push(`タグ: ${tags.join(", ")}`);

  } else if (source === "notion-project") {
    const status = extractSelect(props["status"]);
    const area   = extractSelect(props["事業領域"]);
    const goal   = extractRichText(props["goal"]);
    if (status) bodyParts.push(`ステータス: ${status}`);
    if (area)   bodyParts.push(`事業領域: ${area}`);
    if (goal)   bodyParts.push(`ゴール: ${goal}`);
  }

  // ブロック本文（ページ本体）があれば先頭に配置、プロパティメタは後ろに付加
  const contentParts = [];
  if (blockText) contentParts.push(blockText);
  if (bodyParts.length) contentParts.push(bodyParts.join("\n"));

  return {
    user_id:    userId,
    item_type:  "text",
    title,
    content:    contentParts.join("\n\n") || title,
    source_app: source,
    source_url: null,
    file_url:   null,
    metadata:   { notion_page_id: page.id },
    embedding:  null,
    folder_id:  null,
  };
}

// ─── プロパティ抽出ヘルパー ──────────────────────────────────────────────────────

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

// ─── メイン同期関数 ─────────────────────────────────────────────────────────────

export async function runNotionSync(env, forceFullDelete = false) {
  const notionKey = env.NOTION_API_KEY;
  const userId    = env.MCP_DEFAULT_USER_ID || env.VITE_USER_UID;
  if (!notionKey) throw new Error("NOTION_API_KEY not configured");
  if (!userId)    throw new Error("User ID (MCP_DEFAULT_USER_ID / VITE_USER_UID) not configured");

  // 1. 既存エントリ削除
  const deleteFilter = forceFullDelete
    ? `user_id=eq.${encodeURIComponent(userId)}`
    : `source_app=in.(${NOTION_SOURCE_APPS})&user_id=eq.${encodeURIComponent(userId)}`;

  await supaDelete(env, "zeus_items", deleteFilter);

  const bySource    = {};
  let   totalImported = 0;

  for (const { source, dbId, label } of NOTION_DBS) {
    const projectId = await upsertProject(
      env, userId, source, `Notionナレッジ: ${label}`
    );

    // 2. ページ一覧取得
    const pages = await fetchAllNotionPages(notionKey, dbId);
    if (pages.length === 0) {
      bySource[source] = 0;
      continue;
    }

    // 3. 各ページのブロック本文を並列（BLOCK_CONCURRENCY=3）で取得
    const pageIds     = pages.map(p => p.id);
    const blockTextMap = await fetchBlockTextsInBatches(notionKey, pageIds);

    // 4. zeus_items 行を構築
    const rows = pages.map(p => buildItemRow(source, userId, p, blockTextMap.get(p.id) || ""));

    // 5. Voyage AI バッチ Embedding
    for (let i = 0; i < rows.length; i += VOYAGE_BATCH_SIZE) {
      const batch = rows.slice(i, i + VOYAGE_BATCH_SIZE);
      const texts = batch.map(r => `${r.title}\n\n${r.content}`);
      let embeddings;
      try {
        embeddings = await embedBatch(texts, env);
      } catch (e) {
        console.error(`[notion-sync] embed failed ${source} offset ${i}:`, e.message);
        embeddings = batch.map(() => null);
      }
      batch.forEach((r, idx) => { r.embedding = embeddings[idx]; });
    }

    // 6. zeus_items 一括 INSERT
    const insertedItems = await supaBulkInsert(env, "zeus_items", rows);

    // 7. zeus_item_projects 一括 INSERT
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
