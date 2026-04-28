/**
 * GET /api/external/list-projects
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 修正版：自己参照 fetch をやめ、_shared モジュールを直接呼び出す。
 */

import { dbSelect } from "../../_shared/supabase.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = request.headers.get("Authorization") || "";
  if (!env.ZEUS_EXTERNAL_SECRET || auth !== `Bearer ${env.ZEUS_EXTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const url     = new URL(request.url);
  const user_id = url.searchParams.get("user_id");
  if (!user_id) return json({ error: "user_id required" }, 400);

  const rows = await dbSelect(env, "zeus_projects",
    `user_id=eq.${encodeURIComponent(user_id)}&order=order_index.asc,created_at.asc`
  );

  const items = rows.map(p => ({
    id:        p.id,
    name:      p.name,
    parent_id: p.parent_id,
  }));

  return json({ items });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
