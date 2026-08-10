/**
 * POST /api/external/delete-from-zeus
 * 認証: Authorization: Bearer {ZEUS_EXTERNAL_SECRET}
 *
 * 登録ID（zeus_items.id）を指定して索引を削除する。
 * 既存の push-to-zeus / pull-from-zeus と同じ作り（_shared モジュールを直接呼ぶ）。
 *
 * 作った理由：
 *   実体を消したときに索引も消せないと、Zeus 検索のヒット先がリンク切れになる。
 *   スワイプファイルアプリの掃除待ち（sw_zeus_orphans）を一括で片づけるための口でもある。
 *
 * 設計の要点：
 *   1. 何度呼んでも同じ結果になる。すでに消えているIDはエラーにせず not_found に入れる
 *      （掃除は途中で止まっても、そのまま再実行できる必要があるため）。
 *   2. user_id を必須にする。書き込み側（push-to-zeus）が必須にしているものを、
 *      消す側で緩めない。他の利用者のデータを消せないようにする絞り込みでもある。
 *   3. IDは UUID の形だけを受け付ける。カンマや記号を混ぜて絞り込みを広げられないようにする。
 *   4. 紐付け（zeus_item_projects）は ON DELETE CASCADE で自動的に消えるため、
 *      ここでは触らない（sql_setup_phase1.sql の実物で確認）。
 *
 * スコープ外：
 *   Notion inbox 側のページ削除。ここは Zeus の索引だけを消す。
 */

import { dbSelect, dbDelete } from "../../_shared/supabase.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1回の問い合わせに載せるIDの数。長すぎるURLになるのを避けるために分ける。
const CHUNK = 50;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

  const { user_id, item_id, item_ids } = body || {};

  if (!user_id || typeof user_id !== "string") {
    return json({ error: "user_id required" }, 400);
  }

  // item_id（1件）と item_ids（複数）のどちらでも受ける
  let requested = [];
  if (Array.isArray(item_ids)) requested = item_ids;
  else if (item_id) requested = [item_id];

  requested = requested.filter(v => typeof v === "string").map(v => v.trim());
  if (requested.length === 0) {
    return json({ error: "item_id or item_ids required" }, 400);
  }

  // 重複を落としてから、形の正しいものだけを対象にする
  const uniq    = [...new Set(requested)];
  const valid   = uniq.filter(v => UUID_RE.test(v));
  const invalid = uniq.filter(v => !UUID_RE.test(v));

  if (valid.length === 0) {
    return json({
      ok: false,
      error: "no valid item id",
      requested: uniq.length,
      invalid,
    }, 400);
  }

  const userFilter = `user_id=eq.${encodeURIComponent(user_id)}`;

  const deleted   = [];
  const not_found = [];

  try {
    for (const ids of chunk(valid, CHUNK)) {
      // 先に「その利用者のものとして存在するID」を確かめる。
      // 確かめた分だけを消し、残りは not_found として返す。
      const rows = await dbSelect(
        env,
        "zeus_items",
        `select=id&${userFilter}&id=in.(${ids.join(",")})`,
      );
      const found = (rows || []).map(r => r.id);
      const foundSet = new Set(found.map(v => String(v).toLowerCase()));

      for (const id of ids) {
        if (!foundSet.has(id.toLowerCase())) not_found.push(id);
      }

      if (found.length > 0) {
        // 紐付け（zeus_item_projects）は ON DELETE CASCADE で一緒に消える
        await dbDelete(env, "zeus_items", `${userFilter}&id=in.(${found.join(",")})`);
        deleted.push(...found);
      }
    }
  } catch (e) {
    // 途中で落ちても、そこまでに消えたIDは返す（掃除の再実行で二重に数えないため）
    return json({
      ok: false,
      error: "delete failed",
      detail: String(e && e.message ? e.message : e).slice(0, 300),
      requested: uniq.length,
      deleted,
      not_found,
      invalid,
    }, 500);
  }

  return json({
    ok: true,
    requested: uniq.length,
    deleted_count: deleted.length,
    deleted,
    not_found,
    invalid,
  });
}

/**
 * GET は反映の確認だけに使う。
 * 認証なしで開ける代わりに、データも件数も設定の値も一切返さない。
 */
export async function onRequestGet() {
  return json({
    この口: "索引の削除",
    使い方: "POST で呼びます",
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
