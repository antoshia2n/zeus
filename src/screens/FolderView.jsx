import { useState } from "react";
import { FolderNode } from "../components/FolderNode.jsx";
import { AddItemModal } from "../components/AddItemModal.jsx";
import { TYPE_META } from "../constants.js";
import { useFolderTree, useItems } from "../lib/hooks.js";
import * as api from "../lib/api.js";

const T = { bg: "#F0EEE7", surface: "#FAFAF7", border: "#E5E2D9", muted: "#7A7769", text: "#1C1B18" };

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FolderView({ uid, token }) {
  const { tree, reload: reloadTree } = useFolderTree(uid, token);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [newFolderName, setNewFolderName]   = useState("");
  const [showForm, setShowForm]             = useState(false);
  const [addParentId, setAddParentId]       = useState(null);
  const [saving, setSaving]                 = useState(false);
  const [showAddModal, setShowAddModal]     = useState(false);

  const { items, setItems } = useItems(uid, token, { folderId: selectedFolder?.id });

  async function handleAddFolder(parentId = null) {
    setAddParentId(parentId);
    setShowForm(true);
    setNewFolderName("");
  }

  async function handleSaveFolder() {
    if (!newFolderName.trim()) return;
    setSaving(true);
    try {
      await api.folders.create({ user_id: uid, name: newFolderName.trim(), parent_id: addParentId }, token);
      setShowForm(false);
      reloadTree();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function handleDeleteFolder() {
    if (!selectedFolder) return;
    if (!confirm(`フォルダ「${selectedFolder.name}」を削除しますか？\n中のデータはルートへ移動されます。`)) return;
    await api.folders.delete({ folder_id: selectedFolder.id }, token);
    setSelectedFolder(null);
    reloadTree();
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 105px)", overflow: "hidden" }}>
      {/* 左ペイン：フォルダツリー */}
      <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: "auto", padding: "8px 0", background: T.surface }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: T.muted, padding: "8px 8px 4px" }}>
          FOLDERS
        </div>

        {tree.map(node => (
          <FolderNode
            key={node.id}
            node={node}
            selectedId={selectedFolder?.id}
            onSelect={setSelectedFolder}
            onAdd={handleAddFolder}
          />
        ))}

        <button
          onClick={() => handleAddFolder(null)}
          style={{ display: "block", width: "100%", padding: "6px 8px", marginTop: 8, fontSize: 12, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", color: T.muted }}
        >
          + フォルダ追加
        </button>

        {showForm && (
          <div style={{ padding: "8px 8px 0" }}>
            <input
              autoFocus
              style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, marginBottom: 4 }}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveFolder(); if (e.key === "Escape") setShowForm(false); }}
              placeholder="フォルダ名"
            />
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={handleSaveFolder} disabled={saving}
                style={{ padding: "3px 10px", fontSize: 11, background: "#1C1B18", color: "#FFF", border: "none", borderRadius: 3, cursor: "pointer" }}>
                追加
              </button>
              <button onClick={() => setShowForm(false)}
                style={{ padding: "3px 10px", fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 3, cursor: "pointer" }}>
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 右エリア：フォルダ内容 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {selectedFolder ? `📁 ${selectedFolder.name}` : "フォルダを選択"}
          </span>
          {selectedFolder && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, background: "#1C1B18", color: "#FFF", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                + データ追加
              </button>
              <button
                onClick={handleDeleteFolder}
                style={{ padding: "4px 10px", fontSize: 11, background: "transparent", border: `1px solid #B8302A`, color: "#B8302A", borderRadius: 4, cursor: "pointer" }}
              >
                フォルダ削除
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {!selectedFolder ? (
            <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "32px 0" }}>
              左のツリーからフォルダを選択してください
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: "32px 0" }}>
              このフォルダにはまだデータがありません
            </div>
          ) : (
            items.map(item => {
              const meta = TYPE_META[item.item_type] || {};
              return (
                <div key={item.id} style={{
                  background: "#FFFFFF", border: `1px solid ${T.border}`, borderRadius: 6,
                  padding: 12, marginBottom: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span>{meta.icon}</span>
                    <span style={{ fontSize: 12, color: T.muted }}>{meta.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: T.muted }}>{formatDate(item.updated_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title || "(無題)"}</div>
                  {item.content && (
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.content}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showAddModal && (
        <AddItemModal
          uid={uid}
          token={token}
          projectId={null}
          onClose={() => setShowAddModal(false)}
          onCreated={item => {
            // フォルダに移動
            if (selectedFolder) {
              api.items.moveToFolder({ item_id: item.id, folder_id: selectedFolder.id }, token);
            }
            setItems(prev => [item, ...prev]);
          }}
        />
      )}
    </div>
  );
}
