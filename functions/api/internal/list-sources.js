/**
 * POST /api/internal/list-sources
 * 認証: Authorization: Bearer {ZEUS_INTERNAL_SECRET}
 *
 * zeus_items の source_app 別件数集計。
 * v1-compat/list-sources から内部呼び出しされる。
 */

import { dbSelect } from "../../_shared/supabase.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get("Authorization") || "";
  if (!env.ZEUS_INTERNAL_SECRET || auth !== `Bearer ${env.ZEUS_INTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { user_id } = body || {};
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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
