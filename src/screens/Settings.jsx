/**
 * Settings.jsx（スリム版）
 * Notion同期カードのみ。余白・情報カード・PDFバッチを削除。
 */

import { useState } from "react";

const T = { surface: "#FAFAF7", border: "#E5E2D9", muted: "#7A7769", text: "#1C1B18" };

const DBS = [
  { source: "notion-inbox",   label: "inbox" },
  { source: "notion-input",   label: "インプットDB" },
  { source: "notion-output",  label: "アウトプットDB" },
  { source: "notion-asset",   label: "アセットDB" },
  { source: "notion-project", label: "プロジェクトDB" },
];

function SpinnerInline() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12"
      style={{ animation: "spin 1s linear infinite", display: "inline-block", verticalAlign: "middle" }}>
      <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
      <circle cx="6" cy="6" r="4" fill="none" stroke="#E5E2D9" strokeWidth="2"/>
      <path d="M6 2 A4 4 0 0 1 10 6" fill="none" stroke="#2F54C8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export default function Settings({ uid, token }) {
  const [dbResults, setDbResults] = useState(null);
  const [running,   setRunning]   = useState(false);
  const [finished,  setFinished]  = useState(false);

  function setDbState(source, patch) {
    setDbResults(prev => ({ ...prev, [source]: { ...(prev?.[source] || {}), ...patch } }));
  }

  async function runSync() {
    if (!token) {
      setDbResults({ _error: "ログイン情報が取得できていません。再読み込みしてください。" });
      setFinished(true);
      return;
    }
    const init = {};
    DBS.forEach(d => { init[d.source] = { status: "pending", imported: 0, error: null }; });
    setDbResults(init);
    setRunning(true);
    setFinished(false);

    for (const { source } of DBS) {
      setDbState(source, { status: "running" });
      try {
        const res = await fetch("/api/ui/sync-notion-db", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ source }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
        setDbState(source, { status: "done", imported: data.imported ?? 0 });
      } catch (e) {
        setDbState(source, { status: "error", error: e.message });
      }
    }
    setRunning(false);
    setFinished(true);
  }

  function reset() { setDbResults(null); setRunning(false); setFinished(false); }

  const STATUS_ICON  = { pending: "○", done: "✓", error: "✗" };
  const STATUS_COLOR = { pending: T.muted, running: "#2F54C8", done: "#256E45", error: "#B8302A" };
  const totalImported = dbResults
    ? Object.values(dbResults).reduce((s, v) => s + (v?.imported || 0), 0)
    : 0;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{
        background: "#FFF", border: `1px solid ${T.border}`,
        borderRadius: 8, padding: 16,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
          textTransform: "uppercase", color: T.muted, marginBottom: 12,
        }}>
          Notion ナレッジ同期
        </div>

        {/* 初期ボタン */}
        {!running && !finished && (
          <button
            onClick={runSync}
            style={{
              padding: "7px 18px", fontSize: 12, fontWeight: 600,
              background: "#1C1B18", color: "#FFF",
              border: "none", borderRadius: 4, cursor: "pointer",
            }}
          >
            同期する
          </button>
        )}

        {/* DB別進捗 */}
        {dbResults && !dbResults._error && (
          <div style={{ marginBottom: 10 }}>
            {DBS.map(({ source, label }) => {
              const s = dbResults[source] || { status: "pending" };
              return (
                <div key={source} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, lineHeight: 2,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: STATUS_COLOR[s.status] || T.muted, width: 12, textAlign: "center", fontSize: 11, fontWeight: 700 }}>
                      {s.status === "running" ? <SpinnerInline /> : STATUS_ICON[s.status] || "○"}
                    </span>
                    <span>{label}</span>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    {s.status === "done"    && <span style={{ color: "#256E45", fontWeight: 600 }}>{s.imported} 件</span>}
                    {s.status === "running" && <span style={{ color: "#2F54C8" }}>処理中...</span>}
                    {s.status === "error"   && <span style={{ color: "#B8302A", maxWidth: 200, wordBreak: "break-all" }}>{s.error || "エラー"}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* グローバルエラー */}
        {dbResults?._error && (
          <div style={{ fontSize: 12, color: "#B8302A", marginBottom: 10 }}>{dbResults._error}</div>
        )}

        {/* 完了サマリ + リセット */}
        {finished && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            {!dbResults?._error && (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#256E45" }}>
                完了：{totalImported} 件
              </span>
            )}
            <button onClick={reset} style={{
              padding: "4px 12px", fontSize: 11,
              background: "transparent", border: `1px solid ${T.border}`,
              borderRadius: 4, cursor: "pointer",
            }}>
              リセット
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
