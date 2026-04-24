/**
 * shia2n-mcp 用の内部検索API
 *
 * 呼び出し:
 *   POST /api/internal/search
 *   Authorization: Bearer ${MCP_INTERNAL_SECRET}
 *   Body: { user_id, query, limit?, source? }
 *
 * 処理:
 *   1. queryをVoyageでベクトル化
 *   2. Supabase RPC zs_match_entries を呼び出す
 *   3. 類似度上位のエントリを返す
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

  const { user_id, query, limit = 5, source = null } = body || {};
  if (!user_id || !query?.trim()) {
    return json({ error: "user_id and query required" }, 400);
  }

  // 1. Voyageでクエリをベクトル化
  let queryEmbedding;
  try {
    queryEmbedding = await embedQuery(env.VOYAGE_API_KEY, query.trim());
  } catch (e) {
    return json({ error: "voyage_error", detail: String(e) }, 502);
  }

  // 2. Supabase RPCで類似検索
  const supaUrl = env.VITE_SUPABASE_URL;
  const supaKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) {
    return json({ error: "supabase config missing" }, 500);
  }

  const rpcRes = await fetch(`${supaUrl}/rest/v1/rpc/zs_match_entries`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        supaKey,
      "Authorization": `Bearer ${supaKey}`,
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_user_id:   user_id,
      match_count:     Math.min(Math.max(1, Number(limit) || 5), 20),
      match_source:    source,
    }),
  });

  const data = await rpcRes.json().catch(() => null);
  if (!rpcRes.ok) {
    return json({ error: "supabase_error", detail: data }, 502);
  }

  return json({ results: data ?? [] });
}

async function embedQuery(apiKey, text) {
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
      input_type:       "query",
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
