/**
 * Zeus v2 内部 API キャッチオールハンドラ
 * 認証: Authorization: Bearer {ZEUS_INTERNAL_SECRET}
 *
 * ルーティング: /api/internal/{route} → handlers[route]
 */

import { dbSelect, dbInsert, dbUpdate, dbDelete, dbRpc } from "../../_shared/supabase.js";
import { generateItemEmbedding, generateEmbedding } from "../../_shared/embedding.js";
import { detectItemType } from "../../_shared/item-type-detector.js";
import { fetchOgMeta, extractYouTubeId } from "../../_shared/og-fetch.js";

// ─── CORS ────────────────────────────────────────────────────────────────────

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

// ─── AUTH ────────────────────────────────────────────────────────────────────

function authenticate(request, env) {
  const secret = env.ZEUS_INTERNAL_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${secret}`;
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────

/**
 * ツリーを再帰構築（flat → nested）
 * パターンP: bulk INSERT するわけではないのでここは普通の再帰で OK
 */
function buildTree(rows, parentId = null) {
  return rows
    .filter(r => r.parent_id === parentId)
    .map(r => ({
      ...r,
      children: buildTree(rows, r.id),
    }));
}

/**
 * 循環参照チェック（プロジェクト・フォルダ共通）
 * node が target の子孫かどうかを確認
 */
async function wouldCreateCycle(env, table, nodeId, newParentId) {
  if (nodeId === newParentId) return true;
  const rows = await dbSelect(env, table, `select=id,parent_id&user_id=neq.dummy_ignore`);
  const childIds = new Set();
  function collect(id) {
    childIds.add(id);
    rows.filter(r => r.parent_id === id).forEach(r => collect(r.id));
  }
  collect(nodeId);
  return childIds.has(newParentId);
}

// ─── PROJECT ハンドラ ─────────────────────────────────────────────────────────

async function createProject(body, env) {
  const { user_id, name, description, parent_id, order_index } = body;
  if (!user_id || !name?.trim()) return err("user_id and name required");
  const row = await dbInsert(env, "zeus_projects", {
    user_id,
    name: name.trim(),
    description:  description ?? null,
    parent_id:    parent_id   ?? null,
    order_index:  order_index ?? 0,
  });
  return json({ project_id: row.id, project: row });
}

async function listProjects(params, env) {
  const { user_id, parent_id } = params;
  if (!user_id) return err("user_id required");
  let q = `user_id=eq.${encodeURIComponent(user_id)}&order=order_index.asc,created_at.asc`;
  if (parent_id === "null" || parent_id === "") {
    q += "&parent_id=is.null";
  } else if (parent_id) {
    q += `&parent_id=eq.${encodeURIComponent(parent_id)}`;
  }
  const rows = await dbSelect(env, "zeus_projects", q);
  return json({ items: rows });
}

async function getProjectTree(params, env) {
  const { user_id } = params;
  if (!user_id) return err("user_id required");
  const rows = await dbSelect(env, "zeus_projects",
    `user_id=eq.${encodeURIComponent(user_id)}&order=order_index.asc,created_at.asc`
  );
  return json({ tree: buildTree(rows) });
}

async function getProject(params, env) {
  const { project_id } = params;
  if (!project_id) return err("project_id required");
  const [project] = await dbSelect(env, "zeus_projects", `id=eq.${project_id}`);
  if (!project) return err("not found", 404);

  const itemRels = await dbSelect(env, "zeus_item_projects",
    `project_id=eq.${project_id}&select=item_id`
  );
  const itemIds = itemRels.map(r => r.item_id);

  let items = [];
  if (itemIds.length > 0) {
    items = await dbSelect(env, "zeus_items",
      `id=in.(${itemIds.join(",")})&order=updated_at.desc`
    );
  }

  const children = await dbSelect(env, "zeus_projects",
    `parent_id=eq.${project_id}&order=order_index.asc`
  );

  return json({ project, items, children });
}

async function updateProject(body, env) {
  const { project_id, name, description, parent_id, order_index } = body;
  if (!project_id) return err("project_id required");

  if (parent_id !== undefined && parent_id !== null) {
    const cycle = await wouldCreateCycle(env, "zeus_projects", project_id, parent_id);
    if (cycle) return err("循環参照が発生するため移動できません", 400);
  }

  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined)        patch.name        = name;
  if (description !== undefined) patch.description = description;
  if (parent_id !== undefined)   patch.parent_id   = parent_id;
  if (order_index !== undefined) patch.order_index = order_index;

  await dbUpdate(env, "zeus_projects", `id=eq.${project_id}`, patch);
  return json({ ok: true });
}

async function deleteProject(body, env) {
  const { project_id } = body;
  if (!project_id) return err("project_id required");
  // 子プロジェクトはルートへ（ON DELETE SET NULL）
  await dbDelete(env, "zeus_projects", `id=eq.${project_id}`);
  return json({ ok: true });
}

// ─── FOLDER ハンドラ ──────────────────────────────────────────────────────────

async function createFolder(body, env) {
  const { user_id, name, parent_id } = body;
  if (!user_id || !name?.trim()) return err("user_id and name required");
  const row = await dbInsert(env, "zeus_folders", {
    user_id,
    name: name.trim(),
    parent_id: parent_id ?? null,
    order_index: 0,
  });
  return json({ folder_id: row.id, folder: row });
}

async function getFolderTree(params, env) {
  const { user_id } = params;
  if (!user_id) return err("user_id required");
  const rows = await dbSelect(env, "zeus_folders",
    `user_id=eq.${encodeURIComponent(user_id)}&order=order_index.asc,created_at.asc`
  );
  return json({ tree: buildTree(rows) });
}

async function updateFolder(body, env) {
  const { folder_id, name, parent_id, order_index } = body;
  if (!folder_id) return err("folder_id required");

  if (parent_id !== undefined && parent_id !== null) {
    const cycle = await wouldCreateCycle(env, "zeus_folders", folder_id, parent_id);
    if (cycle) return err("循環参照が発生するため移動できません", 400);
  }

  const patch = {};
  if (name !== undefined)        patch.name        = name;
  if (parent_id !== undefined)   patch.parent_id   = parent_id;
  if (order_index !== undefined) patch.order_index = order_index;

  await dbUpdate(env, "zeus_folders", `id=eq.${folder_id}`, patch);
  return json({ ok: true });
}

async function deleteFolder(body, env) {
  const { folder_id } = body;
  if (!folder_id) return err("folder_id required");
  await dbDelete(env, "zeus_folders", `id=eq.${folder_id}`);
  return json({ ok: true });
}

async function moveFolder(body, env) {
  return updateFolder(body, env);
}

// ─── ITEM ハンドラ ────────────────────────────────────────────────────────────

async function createItem(body, env) {
  const {
    user_id, title, content, source_url, file_url,
    item_type: providedType, folder_id, project_ids,
    source_app = "manual", mime_type,
  } = body;
  if (!user_id) return err("user_id required");

  // 1. タイプ判定
  const item_type = providedType || detectItemType({ source_url, file_url, content, mime_type });

  // 2. メタデータ抽出
  let metadata = {};
  let resolvedTitle = title ?? null;
  let resolvedContent = content ?? null;

  if (item_type === "web_clip" || item_type === "video_link") {
    try {
      const og = await fetchOgMeta(source_url);
      metadata = { ...og };
      if (!resolvedTitle && og.title) resolvedTitle = og.title;
      if (!resolvedContent && og.description) resolvedContent = og.description;
      if (item_type === "video_link") {
        const videoId = extractYouTubeId(source_url);
        if (videoId) metadata.video_id = videoId;
      }
    } catch { /* メタデータ取得失敗は無視 */ }
  }

  // 3. Embedding 生成（失敗してもレコード保存は続ける）
  let embedding = null;
  try {
    embedding = await generateItemEmbedding(
      { title: resolvedTitle, content: resolvedContent },
      env
    );
  } catch (e) {
    console.error("[createItem] embedding failed:", e.message);
  }

  // 4. INSERT
  const row = await dbInsert(env, "zeus_items", {
    user_id,
    folder_id:   folder_id ?? null,
    item_type,
    title:       resolvedTitle,
    content:     resolvedContent,
    source_url:  source_url  ?? null,
    file_url:    file_url    ?? null,
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
        }).catch(() => { /* UNIQUE 制約違反は無視 */ })
      )
    );
  }

  return json({ item_id: row.id, item: row });
}

async function listItems(params, env) {
  const { user_id, folder_id, project_id, item_type, limit = "50", offset = "0" } = params;
  if (!user_id) return err("user_id required");

  if (project_id) {
    // プロジェクト所属のアイテムを取得
    const rels = await dbSelect(env, "zeus_item_projects",
      `project_id=eq.${project_id}&select=item_id`
    );
    const ids = rels.map(r => r.item_id);
    if (ids.length === 0) return json({ items: [], total: 0 });

    let q = `id=in.(${ids.join(",")})&order=updated_at.desc&limit=${limit}&offset=${offset}`;
    if (item_type) q += `&item_type=eq.${item_type}`;
    const items = await dbSelect(env, "zeus_items", q);
    return json({ items, total: ids.length });
  }

  let q = `user_id=eq.${encodeURIComponent(user_id)}&order=updated_at.desc&limit=${limit}&offset=${offset}`;
  if (folder_id === "null") q += "&folder_id=is.null";
  else if (folder_id)       q += `&folder_id=eq.${folder_id}`;
  if (item_type)            q += `&item_type=eq.${item_type}`;

  const items = await dbSelect(env, "zeus_items", q);
  return json({ items, total: items.length });
}

async function getItem(params, env) {
  const { item_id } = params;
  if (!item_id) return err("item_id required");
  const [item] = await dbSelect(env, "zeus_items", `id=eq.${item_id}`);
  if (!item) return err("not found", 404);

  const rels = await dbSelect(env, "zeus_item_projects",
    `item_id=eq.${item_id}&select=project_id`
  );
  const projectIds = rels.map(r => r.project_id);
  let projects = [];
  if (projectIds.length > 0) {
    projects = await dbSelect(env, "zeus_projects",
      `id=in.(${projectIds.join(",")})`
    );
  }

  return json({ item, projects });
}

async function updateItem(body, env) {
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
    // 既存レコードを取得してマージ
    const [existing] = await dbSelect(env, "zeus_items", `id=eq.${item_id}&select=title,content`);
    const merged = {
      title:   title   ?? existing?.title,
      content: content ?? existing?.content,
    };
    try {
      patch.embedding = await generateItemEmbedding(merged, env);
    } catch (e) {
      console.error("[updateItem] embedding failed:", e.message);
    }
  }

  await dbUpdate(env, "zeus_items", `id=eq.${item_id}`, patch);
  return json({ ok: true });
}

async function deleteItem(body, env) {
  const { item_id } = body;
  if (!item_id) return err("item_id required");
  await dbDelete(env, "zeus_items", `id=eq.${item_id}`);
  return json({ ok: true });
}

async function moveItemToFolder(body, env) {
  const { item_id, folder_id } = body;
  if (!item_id) return err("item_id required");
  await dbUpdate(env, "zeus_items", `id=eq.${item_id}`, {
    folder_id: folder_id ?? null,
    updated_at: new Date().toISOString(),
  });
  return json({ ok: true });
}

// ─── ITEM ↔ PROJECT ハンドラ ─────────────────────────────────────────────────

async function linkItemToProject(body, env) {
  const { item_id, project_id } = body;
  if (!item_id || !project_id) return err("item_id and project_id required");
  await dbInsert(env, "zeus_item_projects", { item_id, project_id })
    .catch(() => { /* UNIQUE 制約違反は無視（既に紐付き済み）*/ });
  return json({ ok: true });
}

async function unlinkItemFromProject(body, env) {
  const { item_id, project_id } = body;
  if (!item_id || !project_id) return err("item_id and project_id required");
  await dbDelete(env, "zeus_item_projects",
    `item_id=eq.${item_id}&project_id=eq.${project_id}`
  );
  return json({ ok: true });
}

async function listProjectsForItem(params, env) {
  const { item_id } = params;
  if (!item_id) return err("item_id required");
  const rels = await dbSelect(env, "zeus_item_projects",
    `item_id=eq.${item_id}&select=project_id`
  );
  const ids = rels.map(r => r.project_id);
  let projects = [];
  if (ids.length > 0) {
    projects = await dbSelect(env, "zeus_projects", `id=in.(${ids.join(",")})`);
  }
  return json({ items: projects });
}

async function setItemProjects(body, env) {
  const { item_id, project_ids } = body;
  if (!item_id || !Array.isArray(project_ids)) return err("item_id and project_ids required");
  // 既存を全削除して再登録
  await dbDelete(env, "zeus_item_projects", `item_id=eq.${item_id}`);
  await Promise.all(
    project_ids.map(pid =>
      dbInsert(env, "zeus_item_projects", { item_id, project_id: pid }).catch(() => {})
    )
  );
  return json({ ok: true });
}

// ─── 検索ハンドラ ─────────────────────────────────────────────────────────────

async function searchItems(body, env) {
  const { user_id, query, project_id, item_types, limit = 20 } = body;
  if (!user_id || !query?.trim()) return err("user_id and query required");

  let embedding;
  try {
    embedding = await generateEmbedding(query.trim(), env);
  } catch (e) {
    return err(`Embedding failed: ${e.message}`, 502);
  }

  const results = await dbRpc(env, "zeus_match_items", {
    query_embedding:  embedding,
    match_user_id:    user_id,
    match_count:      Math.min(Number(limit) || 20, 50),
    match_project_id: project_id ?? null,
    match_item_types: item_types && item_types.length > 0 ? item_types : null,
  });

  // 各アイテムにプロジェクト情報を付与
  const ids = results.map(r => r.id);
  let projectMap = {};
  if (ids.length > 0) {
    const rels = await dbSelect(env, "zeus_item_projects",
      `item_id=in.(${ids.join(",")})&select=item_id,project_id`
    );
    const pids = [...new Set(rels.map(r => r.project_id))];
    let projs = [];
    if (pids.length > 0) {
      projs = await dbSelect(env, "zeus_projects",
        `id=in.(${pids.join(",")})&select=id,name`
      );
    }
    const projById = Object.fromEntries(projs.map(p => [p.id, p]));
    for (const rel of rels) {
      if (!projectMap[rel.item_id]) projectMap[rel.item_id] = [];
      if (projById[rel.project_id]) projectMap[rel.item_id].push(projById[rel.project_id]);
    }
  }

  const items = results.map(r => ({
    ...r,
    snippet: (r.content || "").slice(0, 200),
    projects: projectMap[r.id] || [],
  }));

  return json({ items });
}

// ─── ルーティング ─────────────────────────────────────────────────────────────

const HANDLERS = {
  // projects
  "create-project":       (b, _p, e) => createProject(b, e),
  "list-projects":        (_b, p, e) => listProjects(p, e),
  "get-project-tree":     (_b, p, e) => getProjectTree(p, e),
  "get-project":          (_b, p, e) => getProject(p, e),
  "update-project":       (b, _p, e) => updateProject(b, e),
  "delete-project":       (b, _p, e) => deleteProject(b, e),

  // folders
  "create-folder":        (b, _p, e) => createFolder(b, e),
  "get-folder-tree":      (_b, p, e) => getFolderTree(p, e),
  "update-folder":        (b, _p, e) => updateFolder(b, e),
  "delete-folder":        (b, _p, e) => deleteFolder(b, e),
  "move-folder":          (b, _p, e) => moveFolder(b, e),

  // items
  "create-item":          (b, _p, e) => createItem(b, e),
  "list-items":           (_b, p, e) => listItems(p, e),
  "get-item":             (_b, p, e) => getItem(p, e),
  "update-item":          (b, _p, e) => updateItem(b, e),
  "delete-item":          (b, _p, e) => deleteItem(b, e),
  "move-item-to-folder":  (b, _p, e) => moveItemToFolder(b, e),

  // item ↔ project
  "link-item-to-project":   (b, _p, e) => linkItemToProject(b, e),
  "unlink-item-from-project":(b, _p, e) => unlinkItemFromProject(b, e),
  "list-projects-for-item": (_b, p, e) => listProjectsForItem(p, e),
  "set-item-projects":      (b, _p, e) => setItemProjects(b, e),

  // search
  "search-items":         (b, _p, e) => searchItems(b, e),
};

// ─── メインエントリポイント ───────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!authenticate(request, env)) {
    return json({ error: "unauthorized" }, 401);
  }

  // /api/internal/create-project → "create-project"
  const route = params.route?.join?.("/") ?? (params.route || "");

  const handler = HANDLERS[route];
  if (!handler) {
    return json({ error: `unknown route: ${route}` }, 404);
  }

  try {
    let body = {};
    let queryParams = {};

    const url = new URL(request.url);
    url.searchParams.forEach((v, k) => { queryParams[k] = v; });

    if (request.method === "POST") {
      try { body = await request.json(); } catch { body = {}; }
    } else {
      body = queryParams;
    }

    return await handler(body, queryParams, env);
  } catch (e) {
    console.error(`[zeus internal/${route}]`, e);
    return json({ error: e.message || "internal error" }, 500);
  }
}
