/**
 * 罠 #2 対応：フォルダツリーノードも必ずファイルのトップレベルで定義する。
 */

import { useState } from "react";

const S = {
  row: (selected) => ({
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 8px",
    borderRadius: 4,
    cursor: "pointer",
    background: selected ? "#1C1B18" : "transparent",
    color: selected ? "#FFFFFF" : "#1C1B18",
    fontSize: 13,
    fontWeight: selected ? 600 : 400,
  }),
  toggle: {
    width: 16,
    height: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: 10,
    color: "#7A7769",
  },
  name: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  children: {
    paddingLeft: 16,
  },
};

export function FolderNode({ node, selectedId, onSelect, onAdd }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const selected = selectedId === node.id;

  return (
    <div>
      <div style={S.row(selected)} onClick={() => onSelect(node)}>
        <span
          style={S.toggle}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setOpen(v => !v); }}
        >
          {hasChildren ? (open ? "▾" : "▸") : "·"}
        </span>
        <span style={{ marginRight: 4 }}>📁</span>
        <span style={S.name} title={node.name}>{node.name}</span>
        <span
          style={{ fontSize: 14, opacity: 0.5 }}
          onClick={(e) => { e.stopPropagation(); onAdd(node.id); }}
          title="サブフォルダを追加"
        >
          +
        </span>
      </div>
      {hasChildren && open && (
        <div style={S.children}>
          {node.children.map(child => (
            <FolderNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
