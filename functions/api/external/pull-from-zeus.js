/**
 * GET /api/external/pull-from-zeus
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
  const item_id = url.searchParams.get("item_id");
  if (!item_id) return json({ error: "item_id required" }, 400);

  const [item] = await dbSelect(env, "zeus_items", `id=eq.${item_id}`);
  if (!item) return json({ error: "not found" }, 404);

  const rels = await dbSelect(env, "zeus_item_projects",
    `item_id=eq.${item_id}&select=project_id`
  );
  const pids = rels.map(r => r.project_id);
  let projects = [];
  if (pids.length > 0) {
    projects = await dbSelect(env, "zeus_projects", `id=in.(${pids.join(",")})`);
  }

  return json({ item, projects });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
