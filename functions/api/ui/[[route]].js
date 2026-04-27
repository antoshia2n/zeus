/**
 * Zeus v2 UI API（ブラウザ管理画面用）
 * 認証: Authorization: Bearer {Firebase ID Token}
 *
 * MCP 用の /api/internal/* とは別エンドポイント。
 * Firebase ID トークンを検証して uid を取り出し、同じハンドラを呼ぶ。
 */

import { dbSelect, dbInsert, dbUpdate, dbDelete, dbRpc } from "../../_shared/supabase.js";
import { generateItemEmbedding, generateEmbedding } from "../../_shared/embedding.js";
import { detectItemType } from "../../_shared/item-type-detector.js";
import { fetchOgMeta, extractYouTubeId } from "../../_shared/og-fetch.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ─── Firebase ID トークン検証 ────────────────────────────────────────────────

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

async function getUid(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Missing token");
  const token = auth.slice("Bearer ".length).trim();
  return verifyFirebaseToken(token, env);
}

// ─── ユーティリティ（internal と共通） ─────────────────────────────────────

function buildTree(rows, parentId = null) {
  return rows
    .filter(r => r.parent_id === parentId)
    .map(r => ({ ...r, children: buildTree(rows, r.id) }));
}

async function wouldCreateCycle(env, table, nodeId, newParentId) {
  if (nodeId === newParentId) return true;
  const rows = await dbSelect(env, table, `select=id,parent_id`);
  const childIds = new Set();
  function collect(id) {
    childIds.add(id);
    rows.filter(r => r.parent_id === id).forEach(r => collect(r.id));
  }
  collect(nodeId);
  return childIds.has(newParentId);
}

// ─── ハンドラ（uid を引数に取る） ────────────────────────────────────────────

async function handleCreateProject(uid, body, env) {
  const { name, description, parent_id, order_index } = body;
  if (!name?.trim()) return err("name required");
  const row = await dbInsert(env, "zeus_projects", {
    user_id: uid,
    name: name.trim(),
    description:  description ?? null,
    parent_id:    parent_id   ?? null,
    order_index:  order_index ?? 0,
  });
  return json({ project_id: row.id, project: row });
}

async function handleListProjects(uid, params, env) {
  const { parent_id } = params;
  let q = `user_id=eq.${encodeURIComponent(uid)}&order=order_index.asc,created_at.asc`;
  if (parent_id === "null" || parent_id === "") q += "&parent_id=is.null";
  else if (parent_id) q += `&parent_id=eq.${encodeURIComponent(parent_id)}`;
  const rows = await dbSelect(env, "zeus_projects", q);
  return json({ items: rows });
}

async function handleGetProjectTree(uid, _params, env) {
  const rows = await dbSelect(env, "zeus_projects",
    `user_id=eq.${encodeURIComponent(uid)}&order=order_index.asc,created_at.asc`
  );
  return json({ tree: buildTree(rows) });
}

async function handleGetProject(uid, params, env) {
  const { project_id } = params;
  if (!project_id) return err("project_id required");
  const [project] = await dbSelect(env, "zeus_projects", `id=eq.${project_id}&user_id=eq.${encodeURIComponent(uid)}`);
  if (!project) return err("not found", 404);

  const rels = await dbSelect(env, "zeus_item_projects", `project_id=eq.${project_id}&select=item_id`);
  const ids = rels.map(r => r.item_id);
  let items = [];
  if (ids.length > 0) {
    items = await dbSelect(env, "zeus_items", `id=in.(${ids.join(",")})&order=updated_at.desc`);
  }
  const children = await dbSelect(env, "zeus_projects", `parent_id=eq.${project_id}&order=order_index.asc`);
  return json({ project, items, children });
}

async function handleUpdateProject(uid, body, env) {
  const { project_id, name, description, parent_id, order_index } = body;
  if (!project_id) return err("project_id required");
  if (parent_id !== undefined && parent_id !== null) {
    if (await wouldCreateCycle(env, "zeus_projects", project_id, parent_id))
      return err("循環参照が発生するため移動できません", 400);
  }
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined)        patch.name        = name;
  if (description !== undefined) patch.description = description;
  if (parent_id !== undefined)   patch.parent_id   = parent_id;
  if (order_index !== undefined) patch.order_index = order_index;
  await dbUpdate(env, "zeus_projects", `id=eq.${project_id}&user_id=eq.${encodeURIComponent(uid)}`, patch);
  return json({ ok: true });
}

async function handleDeleteProject(uid, body, env) {
  const { project_id } = body;
  if (!project_id) return err("project_id required");
  await dbDelete(env, "zeus_projects", `id=eq.${project_id}&user_id=eq.${encodeURIComponent(uid)}`);
  return json({ ok: true });
}

async function handleCreateFolder(uid, body, env) {
  const { name, parent_id } = body;
  if (!name?.trim()) return err("name required");
  const row = await dbInsert(env, "zeus_folders", {
    user_id: uid, name: name.trim(), parent_id: parent_id ?? null, order_index: 0,
  });
  return json({ folder_id: row.id, folder: row });
}

async function handleGetFolderTree(uid, _params, env) {
  const rows = await dbSelect(env, "zeus_folders",
    `user_id=eq.${encodeURIComponent(uid)}&order=order_index.asc,created_at.asc`
  );
  return json({ tree: buildTree(rows) });
}

async function handleUpdateFolder(uid, body, env) {
  const { folder_id, name, parent_id, order_index } = body;
  if (!folder_id) return err("folder_id required");
  if (parent_id !== undefined && parent_id !== null) {
    if (await wouldCreateCycle(env, "zeus_folders", folder_id, parent_id))
      return err("循環参照が発生するため移動できません", 400);
  }
  const patch = {};
  if (name !== undefined)        patch.name        = name;
  if (parent_id !== undefined)   patch.parent_id   = parent_id;
  if (order_index !== undefined) patch.order_index = order_index;
  await dbUpdate(env, "zeus_folders", `id=eq.${folder_id}&user_id=eq.${encodeURIComponent(uid)}`, patch);
  return json({ ok: true });
}

async function handleDeleteFolder(uid, body, env) {
  const { folder_id } = body;
  if (!folder_id) return err("folder_id required");
  await dbDelete(env, "zeus_folders", `id=eq.${folder_id}&user_id=eq.${encodeURIComponent(uid)}`);
  return json({ ok: true });
}

async function handleCreateItem(uid, body, env) {
  const {
    title, content, source_url, file_url,
    item_type: providedType, folder_id, project_ids,
    source_app = "manual", mime_type,
  } = body;

  const item_type = providedType || detectItemType({ source_url, file_url, content, mime_type });

  let metadata = {};
  let resolvedTitle   = title   ?? null;
  let resolvedContent = content ?? null;

  if (item_type === "web_clip" || item_type === "video_link") {
    try {
      const og = await fetchOgMeta(source_url);
      metadata = { ...og };
      if (!resolvedTitle   && og.title)       resolvedTitle   = og.title;
      if (!resolvedContent && og.description) resolvedContent = og.description;
      if (item_type === "video_link") {
        const vid = extractYouTubeId(source_url);
        if (vid) metadata.video_id = vid;
      }
    } catch { /* ignore */ }
  }

  let embedding = null;
  try {
    embedding = await generateItemEmbedding({ title: resolvedTitle, content: resolvedContent }, env);
  } catch (e) {
    console.error("[createItem] embedding failed:", e.message);
  }

  const row = await dbInsert(env, "zeus_items", {
    user_id: uid,
    folder_id:   folder_id ?? null,
    item_type,
    title:       resolvedTitle,
    content:     resolvedContent,
    source_url:  source_url ?? null,
    file_url:    file_url   ?? null,
    metadata,
    embedding,
    source_app,
  });

  if (Array.isArray(project_ids) && project_ids.length > 0) {
    await Promise.all(
      project_ids.map(pid =>
        dbInsert(env, "zeus_item_projects", { item_id: row.id, project_id: pid }).catch(() => {})
      )
    );
  }

  return json({ item_id: row.id, item: row });
}

async function handleListItems(uid, params, env) {
  const { folder_id, project_id, item_type, limit = "50", offset = "0" } = params;

  if (project_id) {
    const rels = await dbSelect(env, "zeus_item_projects", `project_id=eq.${project_id}&select=item_id`);
    const ids = rels.map(r => r.item_id);
    if (ids.length === 0) return json({ items: [], total: 0 });
    let q = `id=in.(${ids.join(",")})&order=updated_at.desc&limit=${limit}&offset=${offset}`;
    if (item_type) q += `&item_type=eq.${item_type}`;
    const its = await dbSelect(env, "zeus_items", q);
    return json({ items: its, total: ids.length });
  }

  let q = `user_id=eq.${encodeURIComponent(uid)}&order=updated_at.desc&limit=${limit}&offset=${offset}`;
  if (folder_id === "null") q += "&folder_id=is.null";
  else if (folder_id)       q += `&folder_id=eq.${folder_id}`;
  if (item_type)            q += `&item_type=eq.${item_type}`;
  const its = await dbSelect(env, "zeus_items", q);
  return json({ items: its, total: its.length });
}

async function handleGetItem(uid, params, env) {
  const { item_id } = params;
  if (!item_id) return err("item_id required");
  const [item] = await dbSelect(env, "zeus_items", `id=eq.${item_id}&user_id=eq.${encodeURIComponent(uid)}`);
  if (!item) return err("not found", 404);
  const rels = await dbSelect(env, "zeus_item_projects", `item_id=eq.${item_id}&select=project_id`);
  const pids = rels.map(r => r.project_id);
  let projs = [];
  if (pids.length > 0) projs = await dbSelect(env, "zeus_projects", `id=in.(${pids.join(",")})`);
  return json({ item, projects: projs });
}

async function handleUpdateItem(uid, body, env) {
  const { item_id, title, content, source_url, file_url, folder_id, metadata } = body;
  if (!item_id) return err("item_id required");

  const patch = { updated_at: new Date().toISOString() };
  const needsReembed = title !== undefined || content !== undefined;

  if (title      !== undefined) patch.title      = title;
  if (content    !== undefined) patch.content    = content;
  if (source_url !== undefined) patch.source_url = source_url;
  if (file_url   !== undefined) patch.file_url   = file_url;
  if (folder_id  !== undefined) patch.folder_id  = folder_id;
  if (metadata   !== undefined) patch.metadata   = metadata;

  if (needsReembed) {
    const [existing] = await dbSelect(env, "zeus_items", `id=eq.${item_id}&select=title,content`);
    try {
      patch.embedding = await generateItemEmbedding({
        title:   title   ?? existing?.title,
        content: content ?? existing?.content,
      }, env);
    } catch (e) { console.error("[updateItem] embed failed:", e.message); }
  }

  await dbUpdate(env, "zeus_items", `id=eq.${item_id}&user_id=eq.${encodeURIComponent(uid)}`, patch);
  return json({ ok: true });
}

async function handleDeleteItem(uid, body, env) {
  const { item_id } = body;
  if (!item_id) return err("item_id required");
  await dbDelete(env, "zeus_items", `id=eq.${item_id}&user_id=eq.${encodeURIComponent(uid)}`);
  return json({ ok: true });
}

async function handleMoveItem(uid, body, env) {
  const { item_id, folder_id } = body;
  if (!item_id) return err("item_id required");
  await dbUpdate(env, "zeus_items", `id=eq.${item_id}&user_id=eq.${encodeURIComponent(uid)}`, {
    folder_id: folder_id ?? null, updated_at: new Date().toISOString(),
  });
  return json({ ok: true });
}

async function handleLinkProject(uid, body, env) {
  const { item_id, project_id } = body;
  if (!item_id || !project_id) return err("item_id and project_id required");
  await dbInsert(env, "zeus_item_projects", { item_id, project_id }).catch(() => {});
  return json({ ok: true });
}

async function handleUnlinkProject(uid, body, env) {
  const { item_id, project_id } = body;
  if (!item_id || !project_id) return err("item_id and project_id required");
  await dbDelete(env, "zeus_item_projects", `item_id=eq.${item_id}&project_id=eq.${project_id}`);
  return json({ ok: true });
}

async function handleListProjectsForItem(uid, params, env) {
  const { item_id } = params;
  if (!item_id) return err("item_id required");
  const rels = await dbSelect(env, "zeus_item_projects", `item_id=eq.${item_id}&select=project_id`);
  const pids = rels.map(r => r.project_id);
  let projs = [];
  if (pids.length > 0) projs = await dbSelect(env, "zeus_projects", `id=in.(${pids.join(",")})`);
  return json({ items: projs });
}

async function handleSetItemProjects(uid, body, env) {
  const { item_id, project_ids } = body;
  if (!item_id || !Array.isArray(project_ids)) return err("item_id and project_ids required");
  await dbDelete(env, "zeus_item_projects", `item_id=eq.${item_id}`);
  await Promise.all(
    project_ids.map(pid =>
      dbInsert(env, "zeus_item_projects", { item_id, project_id: pid }).catch(() => {})
    )
  );
  return json({ ok: true });
}

async function handleSearchItems(uid, body, env) {
  const { query, project_id, item_types, limit = 20 } = body;
  if (!query?.trim()) return err("query required");

  let embedding;
  try {
    embedding = await generateEmbedding(query.trim(), env);
  } catch (e) {
    return err(`Embedding failed: ${e.message}`, 502);
  }

  const results = await dbRpc(env, "zeus_match_items", {
    query_embedding:  embedding,
    match_user_id:    uid,
    match_count:      Math.min(Number(limit) || 20, 50),
    match_project_id: project_id ?? null,
    match_item_types: item_types && item_types.length > 0 ? item_types : null,
  });

  const ids = results.map(r => r.id);
  let projectMap = {};
  if (ids.length > 0) {
    const rels = await dbSelect(env, "zeus_item_projects", `item_id=in.(${ids.join(",")})&select=item_id,project_id`);
    const pids = [...new Set(rels.map(r => r.project_id))];
    let projs = [];
    if (pids.length > 0) projs = await dbSelect(env, "zeus_projects", `id=in.(${pids.join(",")})&select=id,name`);
    const projById = Object.fromEntries(projs.map(p => [p.id, p]));
    for (const rel of rels) {
      if (!projectMap[rel.item_id]) projectMap[rel.item_id] = [];
      if (projById[rel.project_id]) projectMap[rel.item_id].push(projById[rel.project_id]);
    }
  }

  return json({
    items: results.map(r => ({
      ...r,
      snippet:  (r.content || "").slice(0, 200),
      projects: projectMap[r.id] || [],
    }))
  });
}

// ─── ルーティング ─────────────────────────────────────────────────────────────

const ROUTES = {
  "create-project":         (uid, b, p, e) => handleCreateProject(uid, b, e),
  "list-projects":          (uid, b, p, e) => handleListProjects(uid, p, e),
  "get-project-tree":       (uid, b, p, e) => handleGetProjectTree(uid, p, e),
  "get-project":            (uid, b, p, e) => handleGetProject(uid, p, e),
  "update-project":         (uid, b, p, e) => handleUpdateProject(uid, b, e),
  "delete-project":         (uid, b, p, e) => handleDeleteProject(uid, b, e),
  "create-folder":          (uid, b, p, e) => handleCreateFolder(uid, b, e),
  "get-folder-tree":        (uid, b, p, e) => handleGetFolderTree(uid, p, e),
  "update-folder":          (uid, b, p, e) => handleUpdateFolder(uid, b, e),
  "delete-folder":          (uid, b, p, e) => handleDeleteFolder(uid, b, e),
  "create-item":            (uid, b, p, e) => handleCreateItem(uid, b, e),
  "list-items":             (uid, b, p, e) => handleListItems(uid, p, e),
  "get-item":               (uid, b, p, e) => handleGetItem(uid, p, e),
  "update-item":            (uid, b, p, e) => handleUpdateItem(uid, b, e),
  "delete-item":            (uid, b, p, e) => handleDeleteItem(uid, b, e),
  "move-item-to-folder":    (uid, b, p, e) => handleMoveItem(uid, b, e),
  "link-item-to-project":   (uid, b, p, e) => handleLinkProject(uid, b, e),
  "unlink-item-from-project":(uid,b, p, e) => handleUnlinkProject(uid, b, e),
  "list-projects-for-item": (uid, b, p, e) => handleListProjectsForItem(uid, p, e),
  "set-item-projects":      (uid, b, p, e) => handleSetItemProjects(uid, b, e),
  "search-items":           (uid, b, p, e) => handleSearchItems(uid, b, e),
};

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  let uid;
  try {
    uid = await getUid(request, env);
  } catch (e) {
    return json({ error: "unauthorized: " + e.message }, 401);
  }

  const route = Array.isArray(params.route) ? params.route.join("/") : (params.route || "");
  const handler = ROUTES[route];
  if (!handler) return json({ error: `unknown route: ${route}` }, 404);

  try {
    const url = new URL(request.url);
    const queryParams = {};
    url.searchParams.forEach((v, k) => { queryParams[k] = v; });

    let body = {};
    if (request.method === "POST") {
      try { body = await request.json(); } catch { body = {}; }
    } else {
      body = queryParams;
    }

    return await handler(uid, body, queryParams, env);
  } catch (e) {
    console.error(`[zeus ui/${route}]`, e);
    return json({ error: e.message || "internal error" }, 500);
  }
}
