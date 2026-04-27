/**
 * URL から OG タグ・メタ情報を取得する
 * Cloudflare Workers / Pages Functions から呼ぶ
 */

/**
 * @param {string} url
 * @returns {Promise<{ title?: string, description?: string, og_image?: string, og_url?: string }>}
 */
export async function fetchOgMeta(url) {
  if (!url?.startsWith("http")) return {};

  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Zeus-Bot/1.0)" },
      signal:  AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const text = await res.text();
    // head 部分だけ解析（パフォーマンス）
    html = text.slice(0, 30000);
  } catch {
    return {};
  }

  function getMeta(property) {
    // og: プロパティ
    const ogMatch = html.match(
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")
    ) || html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i")
    );
    if (ogMatch) return ogMatch[1];

    // name= プロパティ
    const nameMatch = html.match(
      new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")
    ) || html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i")
    );
    return nameMatch ? nameMatch[1] : null;
  }

  function getTitle() {
    const og = getMeta("og:title");
    if (og) return og;
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return t ? t[1].trim() : null;
  }

  const title       = getTitle();
  const description = getMeta("og:description") || getMeta("description");
  const og_image    = getMeta("og:image");
  const og_url      = getMeta("og:url");

  return {
    ...(title       && { title }),
    ...(description && { description }),
    ...(og_image    && { og_image }),
    ...(og_url      && { og_url }),
  };
}

/**
 * YouTube URL から video_id を抽出する
 */
export function extractYouTubeId(url) {
  const match = url?.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}
