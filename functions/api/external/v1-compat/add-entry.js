/**
 * POST /api/external/v1-compat/add-entry
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 修正版：自己参照 fetch をやめ、_shared モジュールを直接呼び出す。
 */

import { dbInsert } from "../../../_shared/supabase.js";
import { generateItemEmbedding } from "../../../_shared/embedding.js";
import { detectItemType } from "../../../_shared/item-type-detector.js";

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

  const { user_id, title, content, source_url, source } = body || {};
  if (!user_id) return json({ error: "user_id required" }, 400);
  if (!title?.trim() && !content?.trim()) {
    return json({ error: "title or content required" }, 400);
  }

  const item_type = detectItemType({ source_url, content });

  let embedding = null;
  try {
    embedding = await generateItemEmbedding({ title, content }, env);
  } catch (e) {
    console.error("[v1-compat/add-entry] embed failed:", e.message);
  }

  const row = await dbInsert(env, "zeus_items", {
    user_id,
    item_type,
    title:      title    || null,
    content:    content  || null,
    source_url: source_url || null,
    source_app: source   || "mcp",
    metadata:   {},
    embedding,
  });

  return json({ entry_id: row.id, id: row.id });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
