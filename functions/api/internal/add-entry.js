/**
 * shia2n-mcp 用の内部エントリ追加API
 *
 * 呼び出し:
 *   POST /api/internal/add-entry
 *   Authorization: Bearer ${MCP_INTERNAL_SECRET}
 *   Body: { user_id, title, content, source?, source_app?, source_ref?, tags? }
 *
 * 処理:
 *   1. 本文をVoyageでベクトル化
 *   2. zs_entriesにINSERT（created_by='mcp'）
 *   3. 作成されたエントリを返す
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // 認証
  const auth = request.headers.get("Authorization") || "";
  if (!env.MCP_INTERNAL_SECRET || auth !== `Bearer ${env.MCP_INTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const {
    user_id,
    title,
    content,
    source = "memo",
    source_app = null,
    source_ref = null,
    tags = [],
  } = body || {};

  if (!user_id || !title?.trim() || !content?.trim()) {
    return json({ error: "user_id, title, content required" }, 400);
  }

  // 1. ベクトル化
  let embedding;
  try {
    embedding = await embedDocument(
      env.VOYAGE_API_KEY,
      `${title.trim()}\n\n${content.trim()}`
    );
  } catch (e) {
    return json({ error: "voyage_error", detail: String(e) }, 502);
  }

  // 2. Supabase INSERT
  const supaUrl = env.VITE_SUPABASE_URL;
  const supaKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) {
    return json({ error: "supabase config missing" }, 500);
  }

  const insertRes = await fetch(`${supaUrl}/rest/v1/zs_entries`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        supaKey,
      "Authorization": `Bearer ${supaKey}`,
      "Prefer":        "return=representation",
    },
    body: JSON.stringify({
      user_id,
      title:      title.trim(),
      content:    content.trim(),
      source,
      source_app,
      source_ref,
      tags:       Array.isArray(tags) ? tags : [],
      embedding,
      created_by: "mcp",
    }),
  });

  const data = await insertRes.json().catch(() => null);
  if (!insertRes.ok) {
    return json({ error: "supabase_error", detail: data }, 502);
  }

  return json({ entry: Array.isArray(data) ? data[0] : data });
}

async function embedDocument(apiKey, text) {
  if (!apiKey) throw new Error("VOYAGE_API_KEY missing");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:            "voyage-3.5",
      input:            [text],
      input_type:       "document",
      output_dimension: 1024,
    }),
  });
  if (!res.ok) throw new Error(`voyage ${res.status}`);
  const j = await res.json();
  return j?.data?.[0]?.embedding;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
