/**
 * POST /api/external/push-to-zeus
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 修正版：自己参照 fetch をやめ、_shared モジュールを直接呼び出す。
 */

import { dbInsert } from "../../_shared/supabase.js";
import { generateItemEmbedding } from "../../_shared/embedding.js";
import { detectItemType } from "../../_shared/item-type-detector.js";
import { fetchOgMeta, extractYouTubeId } from "../../_shared/og-fetch.js";

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

  const {
    user_id, source_app,
    title, content, source_url, file_url,
    item_type: providedType, folder_id, project_ids,
    metadata: providedMetadata, mime_type,
  } = body || {};

  if (!user_id)    return json({ error: "user_id required" }, 400);
  if (!source_app) return json({ error: "source_app required" }, 400);

  // 1. タイプ判定
  const item_type = providedType || detectItemType({ source_url, file_url, content, mime_type });

  // 2. メタデータ抽出
  let metadata = providedMetadata || {};
  let resolvedTitle   = title   ?? null;
  let resolvedContent = content ?? null;

  if (item_type === "web_clip" || item_type === "video_link") {
    try {
      const og = await fetchOgMeta(source_url);
      metadata = { ...og, ...metadata };
      if (!resolvedTitle   && og.title)       resolvedTitle   = og.title;
      if (!resolvedContent && og.description) resolvedContent = og.description;
      if (item_type === "video_link") {
        const vid = extractYouTubeId(source_url);
        if (vid) metadata.video_id = vid;
      }
    } catch { /* ignore */ }
  }

  // 3. Embedding 生成
  let embedding = null;
  try {
    embedding = await generateItemEmbedding(
      { title: resolvedTitle, content: resolvedContent },
      env
    );
  } catch (e) {
    console.error("[push-to-zeus] embedding failed:", e.message);
  }

  // 4. INSERT
  const row = await dbInsert(env, "zeus_items", {
    user_id,
    folder_id:   folder_id  ?? null,
    item_type,
    title:       resolvedTitle,
    content:     resolvedContent,
    source_url:  source_url ?? null,
    file_url:    file_url   ?? null,
    metadata,
    embedding,
    source_app,
  });

  // 5. プロジェクト紐付け
  if (Array.isArray(project_ids) && project_ids.length > 0) {
    await Promise.all(
      project_ids.map(pid =>
        dbInsert(env, "zeus_item_projects", {
          item_id: row.id, project_id: pid,
        }).catch(() => {})
      )
    );
  }

  return json({
    item_id:             row.id,
    item_type:           row.item_type,
    embedding_generated: !!embedding,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
