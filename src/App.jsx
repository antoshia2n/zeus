import { useAuthUid } from "shia2n-core";
import { APP_NAME, APP_VERSION } from "./constants.js";

const S = {
  root: {
    minHeight: "100vh",
    background: "#F0EEE7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '"Noto Sans JP", "Hiragino Sans", "YuGothic", sans-serif',
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #E5E2D9",
    borderRadius: 10,
    padding: "40px 48px",
    maxWidth: 480,
    width: "100%",
    margin: "0 20px",
    textAlign: "center",
  },
  badge: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#FFFFFF",
    background: "#1C1B18",
    padding: "3px 10px",
    borderRadius: 99,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1C1B18",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "#7A7769",
    marginBottom: 32,
    lineHeight: 1.6,
  },
  divider: {
    borderTop: "1px solid #E5E2D9",
    margin: "28px 0",
  },
  label: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#B5B2A8",
    marginBottom: 6,
  },
  uid: {
    fontFamily: '"DM Mono", "JetBrains Mono", monospace',
    fontSize: 12,
    color: "#7A7769",
    background: "#F7F5EF",
    border: "1px solid #E5E2D9",
    borderRadius: 4,
    padding: "8px 12px",
    wordBreak: "break-all",
    lineHeight: 1.5,
    textAlign: "left",
  },
  version: {
    fontSize: 10,
    color: "#B5B2A8",
    marginTop: 24,
  },
  phaseList: {
    textAlign: "left",
    marginTop: 0,
  },
  phaseItem: {
    fontSize: 12,
    color: "#7A7769",
    lineHeight: 2,
    paddingLeft: 4,
  },
  phaseItemDone: {
    fontSize: 12,
    color: "#256E45",
    fontWeight: 600,
    lineHeight: 2,
    paddingLeft: 4,
  },
};

const PHASES = [
  { label: "Phase 0：セットアップ",           done: true  },
  { label: "Phase 1：データモデル + 管理画面", done: false },
  { label: "Phase 2：双方向 API + 検索",       done: false },
  { label: "Phase 3：データタイプ別ビュー",    done: false },
  { label: "Phase 4：Web クリッパー",          done: false },
  { label: "Phase 5：AI 加工統合",             done: false },
  { label: "Phase 6：他アプリ連携の本格化",    done: false },
];

export default function App() {
  const uid = useAuthUid();

  if (!uid) {
    return (
      <div style={{ ...S.root }}>
        <div style={{ fontSize: 12, color: "#7A7769" }}>認証中...</div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.card}>
        <div style={S.badge}>Knowledge Repository</div>
        <div style={S.title}>{APP_NAME}</div>
        <div style={S.subtitle}>
          shia2n 知的生産システムの中央リポジトリ。<br />
          v2 リアーキテクチャ構築中です。
        </div>

        <div style={S.phaseList}>
          {PHASES.map((p) => (
            <div key={p.label} style={p.done ? S.phaseItemDone : S.phaseItem}>
              {p.done ? "✓ " : "○ "}{p.label}
            </div>
          ))}
        </div>

        <div style={S.divider} />

        <div style={S.label}>Authenticated UID</div>
        <div style={S.uid}>{uid}</div>

        <div style={S.version}>{APP_VERSION}</div>
      </div>
    </div>
  );
}
