const T = { surface: "#FAFAF7", border: "#E5E2D9", muted: "#7A7769" };

const card = { background: "#FFFFFF", border: `1px solid ${T.border}`, borderRadius: 8, padding: 20, marginBottom: 16 };
const lb   = { fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: T.muted, marginBottom: 6, display: "block" };

export default function Settings() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
      <div style={card}>
        <label style={lb}>Embedding モデル</label>
        <div style={{ fontSize: 13 }}>Voyage AI voyage-3.5（1024次元）</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
          v1 から継続採用。データ追加・更新時に自動的に呼び出されます。
        </div>
      </div>

      <div style={card}>
        <label style={lb}>API キー状態</label>
        <div style={{ fontSize: 13 }}>
          VOYAGE_API_KEY は Cloudflare Pages の Runtime Binding で管理しています。
          ブラウザには露出していません。
        </div>
      </div>

      <div style={card}>
        <label style={lb}>テーブル</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div>zeus_projects（プロジェクト）</div>
          <div>zeus_folders（フォルダ）</div>
          <div>zeus_items（データ本体）</div>
          <div>zeus_item_projects（データ↔プロジェクト 多対多）</div>
          <div style={{ marginTop: 8, color: "#9b9b9b" }}>
            v1: zs_entries（継続稼働中、MCP 互換用）
          </div>
        </div>
      </div>

      <div style={card}>
        <label style={lb}>自動タイプ判定ロジック</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div>📝 テキスト — URL・ファイルなしのテキスト入力</div>
          <div>🔗 Webクリップ — 一般URLのみ（OGタグ自動取得）</div>
          <div>🎬 動画リンク — YouTube・Vimeo等のURL</div>
          <div>📄 PDF — .pdf拡張子のファイルURL</div>
          <div>🖼 画像 — .jpg/.png/.gif/.webp等</div>
          <div>🎵 音声 — .mp3/.wav/.m4a等</div>
        </div>
      </div>

      <div style={card}>
        <label style={lb}>Phase 状態</label>
        <div style={{ fontSize: 12, lineHeight: 2 }}>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 0：セットアップ</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 1：データモデル + 管理画面</div>
          <div style={{ color: T.muted }}>○ Phase 2：双方向 API + MCP ツール化</div>
          <div style={{ color: T.muted }}>○ Phase 3：データタイプ別ビュー</div>
          <div style={{ color: T.muted }}>○ Phase 4：Web クリッパー</div>
          <div style={{ color: T.muted }}>○ Phase 5：AI 加工統合</div>
          <div style={{ color: T.muted }}>○ Phase 6：他アプリ連携の本格化</div>
        </div>
      </div>
    </div>
  );
}
