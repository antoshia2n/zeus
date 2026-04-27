import { useState, useCallback } from "react";
import { ProjectNode } from "../components/ProjectNode.jsx";
import { AddItemModal } from "../components/AddItemModal.jsx";
import { TYPE_META, ALL_TYPES } from "../constants.js";
import { useProjectTree, useItems } from "../lib/hooks.js";
import * as api from "../lib/api.js";

const T = {
  bg:      "#F0EEE7",
  surface: "#FAFAF7",
  border:  "#E5E2D9",
  muted:   "#7A7769",
  text:    "#1C1B18",
};

const PANE_L = { width: 220, flexShrink: 0 };
const PANE_C = { flex: 1, minWidth: 0 };
const PANE_R = { width: 380, flexShrink: 0, borderLeft: `1px solid ${T.border}` };

const card = {
  background: "#FFFFFF",
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: 12,
  marginBottom: 6,
  cursor: "pointer",
};

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── 右ペイン：アイテム詳細・編集 ────────────────────────────────────────────

function ItemDetail({ uid, token, item, projects: allProjects, onSaved, onDeleted }) {
  const [title,   setTitle]   = useState(item.title   ?? "");
  const [content, setContent] = useState(item.content ?? "");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  const typeMeta = TYPE_META[item.item_type] || {};

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await api.items.update({
        item_id: item.id,
        title:   title.trim()   || null,
        content: content.trim() || null,
      }, token);
      setMsg({ ok: true, text: "保存しました" });
      onSaved({ ...item, title: title.trim(), content: content.trim() });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`「${item.title || "(無題)"}」を削除しますか？`)) return;
    await api.items.delete({ item_id: item.id }, token);
    onDeleted(item.id);
  }

  const S = {
    root:  { padding: 16, height: "100%", overflowY: "auto" },
    badge: {
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
      background: "#F0EEE7", color: T.muted, marginBottom: 10, display: "inline-block",
    },
    lb: { fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: T.muted, marginBottom: 4, display: "block" },
    inp: { width: "100%", padding: "6px 8px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 4, fontFamily: "inherit", outline: "none" },
    meta: { fontSize: 11, color: T.muted, lineHeight: 1.6, wordBreak: "break-all" },
  };

  return (
    <div style={S.root}>
      <div style={S.badge}>{typeMeta.icon} {typeMeta.label}</div>

      <div style={{ marginBottom: 12 }}>
        <label style={S.lb}>TITLE</label>
        <input style={S.inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="(無題)" />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={S.lb}>CONTENT</label>
        <textarea
          style={{ ...S.inp, minHeight: 160, resize: "vertical", lineHeight: 1.6 }}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>

      {item.source_url && (
        <div style={{ marginBottom: 12 }}>
          <label style={S.lb}>SOURCE URL</label>
          <div style={S.meta}>
            <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: "#2F54C8" }}>
              {item.source_url}
            </a>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={S.lb}>所属プロジェクト</label>
        <div style={{ fontSize: 12, color: T.muted }}>
          {allProjects?.length > 0
            ? allProjects.map(p => (
                <span key={p.id} style={{
                  display: "inline-block", margin: "2px 4px 2px 0",
                  padding: "2px 8px", background: "#F0EEE7", borderRadius: 20, fontSize: 11,
                }}>
                  {p.name}
                </span>
              ))
            : "(未所属)"}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={S.lb}>更新日時</label>
        <div style={S.meta}>{formatDate(item.updated_at)}</div>
      </div>

      {msg && (
        <div style={{ fontSize: 12, color: msg.ok ? "#256E45" : "#B8302A", marginBottom: 8 }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "7px 16px", fontSize: 12, fontWeight: 600,
            background: "#1C1B18", color: "#FFFFFF",
            border: "none", borderRadius: 4, cursor: "pointer", opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={handleDelete}
          style={{
            padding: "7px 12px", fontSize: 12,
            background: "transparent", color: "#B8302A",
            border: `1px solid #B8302A`, borderRadius: 4, cursor: "pointer",
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

// ─── メイン ──────────────────────────────────────────────────────────────────

export default function ProjectView({ uid, token }) {
  const { tree, reload: reloadTree } = useProjectTree(uid, token);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedItem,    setSelectedItem]     = useState(null);
  const [selectedItemProjects, setSelectedItemProjects] = useState([]);
  const [typeFilter, setTypeFilter]   = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching]     = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addParentId, setAddParentId]  = useState(null);
  const [newProjName, setNewProjName]  = useState("");
  const [showProjForm, setShowProjForm] = useState(false);
  const [savingProj, setSavingProj]    = useState(false);

  const { items, setItems, reload: reloadItems } = useItems(uid, token, {
    projectId: selectedProject?.id,
    itemType:  typeFilter,
  });

  async function handleSelectProject(proj) {
    setSelectedProject(proj);
    setSelectedItem(null);
    setSearchResults(null);
    setSearchQuery("");
  }

  async function handleSelectAll() {
    setSelectedProject(null);
    setSelectedItem(null);
    setSearchResults(null);
    setSearchQuery("");
  }

  async function handleSelectItem(item) {
    setSelectedItem(item);
    try {
      const res = await api.itemProjects.list({ item_id: item.id }, token);
      setSelectedItemProjects(res.items || []);
    } catch { setSelectedItemProjects([]); }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const body = {
        user_id: uid,
        query:   searchQuery.trim(),
        ...(selectedProject && { project_id: selectedProject.id }),
      };
      const res = await api.search.items(body, token);
      setSearchResults(res.items || []);
    } catch (e) {
      console.error("search error", e);
    } finally {
      setSearching(false);
    }
  }

  async function handleAddProject(parentId = null) {
    setAddParentId(parentId);
    setShowProjForm(true);
    setNewProjName("");
  }

  async function handleSaveProject() {
    if (!newProjName.trim()) return;
    setSavingProj(true);
    try {
      await api.projects.create({ user_id: uid, name: newProjName.trim(), parent_id: addParentId }, token);
      setShowProjForm(false);
      reloadTree();
    } catch (e) { console.error(e); }
    setSavingProj(false);
  }

  function handleItemCreated(item) {
    setItems(prev => [item, ...prev]);
    reloadTree();
  }

  function handleItemSaved(updated) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setSelectedItem(updated);
  }

  function handleItemDeleted(id) {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelectedItem(null);
    reloadTree();
  }

  const displayItems = searchResults ?? items;

  // ─── スマホ判定（640px）────────────────────────────────────────────────
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  // ─── レンダリング ──────────────────────────────────────────────────────

  const LB_STYLE = { fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: T.muted, padding: "8px 8px 4px" };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 105px)", overflow: "hidden" }}>

      {/* 左ペイン：プロジェクトツリー */}
      {!isMobile && (
        <div style={{
          ...PANE_L,
          borderRight: `1px solid ${T.border}`,
          overflowY: "auto",
          padding: "8px 0",
          background: T.surface,
        }}>
          <div style={LB_STYLE}>PROJECTS</div>

          {/* すべて */}
          <div
            style={{
              padding: "5px 8px 5px 24px", fontSize: 13, cursor: "pointer", borderRadius: 4,
              background: !selectedProject ? "#1C1B18" : "transparent",
              color: !selectedProject ? "#FFFFFF" : T.text,
            }}
            onClick={handleSelectAll}
          >
            すべて
          </div>

          {tree.map(node => (
            <ProjectNode
              key={node.id}
              node={node}
              selectedId={selectedProject?.id}
              onSelect={handleSelectProject}
              onAdd={handleAddProject}
            />
          ))}

          <button
            onClick={() => handleAddProject(null)}
            style={{
              display: "block", width: "100%", padding: "6px 8px",
              marginTop: 8, fontSize: 12, textAlign: "left",
              background: "transparent", border: "none", cursor: "pointer",
              color: T.muted,
            }}
          >
            + プロジェクト追加
          </button>

          {showProjForm && (
            <div style={{ padding: "8px 8px 0" }}>
              <input
                autoFocus
                style={{
                  width: "100%", padding: "5px 8px", fontSize: 12,
                  border: `1px solid ${T.border}`, borderRadius: 4, marginBottom: 4,
                }}
                value={newProjName}
                onChange={e => setNewProjName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveProject(); if (e.key === "Escape") setShowProjForm(false); }}
                placeholder="プロジェクト名"
              />
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  style={{ padding: "3px 10px", fontSize: 11, background: "#1C1B18", color: "#FFF", border: "none", borderRadius: 3, cursor: "pointer" }}
                  onClick={handleSaveProject} disabled={savingProj}
                >
                  追加
                </button>
                <button
                  style={{ padding: "3px 10px", fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 3, cursor: "pointer" }}
                  onClick={() => setShowProjForm(false)}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 中央ペイン：データ一覧 */}
      <div style={{ ...PANE_C, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ヘッダー */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {selectedProject ? selectedProject.name : "すべて"}
          </div>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, outline: "none" }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="意味検索..."
            />
            <button
              type="submit"
              style={{ padding: "6px 14px", fontSize: 12, background: "#1C1B18", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer" }}
              disabled={searching}
            >
              {searching ? "..." : "検索"}
            </button>
            {searchResults && (
              <button
                type="button"
                style={{ padding: "6px 10px", fontSize: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 4, cursor: "pointer" }}
                onClick={() => { setSearchResults(null); setSearchQuery(""); }}
              >
                ✕
              </button>
            )}
          </form>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => setShowAddModal(true)}
              style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, background: "#1C1B18", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer" }}
            >
              + データ追加
            </button>
            {[null, ...ALL_TYPES].map(t => (
              <button
                key={t?.id ?? "all"}
                onClick={() => setTypeFilter(t?.id ?? null)}
                style={{
                  padding: "3px 10px", fontSize: 10, fontWeight: 600,
                  background: typeFilter === (t?.id ?? null) ? "#1C1B18" : "transparent",
                  color: typeFilter === (t?.id ?? null) ? "#FFF" : T.muted,
                  border: `1px solid ${T.border}`, borderRadius: 20, cursor: "pointer",
                }}
              >
                {t ? `${t.icon} ${t.label}` : "すべて"}
              </button>
            ))}
          </div>
        </div>

        {/* リスト */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {searchResults && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
              検索結果: {searchResults.length} 件
            </div>
          )}
          {displayItems.length === 0 ? (
            <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "32px 0" }}>
              データがありません
            </div>
          ) : (
            displayItems.map(item => {
              const meta = TYPE_META[item.item_type] || {};
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  style={{ ...card, borderColor: isSelected ? "#1C1B18" : T.border }}
                  onClick={() => handleSelectItem(item)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{meta.label}</span>
                    {item.similarity !== undefined && (
                      <span style={{ fontSize: 10, color: "#2F54C8", fontFamily: "DM Mono, monospace" }}>
                        {(item.similarity * 100).toFixed(1)}%
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.muted }}>
                      {formatDate(item.updated_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title || "(無題)"}
                  </div>
                  {item.content && (
                    <div style={{ fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.content}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右ペイン：詳細 */}
      {selectedItem && !isMobile && (
        <div style={{ ...PANE_R, overflowY: "auto" }}>
          <ItemDetail
            uid={uid}
            token={token}
            item={selectedItem}
            projects={selectedItemProjects}
            onSaved={handleItemSaved}
            onDeleted={handleItemDeleted}
          />
        </div>
      )}

      {/* データ追加モーダル */}
      {showAddModal && (
        <AddItemModal
          uid={uid}
          token={token}
          projectId={selectedProject?.id}
          onClose={() => setShowAddModal(false)}
          onCreated={handleItemCreated}
        />
      )}
    </div>
  );
}
