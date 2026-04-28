/**
 * POST or GET /api/external/v1-compat/list-sources
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 修正版：自己参照 fetch をやめ、_shared モジュールを直接呼び出す。
 */

import { dbSelect } from "../../../_shared/supabase.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handle(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ZEUS_EXTERNAL_SECRET || auth !== `Bearer ${env.ZEUS_EXTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  let user_id = url.searchParams.get("user_id");
  if (!user_id && request.method === "POST") {
    try { const b = await request.json(); user_id = b?.user_id; } catch { /* ignore */ }
  }
  if (!user_id) return json({ error: "user_id required" }, 400);

  const rows = await dbSelect(env, "zeus_items",
    `user_id=eq.${encodeURIComponent(user_id)}&select=source_app`
  );

  const counts = {};
  for (const r of rows) {
    const key = r.source_app || "manual";
    counts[key] = (counts[key] || 0) + 1;
  }

  const sources = Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return json({ sources, total: rows.length });
}

export const onRequestGet  = ctx => handle(ctx.request, ctx.env);
export const onRequestPost = ctx => handle(ctx.request, ctx.env);
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
