import { useState } from "react";
import { T, card, lb10, inp, solidBtn, mono } from "shia2n-core";
import { Search as SearchIcon } from "lucide-react";
import { searchEntries } from "../lib/zeus.js";
import { SOURCE_LABEL_MAP } from "../constants.js";

export default function Search({ uid }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr]           = useState(null);
  const [touched, setTouched]   = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setErr(null);
    setTouched(true);
    const { data, error } = await searchEntries(uid, query, { limit: 10 });
    setResults(data ?? []);
    if (error) setErr(error.message || String(error));
    setSearching(false);
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      runSearch();
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={card}>
        <div style={{ ...lb10, marginBottom: 6 }}>QUERY</div>
        <textarea
          style={{
            ...inp,
            width: "100%",
            minHeight: 80,
            resize: "vertical",
          }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="壁打ちのテーマ・キーワードを自然文で（例：発信軸の決め方）"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <span style={{ fontSize: 10, color: T.muted }}>
            Ctrl/Cmd + Enter でも実行
          </span>
          <button
            onClick={runSearch}
            disabled={!query.trim() || searching}
            style={{
              ...solidBtn,
              opacity: !query.trim() || searching ? 0.4 : 1,
              cursor: !query.trim() || searching ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <SearchIcon size={14} strokeWidth={1.5} />
            {searching ? "検索中..." : "検索"}
          </button>
        </div>
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#FEF3F2",
            border: "1px solid #FECDCA",
            borderRadius: 6,
            fontSize: 12,
            color: "#B42318",
          }}
        >
          {err}
        </div>
      )}

      {touched && !err && (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...lb10, marginBottom: 8 }}>
            RESULTS ({results.length})
          </div>

          {results.length === 0 ? (
            <div
              style={{
                ...card,
                textAlign: "center",
                color: T.muted,
                fontSize: 13,
              }}
            >
              該当するエントリが見つかりませんでした
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {results.map((r) => (
                <div key={r.id} style={card}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: "wrap",
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
                      {SOURCE_LABEL_MAP[r.source] || r.source}
                    </span>
                    <span
                      style={{
                        ...mono,
                        fontSize: 10,
                        color: "#2F54C8",
                        fontWeight: 600,
                      }}
                    >
                      similarity {(r.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    {r.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: T.text,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {r.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
