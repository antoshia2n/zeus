/**
 * Notion → Zeus 全件同期エンドポイント
 *
 * POST /api/internal/sync-from-notion
 * Authorization: Bearer ${MCP_INTERNAL_SECRET}
 * Body(省略可): { force_full: boolean }
 *   force_full=true  → 全エントリ削除してから同期（初回のみ使用）
 *   force_full=false → source='notion-*' のエントリのみ削除して同期（夜間Cron）
 */

const NOTION_DBS = [
  { source: "notion-inbox",   dbId: "31c9c6c1c439800f8093dd4e9dca241c" },
  { source: "notion-input",   dbId: "31b9c6c1c43980b48b91d7128950f794" },
  { source: "notion-output",  dbId: "31b9c6c1c43980c5b8ccdf3b7fea572a" },
  { source: "notion-asset",   dbId: "31b9c6c1c43980bd963fc2ca909feacb" },
  { source: "notion-project", dbId: "31b9c6c1c4398069b884f0916da9e795" },
];

const VOYAGE_BATCH = 20; // Voyage AI 1リクエストあたり最大件数

export async function onRequestPost(context) {
  const { request, env } = context;

  // 認証
  const auth = request.headers.get("Authorization") || "";
  if (!env.MCP_INTERNAL_SECRET || auth !== `Bearer ${env.MCP_INTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let body = {};
  try { body = await request.json(); } catch { /* body省略OK */ }
  const forceFullDelete = body.force_full === true;

  // 環境変数チェック
  const notionKey = env.NOTION_API_KEY;
  const voyageKey = env.VOYAGE_API_KEY;
  const supaUrl   = env.VITE_SUPABASE_URL;
  const supaKey   = env.VITE_SUPABASE_ANON_KEY;
  const userId    = env.VITE_USER_UID;

  const missing = [
    !notionKey && "NOTION_API_KEY",
    !voyageKey && "VOYAGE_API_KEY",
    !supaUrl   && "VITE_SUPABASE_URL",
    !supaKey   && "VITE_SUPABASE_ANON_KEY",
    !userId    && "VITE_USER_UID",
  ].filter(Boolean);
  if (missing.length) return json({ error: "missing_env", vars: missing }, 500);

  // 1. 既存エントリ削除
  //    force_full=true: 全削除（初回移行用）
  //    force_full=false: notion-* ソースのみ削除（通常同期）
  const deleteUrl = forceFullDelete
    ? `${supaUrl}/rest/v1/zs_entries?user_id=eq.${userId}`
    : `${supaUrl}/rest/v1/zs_entries?source=like.notion-*`;

  const delRes = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      "apikey":        supaKey,
      "Authorization": `Bearer ${supaKey}`,
    },
  });
  if (!delRes.ok) {
    const detail = await delRes.json().catch(() => delRes.status);
    return json({ error: "delete_failed", detail }, 502);
  }

  // 2. Notion 5DB を順番に同期
  const bySource    = {};
  let   totalImported = 0;

  for (const { source, dbId } of NOTION_DBS) {
    const pages   = await fetchAllNotionPages(notionKey, dbId);
    const entries = pages.map(page => buildEntry(source, userId, page));

    // VOYAGE_BATCH件ずつ: 埋め込み → INSERT
    for (let i = 0; i < entries.length; i += VOYAGE_BATCH) {
      const batch = entries.slice(i, i + VOYAGE_BATCH);
      const texts = batch.map(e => `${e.title}\n\n${e.content}`);

      let embeddings;
      try {
        embeddings = await embedBatch(voyageKey, texts);
      } catch (e) {
        return json({ error: "voyage_error", detail: String(e), source, offset: i }, 502);
      }

      const rows = batch.map((entry, idx) => ({
        ...entry,
        embedding: embeddings[idx],
      }));

      const insRes = await fetch(`${supaUrl}/rest/v1/zs_entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        supaKey,
          "Authorization": `Bearer ${supaKey}`,
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify(rows),
      });

      if (!insRes.ok) {
        const detail = await insRes.json().catch(() => insRes.status);
        return json({ error: "insert_failed", detail, source, offset: i }, 502);
      }
      totalImported += batch.length;
    }

    bySource[source] = entries.length;
  }

  return json({ ok: true, total_imported: totalImported, by_source: bySource });
}

// ── Notion API ──────────────────────────────────────────────

// ページネーションで全件取得
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

    if (!res.ok) break; // 取得失敗は0件として処理継続

    const data = await res.json();
    pages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

// Notionページ → zs_entries レコード
function buildEntry(source, userId, page) {
  const props = page.properties || {};
  const title = findTitleProp(props) || "（無題）";
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
    const status = extractSelect(props["status"]);
    const media  = extractMultiSelect(props["media"]);
    const tags   = extractMultiSelect(props["topic_tag"]);
    const honbun = extractRichText(props["本文"]);
    if (status)       parts.push(`ステータス: ${status}`);
    if (media.length)  parts.push(`メディア: ${media.join(", ")}`);
    if (tags.length)   parts.push(`タグ: ${tags.join(", ")}`);
    if (honbun)        parts.push(honbun.substring(0, 600));

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
    title,
    content:    parts.join("\n") || title,
    source,
    source_app: "notion",
    source_ref: page.id,       // NotionページID（再同期時の識別用）
    tags:       [],
    created_by: "notion-sync",
  };
}

// ── プロパティ抽出ヘルパー ──────────────────────────────────

// title型のプロパティを名前によらず自動検出
function findTitleProp(props) {
  for (const val of Object.values(props)) {
    if (val?.type === "title") {
      return (val.title ?? []).map(t => t.plain_text).join("").trim();
    }
  }
  return "";
}
function extractRichText(field) {
  return (field?.rich_text ?? []).map(t => t.plain_text).join("").trim();
}
function extractSelect(field) {
  return field?.select?.name || "";
}
function extractMultiSelect(field) {
  return (field?.multi_select ?? []).map(o => o.name);
}

// ── Voyage AI ───────────────────────────────────────────────

async function embedBatch(apiKey, texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:            "voyage-3.5",
      input:            texts,
      input_type:       "document",
      output_dimension: 1024,
    }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.data.map(d => d.embedding);
}

// ── ユーティリティ ──────────────────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
