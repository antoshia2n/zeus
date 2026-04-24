import { useState } from "react";
import { useAuthUid, T } from "shia2n-core";
import { APP_NAME, APP_TAGLINE, TABS } from "./constants.js";
import Paste from "./screens/Paste.jsx";
import List from "./screens/List.jsx";
import Search from "./screens/Search.jsx";
import Sources from "./screens/Sources.jsx";
import Diag from "./screens/Diag.jsx";

export default function App() {
  const uid = useAuthUid();
  const [tab, setTab] = useState("paste");

  if (!uid) {
    return (
      <div style={{ fontSize: 12, color: T.muted, padding: 48, textAlign: "center" }}>
        認証中...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <header
        style={{
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>{APP_NAME}</h1>
          <span style={{ fontSize: 11, color: T.muted }}>{APP_TAGLINE}</span>
        </div>

        <div style={{ maxWidth: 1040, margin: "12px auto 0", display: "flex", gap: 4 }}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? T.text : T.muted,
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? T.text : "transparent"}`,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main style={{ padding: "24px" }}>
        {tab === "paste"   && <Paste uid={uid} />}
        {tab === "list"    && <List uid={uid} />}
        {tab === "search"  && <Search uid={uid} />}
        {tab === "sources" && <Sources uid={uid} />}
        {tab === "diag"    && <Diag uid={uid} />}
      </main>
    </div>
  );
}
