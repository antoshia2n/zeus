import { useState } from "react";
import { T, card, lb10, ghostBtn, mono } from "shia2n-core";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { SOURCE_LABEL_MAP, SOURCES } from "../constants.js";
import { useEntries } from "../hooks/useEntries.js";

export default function List({ uid }) {
  const [sourceFilter, setSourceFilter] = useState(null);
  const { entries, ready, remove } = useEntries(uid, {
    enabled: true,
    source: sourceFilter,
  });
  const [expanded, setExpanded] = useState({});

  function toggle(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleDelete(id) {
    if (!confirm("このエントリを削除しますか？")) return;
    await remove(id);
  }

  if (!ready) {
    return (
      <div
        style={{
          fontSize: 12,
          color: T.muted,
          padding: "32px 0",
          textAlign: "center",
        }}
      >
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      {/* フィルタ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span style={{ ...lb10 }}>FILTER</span>
        <button
          onClick={() => setSourceFilter(null)}
          style={{
            ...ghostBtn,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: sourceFilter === null ? 600 : 400,
            background: sourceFilter === null ? T.surface : "transparent",
          }}
        >
          すべて
        </button>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSourceFilter(s.id)}
            style={{
              ...ghostBtn,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: sourceFilter === s.id ? 600 : 400,
              background: sourceFilter === s.id ? T.surface : "transparent",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ ...lb10, marginBottom: 8 }}>
        {entries.length} ENTRIES
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            ...card,
            textAlign: "center",
            color: T.muted,
            fontSize: 13,
          }}
        >
          まだエントリがありません。「投入」タブから追加してください。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => {
            const isOpen = !!expanded[e.id];
            return (
              <div key={e.id} style={card}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "start",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          padding: "2px 6px",
                          background: T.surface,
                          borderRadius: 3,
                          color: T.muted,
                        }}
                      >
                        {SOURCE_LABEL_MAP[e.source] || e.source}
                      </span>
                      <span
                        style={{
                          ...mono,
                          fontSize: 10,
                          color: T.muted,
                        }}
                      >
                        {new Date(e.created_at).toLocaleString("ja-JP", {
                          year:   "numeric",
                          month:  "2-digit",
                          day:    "2-digit",
                          hour:   "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {e.created_by === "mcp" && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            padding: "2px 6px",
                            background: "#EBF5FF",
                            color: "#2F54C8",
                            borderRadius: 3,
                          }}
                        >
                          MCP
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 6,
                        wordBreak: "break-word",
                      }}
                    >
                      {e.title}
                    </div>
                    {(e.tags?.length ?? 0) > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                          marginBottom: 8,
                        }}
                      >
                        {e.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              background: T.surface,
                              borderRadius: 3,
                              color: T.muted,
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.7,
                        color: T.text,
                        whiteSpace: isOpen ? "pre-wrap" : "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        wordBreak: "break-word",
                      }}
                    >
                      {e.content}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => toggle(e.id)}
                      style={{
                        ...ghostBtn,
                        padding: 6,
                        fontSize: 11,
                      }}
                      title={isOpen ? "折りたたむ" : "展開"}
                    >
                      {isOpen ? (
                        <ChevronUp size={14} strokeWidth={1.5} />
                      ) : (
                        <ChevronDown size={14} strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      style={{
                        ...ghostBtn,
                        padding: 6,
                        color: "#B42318",
                      }}
                      title="削除"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
