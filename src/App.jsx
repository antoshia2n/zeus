import { useState } from "react";
import { useAuthUid } from "shia2n-core";
import { APP_NAME, TABS } from "./constants.js";
import { useIdToken } from "./lib/hooks.js";
import ProjectView from "./screens/ProjectView.jsx";
import FolderView  from "./screens/FolderView.jsx";
import Settings    from "./screens/Settings.jsx";

const T = { bg: "#F0EEE7", surface: "#FAFAF7", border: "#E5E2D9", muted: "#7A7769", text: "#1C1B18" };

export default function App() {
  const uid   = useAuthUid();
  const token = useIdToken();
  const [tab, setTab] = useState("projects");

  if (!uid || !token) {
    return (
      <div style={{
        minHeight: "100vh", background: T.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 12, color: T.muted }}>
          {!uid ? "認証中..." : "トークン取得中..."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <header style={{ padding: "14px 20px 0", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>{APP_NAME}</h1>
            <span style={{ fontSize: 11, color: T.muted }}>知的生産システム中央リポジトリ</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: "7px 14px", fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    color:      active ? T.text : T.muted,
                    background: "transparent", border: "none",
                    borderBottom: `2px solid ${active ? T.text : "transparent"}`,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main>
        {tab === "projects" && <ProjectView uid={uid} token={token} />}
        {tab === "folders"  && <FolderView  uid={uid} token={token} />}
        {tab === "settings" && <Settings    uid={uid} token={token} />}
      </main>
    </div>
  );
}
