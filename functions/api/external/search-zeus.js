/**
 * GET /api/external/search-zeus
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 修正版：自己参照 fetch をやめ、_shared モジュールを直接呼び出す。
 */

import { generateEmbedding } from "../../_shared/embedding.js";
import { dbRpc, dbSelect } from "../../_shared/supabase.js";

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

  const url        = new URL(request.url);
  const user_id    = url.searchParams.get("user_id");
  const q          = url.searchParams.get("q");
  const project_id = url.searchParams.get("project_id") || null;
  const item_types_raw = url.searchParams.get("item_types");
  const limit      = Math.min(Number(url.searchParams.get("limit") || "20"), 50);

  if (!user_id)   return json({ error: "user_id required" }, 400);
  if (!q?.trim()) return json({ error: "q required" }, 400);

  const item_types = item_types_raw
    ? item_types_raw.split(",").map(s => s.trim()).filter(Boolean)
    : null;

  // ベクトル化
  let embedding;
  try {
    embedding = await generateEmbedding(q.trim(), env);
  } catch (e) {
    return json({ error: `embedding failed: ${e.message}` }, 502);
  }

  // ベクトル検索
  const results = await dbRpc(env, "zeus_match_items", {
    query_embedding:  embedding,
    match_user_id:    user_id,
    match_count:      limit,
    match_project_id: project_id,
    match_item_types: item_types,
  });

  // 所属プロジェクト情報付与
  const ids = results.map(r => r.id);
  let projectMap = {};
  if (ids.length > 0) {
    const rels = await dbSelect(env, "zeus_item_projects",
      `item_id=in.(${ids.join(",")})&select=item_id,project_id`
    );
    const pids = [...new Set(rels.map(r => r.project_id))];
    let projs = [];
    if (pids.length > 0) {
      projs = await dbSelect(env, "zeus_projects", `id=in.(${pids.join(",")})&select=id,name`);
    }
    const projById = Object.fromEntries(projs.map(p => [p.id, p]));
    for (const rel of rels) {
      if (!projectMap[rel.item_id]) projectMap[rel.item_id] = [];
      if (projById[rel.project_id]) projectMap[rel.item_id].push(projById[rel.project_id]);
    }
  }

  const items = results.map(r => ({
    id:         r.id,
    title:      r.title,
    snippet:    (r.content || "").slice(0, 200),
    item_type:  r.item_type,
    source_url: r.source_url,
    source_app: r.source_app,
    score:      r.similarity,
    projects:   projectMap[r.id] || [],
  }));

  return json({ items });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
