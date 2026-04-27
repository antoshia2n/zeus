/**
 * Zeus 内部 API クライアント（ブラウザ側）
 * ZEUS_INTERNAL_SECRET はブラウザに露出させない →
 * Cloudflare Pages Functions がそのまま通過させる（同一オリジン）
 *
 * ブラウザから /api/internal/* を叩くと CF Pages Functions が処理する。
 * SECRET は CF Pages の Runtime Binding にあるのでブラウザに見えない。
 */

// ただし管理画面（Naoki 専用）は Firebase uid をヘッダーで渡して認証する方式にする。
// CF Functions 側では ZEUS_INTERNAL_SECRET が設定されている場合は MCP からのアクセス、
// ブラウザ（同一オリジン）からは Firebase uid ベースで認証するのが理想だが、
// Phase 1 では Simple: 内部APIに browser-key として ZEUS_UI_KEY を追加するか、
// 別の /api/ui/* エンドポイントを使う。
//
// 実装方針：Phase 1 では /api/ui/* という別エンドポイントを作り、
// Firebase Auth の ID token で認証する（v1 と同じ方式）。
//
// ※ この設計は Phase 2 で整理する。Phase 1 では /api/ui/* 経由で動作確認を優先。

const BASE = "/api/ui";

async function request(path, { method = "GET", body, token } = {}) {
  const opts = {
    method,
    headers: {
      "Content-Type":  "application/json",
      ...(token && { "Authorization": `Bearer ${token}` }),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function get(path, params, token) {
  const q = params
    ? "?" + Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";
  return request(`${path}${q}`, { token });
}

function post(path, body, token) {
  return request(path, { method: "POST", body, token });
}

// ─── Projects ───────────────────────────────────────────────────────────────

export const projects = {
  create:  (body, token)    => post("/create-project",   body, token),
  list:    (params, token)  => get("/list-projects",     params, token),
  tree:    (params, token)  => get("/get-project-tree",  params, token),
  get:     (params, token)  => get("/get-project",       params, token),
  update:  (body, token)    => post("/update-project",   body, token),
  delete:  (body, token)    => post("/delete-project",   body, token),
};

// ─── Folders ────────────────────────────────────────────────────────────────

export const folders = {
  create:  (body, token)    => post("/create-folder",  body, token),
  tree:    (params, token)  => get("/get-folder-tree", params, token),
  update:  (body, token)    => post("/update-folder",  body, token),
  delete:  (body, token)    => post("/delete-folder",  body, token),
  move:    (body, token)    => post("/move-folder",    body, token),
};

// ─── Items ──────────────────────────────────────────────────────────────────

export const items = {
  create:        (body, token)   => post("/create-item",         body, token),
  list:          (params, token) => get("/list-items",           params, token),
  get:           (params, token) => get("/get-item",             params, token),
  update:        (body, token)   => post("/update-item",         body, token),
  delete:        (body, token)   => post("/delete-item",         body, token),
  moveToFolder:  (body, token)   => post("/move-item-to-folder", body, token),
};

// ─── Item ↔ Project ─────────────────────────────────────────────────────────

export const itemProjects = {
  link:        (body, token)   => post("/link-item-to-project",    body, token),
  unlink:      (body, token)   => post("/unlink-item-from-project", body, token),
  list:        (params, token) => get("/list-projects-for-item",   params, token),
  setAll:      (body, token)   => post("/set-item-projects",       body, token),
};

// ─── Search ─────────────────────────────────────────────────────────────────

export const search = {
  items: (body, token) => post("/search-items", body, token),
};
