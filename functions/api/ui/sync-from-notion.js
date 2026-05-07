/**
 * POST /api/ui/sync-from-notion
 * 認証: Authorization: Bearer {Firebase ID Token}
 *
 * 呼び出し元: Settings.jsx の「Notionから同期」ボタン
 *
 * Body（任意）: { force_full: boolean }
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

// Firebase ID Token → uid（[[route]].js と同じ方式）
async function verifyFirebaseToken(idToken, env) {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY not configured");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) throw new Error("Firebase token verification failed");
  const data = await res.json();
  const user = data?.users?.[0];
  if (!user) throw new Error("No user found");
  return user.localId; // uid
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 認証
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "missing_token" }, 401);
  const token = auth.slice("Bearer ".length).trim();

  let uid;
  try {
    uid = await verifyFirebaseToken(token, env);
  } catch (e) {
    return json({ error: "auth_failed", detail: e.message }, 401);
  }

  // Naoki のみ許可（env の MCP_DEFAULT_USER_ID または VITE_USER_UID と照合）
  const allowedUid = env.MCP_DEFAULT_USER_ID || env.VITE_USER_UID;
  if (allowedUid && uid !== allowedUid) {
    return json({ error: "forbidden" }, 403);
  }

  // Body パース
  let body = {};
  try { body = await request.json(); } catch { /* 省略OK */ }
  const forceFullDelete = body.force_full === true;

  // 環境変数プリチェック
  const missing = [
    !env.NOTION_API_KEY         && "NOTION_API_KEY",
    !env.VOYAGE_API_KEY         && "VOYAGE_API_KEY",
    !env.VITE_SUPABASE_URL      && "VITE_SUPABASE_URL",
    !env.VITE_SUPABASE_ANON_KEY && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    return json({ error: "missing_env", vars: missing }, 500);
  }

  try {
    const result = await runNotionSync(env, forceFullDelete);
    return json(result);
  } catch (e) {
    console.error("[sync-from-notion ui] error:", e.message);
    return json({ error: "sync_failed", detail: e.message }, 502);
  }
}
