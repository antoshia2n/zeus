/**
 * ProjectView.jsx（Phase 3 更新版）
 * Phase 3 変更点：
 *   - 右ペインを ItemDetailView コンポーネントに差し替え（タイプ別ビュー対応）
 *   - 一覧カードに YouTube サムネイルを追加
 */

import { useState, useCallback } from "react";
import { ProjectNode } from "../components/ProjectNode.jsx";
import { AddItemModal } from "../components/AddItemModal.jsx";
import { ItemDetailView } from "../components/ItemDetailView.jsx";
import { TYPE_META, ALL_TYPES } from "../constants.js";
import { useProjectTree, useItems } from "../lib/hooks.js";
import * as api from "../lib/api.js";

const T = {
  bg: "#F0EEE7", surface: "#FAFAF7", border: "#E5E2D9", muted: "#7A7769", text: "#1C1B18",
};

const PANE_L = { width: 220, flexShrink: 0 };
const PANE_C = { flex: 1, minWidth: 0 };
const PANE_R = { width: 400, flexShrink: 0, borderLeft: `1px solid ${T.border}` };

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function getYouTubeThumbnail(url) {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

export default function ProjectView({ uid, token }) {
  const { tree, reload: reloadTree } = useProjectTree(uid, token);
  const [selectedProject,      setSelectedProject]      = useState(null);
  const [selectedItem,         setSelectedItem]          = useState(null);
  const [selectedItemProjects, setSelectedItemProjects]  = useState([]);
  const [typeFilter,    setTypeFilter]    = useState(null);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching,     setSearching]     = useState(false);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [addParentId,   setAddParentId]   = useState(null);
  const [newProjName,   setNewProjName]   = useState("");
  const [showProjForm,  setShowProjForm]  = useState(false);
  const [savingProj,    setSavingProj]    = useState(false);

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
    } catch (e) { console.error("search error", e); }
    finally { setSearching(false); }
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
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  const LB_STYLE = {
    fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
    textTransform: "uppercase", color: T.muted, padding: "8px 8px 4px",
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 105px)", overflow: "hidden" }}>

      {/* 左ペイン */}
      {!isMobile && (
        <div style={{
          ...PANE_L,
          borderRight: `1px solid ${T.border}`,
          overflowY: "auto",
          padding: "8px 0",
          background: T.surface,
        }}>
          <div style={LB_STYLE}>PROJECTS</div>

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
              background: "transparent", border: "none", cursor: "pointer", color: T.muted,
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
                onKeyDown={e => {
                  if (e.key === "Enter")  handleSaveProject();
                  if (e.key === "Escape") setShowProjForm(false);
                }}
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

      {/* 中央ペイン */}
      <div style={{ ...PANE_C, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${T.border}`,
          background: T.surface, flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {selectedProject ? selectedProject.name : "すべて"}
          </div>

          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              style={{
                flex: 1, padding: "6px 10px", fontSize: 12,
                border: `1px solid ${T.border}`, borderRadius: 4, outline: "none",
              }}
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
                  color:      typeFilter === (t?.id ?? null) ? "#FFF" : T.muted,
                  border: `1px solid ${T.border}`, borderRadius: 20, cursor: "pointer",
                }}
              >
                {t ? `${t.icon} ${t.label}` : "すべて"}
              </button>
            ))}
          </div>
        </div>

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
              const meta       = TYPE_META[item.item_type] || {};
              const isSelected = selectedItem?.id === item.id;
              const ytThumb    = item.item_type === "video_link"
                ? getYouTubeThumbnail(item.source_url)
                : null;

              return (
                <div
                  key={item.id}
                  style={{
                    background: "#FFF", border: `1px solid ${isSelected ? "#1C1B18" : T.border}`,
                    borderRadius: 6, padding: 12, marginBottom: 6, cursor: "pointer",
                    overflow: "hidden",
                  }}
                  onClick={() => handleSelectItem(item)}
                >
                  {/* YouTube サムネイル */}
                  {ytThumb && (
                    <img
                      src={ytThumb}
                      alt=""
                      style={{
                        width: "100%", height: 80, objectFit: "cover",
                        borderRadius: 4, marginBottom: 8, display: "block",
                      }}
                      onError={e => { e.target.style.display = "none"; }}
                    />
                  )}

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
                  <div style={{
                    fontSize: 13, fontWeight: 600, marginBottom: 3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.title || "(無題)"}
                  </div>
                  {item.content && (
                    <div style={{
                      fontSize: 11, color: T.muted,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.content}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右ペイン（Phase 3: ItemDetailView に差し替え） */}
      {selectedItem && !isMobile && (
        <div style={{ ...PANE_R, overflowY: "auto" }}>
          <ItemDetailView
            uid={uid}
            token={token}
            item={selectedItem}
            projects={selectedItemProjects}
            onSaved={handleItemSaved}
            onDeleted={handleItemDeleted}
          />
        </div>
      )}

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
