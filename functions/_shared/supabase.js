/**
 * Cloudflare Workers / Pages Functions 向け Supabase REST クライアント
 * ブラウザ向けの @supabase/supabase-js は Workers 環境では使わない
 */

function getSupaConfig(env) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return { url: url.replace(/\/$/, ""), key };
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
