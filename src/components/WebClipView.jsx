/**
 * WebClipView.jsx
 * OG タグ・メタデータを活用した Web クリップ表示。
 * Phase 1 で取得済みの metadata（og_image, title, description, og_url）を整形表示する。
 */

const T = { muted: "#7A7769", border: "#E5E2D9", surface: "#FAFAF7", text: "#1C1B18" };

export function WebClipView({ item }) {
  const { title, content, source_url, metadata = {} } = item;
  const { og_image, description, og_url } = metadata;

  const displayTitle   = title || metadata.title || source_url || "(無題)";
  const displayContent = content || description || "";
  const displayUrl     = og_url || source_url;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* OG 画像 */}
      {og_image && (
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
          <img
            src={og_image}
            alt={displayTitle}
            style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "cover" }}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
      )}

      {/* サイト情報 */}
      <div style={{
        padding: 14, background: T.surface, borderRadius: 6,
        border: `1px solid ${T.border}`,
      }}>
        {/* ドメイン */}
        {displayUrl && (
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, letterSpacing: 0.3 }}>
            {(() => { try { return new URL(displayUrl).hostname; } catch { return displayUrl; } })()}
          </div>
        )}

        {/* タイトル */}
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>
          {displayTitle}
        </div>

        {/* 本文 */}
        {displayContent && (
          <div style={{
            fontSize: 12, color: T.muted, lineHeight: 1.7,
            display: "-webkit-box", WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {displayContent}
          </div>
        )}
      </div>

      {/* 元 URL リンク */}
      {displayUrl && (
        <a
          href={displayUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", fontSize: 12, fontWeight: 500,
            background: "#1C1B18", color: "#FFF",
            borderRadius: 4, textDecoration: "none", alignSelf: "flex-start",
          }}
        >
          元ページを開く →
        </a>
      )}
    </div>
  );
}
