/**
 * shia2n-mcp 用の内部ソース集計API
 *
 * 呼び出し:
 *   POST /api/internal/list-sources
 *   Authorization: Bearer ${MCP_INTERNAL_SECRET}
 *   Body: { user_id }
 *
 * レスポンス:
 *   { sources: [{ source, count }, ...] }
 */

export async function onRequestPost(context) {
  const { request, env } = context;

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

  const { user_id } = body || {};
  if (!user_id) return json({ error: "user_id required" }, 400);

  const supaUrl = env.VITE_SUPABASE_URL;
  const supaKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) {
    return json({ error: "supabase config missing" }, 500);
  }

  // user_idで絞り、sourceだけを取得して集計
  const res = await fetch(
    `${supaUrl}/rest/v1/zs_entries?select=source&user_id=eq.${encodeURIComponent(user_id)}`,
    {
      headers: {
        "apikey":        supaKey,
        "Authorization": `Bearer ${supaKey}`,
      },
    }
  );

  const rows = await res.json().catch(() => null);
  if (!res.ok) return json({ error: "supabase_error", detail: rows }, 502);

  const counts = {};
  for (const r of rows ?? []) {
    counts[r.source] = (counts[r.source] || 0) + 1;
  }

  const sources = Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return json({ sources, total: rows?.length ?? 0 });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
