import { useState } from "react";
import { T, card, lb10, inp, solidBtn, ghostBtn, mono } from "shia2n-core";

export default function Diag({ uid }) {
  const [secret, setSecret]     = useState("");
  const [query, setQuery]       = useState("発信軸");
  const [log, setLog]           = useState([]);
  const [running, setRunning]   = useState(false);

  function addLog(label, data, ok = true) {
    setLog(prev => [
      { label, data: typeof data === "string" ? data : JSON.stringify(data, null, 2), ok, at: new Date().toLocaleTimeString("ja-JP") },
      ...prev,
    ]);
  }

  async function callInternal(path, body) {
    const res = await fetch(`/api/internal/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({ user_id: uid, ...body }),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, data: json };
  }

  async function runAll() {
    if (!secret.trim()) {
      addLog("ERROR", "MCP_INTERNAL_SECRET を入力してください", false);
      return;
    }
    setRunning(true);
    setLog([]);

    // 1. list-sources
    addLog("→ list-sources 呼び出し中...", "");
    try {
      const r = await callInternal("list-sources", {});
      addLog(`list-sources [${r.status}]`, r.data, r.ok);
    } catch (e) {
      addLog("list-sources ERROR", String(e), false);
    }

    // 2. search
    addLog(`→ search "${query}" 呼び出し中...`, "");
    try {
      const r = await callInternal("search", { query });
      addLog(`search [${r.status}]`, r.data, r.ok);
    } catch (e) {
      addLog("search ERROR", String(e), false);
    }

    // 3. add-entry（テスト用）
    addLog("→ add-entry (diag test) 呼び出し中...", "");
    try {
      const r = await callInternal("add-entry", {
        title: "[Diag] テストエントリ",
        content: "診断ページから追加したテストエントリ。shia2n-mcpの動作確認用。",
        source: "memo",
        tags: ["diag"],
        created_by: "mcp",
      });
      addLog(`add-entry [${r.status}]`, r.data, r.ok);
    } catch (e) {
      addLog("add-entry ERROR", String(e), false);
    }

    setRunning(false);
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ ...lb10, marginBottom: 4 }}>CAUTION</div>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.7 }}>
          この画面は shia2n-mcp が呼び出す内部 API を直接テストする診断ページです。<br />
          MCP_INTERNAL_SECRET（Zeus の Cloudflare Pages 環境変数に設定した値）を入力してください。
        </div>
      </div>

      <div style={card}>
        <div style={{ ...lb10, marginBottom: 6 }}>MCP_INTERNAL_SECRET</div>
        <input
          type="password"
          style={{ ...inp, width: "100%", fontFamily: "DM Mono, monospace" }}
          value={secret}
          onChange={e => setSecret(e.target.value)}
          placeholder="Zeus の MCP_INTERNAL_SECRET の値を貼り付け"
        />

        <div style={{ ...lb10, marginTop: 14, marginBottom: 6 }}>検索クエリ（search テスト用）</div>
        <input
          style={{ ...inp, width: "100%" }}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button
            onClick={runAll}
            disabled={running}
            style={{
              ...solidBtn,
              opacity: running ? 0.4 : 1,
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {running ? "テスト中..." : "全 API テスト実行"}
          </button>
          {log.length > 0 && (
            <button onClick={() => setLog([])} style={ghostBtn}>
              ログクリア
            </button>
          )}
        </div>
      </div>

      {log.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {log.filter(l => l.data !== "").map((l, i) => (
            <div
              key={i}
              style={{
                ...card,
                borderLeft: `3px solid ${l.ok ? "#1F7A4A" : "#B42318"}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: l.ok ? "#1F7A4A" : "#B42318" }}>
                  {l.label}
                </div>
                <div style={{ ...mono, fontSize: 10, color: T.muted }}>{l.at}</div>
              </div>
              {l.data && (
                <pre
                  style={{
                    ...mono,
                    fontSize: 11,
                    background: T.surface,
                    padding: 10,
                    borderRadius: 4,
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    margin: 0,
                    maxHeight: 300,
                    overflowY: "auto",
                  }}
                >
                  {l.data}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
