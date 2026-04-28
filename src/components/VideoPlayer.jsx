/**
 * VideoPlayer.jsx
 * YouTube・Vimeo の埋め込みプレイヤー。
 * 未対応ホストは外部リンクにフォールバック。
 */

const T = { muted: "#7A7769", border: "#E5E2D9", surface: "#FAFAF7" };

function detectProvider(url) {
  if (!url) return "external";
  if (/youtube\.com|youtu\.be/.test(url))   return "youtube";
  if (/vimeo\.com/.test(url))               return "vimeo";
  if (/loom\.com/.test(url))                return "loom";
  if (/twitch\.tv/.test(url))               return "twitch";
  if (/nicovideo\.jp/.test(url))            return "nicovideo";
  return "external";
}

function getYouTubeId(url) {
  const m = url?.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function getVimeoId(url) {
  const m = url?.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function getLoomId(url) {
  const m = url?.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

function buildEmbedUrl(url, provider) {
  switch (provider) {
    case "youtube": {
      const id = getYouTubeId(url);
      return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
    }
    case "vimeo": {
      const id = getVimeoId(url);
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    case "loom": {
      const id = getLoomId(url);
      return id ? `https://www.loom.com/embed/${id}` : null;
    }
    default:
      return null;
  }
}

export function VideoPlayer({ url, title, metadata }) {
  const provider = detectProvider(url);
  const embedUrl = buildEmbedUrl(url, provider);

  // YouTube サムネイル URL（metadata に格納されている場合は優先）
  const ytId = provider === "youtube" ? getYouTubeId(url) : null;

  if (!embedUrl) {
    return (
      <div style={{
        padding: 16, background: T.surface, borderRadius: 6,
        border: `1px solid ${T.border}`, textAlign: "center",
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🎬</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title || url}</div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
          この動画サービスは埋め込み未対応です
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block", padding: "6px 16px", fontSize: 12,
            background: "#1C1B18", color: "#FFF", borderRadius: 4, textDecoration: "none",
          }}
        >
          外部で開く →
        </a>
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
        <iframe
          src={embedUrl}
          title={title || "動画"}
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            border: "none",
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {provider}
        </span>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#2F54C8" }}>
          元サイトで開く →
        </a>
      </div>
    </div>
  );
}
