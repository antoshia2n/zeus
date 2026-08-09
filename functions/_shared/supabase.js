/**
 * Cloudflare Workers / Pages Functions 向け Supabase REST クライアント
 * ブラウザ向けの @supabase/supabase-js は Workers 環境では使わない
 *
 * 2026-07-31 変更：公開キー（VITE_SUPABASE_ANON_KEY）から管理者キーへ切り替え。
 *   正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 *         https://www.notion.so/3ad9c6c1c439811aadd3e0be32827b62
 *   ここはブラウザではなくサーバー側の処理なので、管理者キーを使ってよい場所。
 *   管理者キーは Cloudflare の設定にのみ存在し、ブラウザには渡らない。
 *
 *   公開キーへの自動フォールバックは意図的に入れていない。
 *   キーが無いまま黙って動き続けると、権限を外した瞬間に
 *   「エラーも出さずに0件を返す」状態になるため（2026-07-29 の Zeus 全面停止と同じ症状）。
 */

function getSupaConfig(env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Supabase URL not configured (SUPABASE_URL / VITE_SUPABASE_URL)");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY not configured. " +
      "Cloudflare の設定に管理者キーを追加してください。",
    );
  }
  return { url, key };
}

function headers(key) {
  return {
    "Content-Type": "application/json",
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Prefer":        "return=representation",
  };
}

/**
 * REST: SELECT
 * @param {Env} env
 * @param {string} table
 * @param {string} query - クエリ文字列（例: "user_id=eq.xxx&order=created_at.desc"）
 * @returns {Promise<any[]>}
 */
export async function dbSelect(env, table, query = "") {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { ...headers(key), Prefer: "" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase SELECT ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * REST: INSERT（1件）
 * @returns {Promise<any>} 挿入されたレコード
 */
export async function dbInsert(env, table, row) {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method:  "POST",
    headers: headers(key),
    body:    JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase INSERT ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

/**
 * REST: INSERT（複数件・分割送信）
 *
 * 2026-08-09 追加：Notion 取り込みが公開キーで直接 INSERT していたため、
 *   ここへ寄せて管理者キー経由に統一する。
 *   1回のリクエストが大きくなりすぎないよう既定 50 件ずつに分ける
 *   （分ける件数は元の実装と同じ）。
 *
 * @param {Env} env
 * @param {string} table
 * @param {any[]} rows
 * @param {number} batchSize
 * @returns {Promise<any[]>} 挿入されたレコードの配列
 */
export async function dbInsertMany(env, table, rows, batchSize = 50) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const { url, key } = getSupaConfig(env);
  const out = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method:  "POST",
      headers: headers(key),
      body:    JSON.stringify(batch),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`supabase INSERT ${table} ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    out.push(...(Array.isArray(data) ? data : [data]));
  }
  return out;
}

/**
 * REST: PATCH（条件指定 UPDATE）
 * @param {string} filter - 例: "id=eq.xxx"
 */
export async function dbUpdate(env, table, filter, patch) {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method:  "PATCH",
    headers: headers(key),
    body:    JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase PATCH ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

/**
 * REST: DELETE（条件指定）
 */
export async function dbDelete(env, table, filter) {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method:  "DELETE",
    headers: { ...headers(key), Prefer: "" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase DELETE ${table} ${res.status}: ${body.slice(0, 300)}`);
  }
  return { ok: true };
}

/**
 * REST: RPC
 */
export async function dbRpc(env, fn, params) {
  const { url, key } = getSupaConfig(env);
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method:  "POST",
    headers: { ...headers(key), Prefer: "" },
    body:    JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`supabase RPC ${fn} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * 設定の有無だけを返す（値は返さない）。確認用ページから使う。
 */
export function checkSupaConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const missing = [];
  if (!url) missing.push("データベースの住所");
  if (!key) missing.push("管理者キー");
  return {
    ok: missing.length === 0,
    detail: missing.length ? `設定が足りません：${missing.join(" / ")}` : "設定あり",
  };
}
