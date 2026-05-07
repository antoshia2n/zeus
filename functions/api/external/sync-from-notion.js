/**
 * POST /api/external/sync-from-notion
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 呼び出し元:
 *   - shia2n-mcp Cron（毎晩 JST 03:00）
 *   - shia2n-mcp /cron/notion-sync/run（手動実行）
 *
 * Body（任意）: { force_full: boolean }
 *   force_full=true  → 全 zeus_items 削除してから同期（初回移行専用）
 *   force_full=false → notion-* source のみ削除して同期（デフォルト）
 */

import { runNotionSync } from "../../_shared/notion-sync.js";

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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 認証
  const auth = request.headers.get("Authorization") || "";
  if (!env.ZEUS_EXTERNAL_SECRET || auth !== `Bearer ${env.ZEUS_EXTERNAL_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  // Body パース（失敗しても継続）
  let body = {};
  try { body = await request.json(); } catch { /* body省略OK */ }
  const forceFullDelete = body.force_full === true;

  // 環境変数プリチェック
  const missing = [
    !env.NOTION_API_KEY    && "NOTION_API_KEY",
    !env.VOYAGE_API_KEY    && "VOYAGE_API_KEY",
    !env.VITE_SUPABASE_URL && "VITE_SUPABASE_URL",
    !env.VITE_SUPABASE_ANON_KEY && "VITE_SUPABASE_ANON_KEY",
    !(env.MCP_DEFAULT_USER_ID || env.VITE_USER_UID) && "MCP_DEFAULT_USER_ID or VITE_USER_UID",
  ].filter(Boolean);

  if (missing.length > 0) {
    return json({ error: "missing_env", vars: missing }, 500);
  }

  try {
    const result = await runNotionSync(env, forceFullDelete);
    return json(result);
  } catch (e) {
    console.error("[sync-from-notion external] error:", e.message);
    return json({ error: "sync_failed", detail: e.message }, 502);
  }
}
