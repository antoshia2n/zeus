/**
 * POST /api/external/v1-compat/search
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 修正版：自己参照 fetch をやめ、_shared モジュールを直接呼び出す。
 */

import { generateEmbedding } from "../../../_shared/embedding.js";
import { dbRpc } from "../../../_shared/supabase.js";

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
  if (!env.ZEUS_EXTERNAL_SECRET || auth !== `Bearer ${env.ZEUS_EXTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "invalid json" }, 400); }

  const { user_id, query, top_k = 5 } = body || {};
  if (!user_id || !query?.trim()) {
    return json({ error: "user_id and query required" }, 400);
  }

  let embedding;
  try {
    embedding = await generateEmbedding(query.trim(), env);
  } catch (e) {
    return json({ error: `embedding failed: ${e.message}` }, 502);
  }

  const results = await dbRpc(env, "zeus_match_items", {
    query_embedding:  embedding,
    match_user_id:    user_id,
    match_count:      Math.min(Number(top_k) || 5, 20),
    match_project_id: null,
    match_item_types: null,
  });

  // v1 互換レスポンス形式
  return json({
    results: results.map(r => ({
      id:              r.id,
      title:           r.title || "",
      content_preview: (r.content || "").slice(0, 300),
      source:          r.source_app || "manual",
      tags:            [],
      score:           r.similarity || 0,
      created_at:      r.created_at,
    })),
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
