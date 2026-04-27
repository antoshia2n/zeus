/**
 * データ追加時の自動タイプ判定
 * ブラウザ側（UIのリアルタイム表示）とサーバー側（API）の両方で使える純関数
 */

const IMAGE_EXT   = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const AUDIO_EXT   = /\.(mp3|wav|m4a|ogg|aac|flac)$/i;
const PDF_EXT     = /\.pdf$/i;
const VIDEO_HOSTS = /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|nicovideo\.jp/i;

/**
 * @param {{ source_url?: string, file_url?: string, content?: string, mime_type?: string }} params
 * @returns {'image'|'audio'|'pdf'|'video_link'|'web_clip'|'text'}
 */
export function detectItemType({ source_url, file_url, content, mime_type } = {}) {
  // file_url がある場合は拡張子・MIME 優先
  if (file_url) {
    if (IMAGE_EXT.test(file_url))  return "image";
    if (AUDIO_EXT.test(file_url))  return "audio";
    if (PDF_EXT.test(file_url))    return "pdf";
  }
  if (mime_type === "application/pdf") return "pdf";
  if (mime_type?.startsWith("image/")) return "image";
  if (mime_type?.startsWith("audio/")) return "audio";

  // source_url がある場合
  if (source_url) {
    if (VIDEO_HOSTS.test(source_url)) return "video_link";
    return "web_clip";
  }

  // デフォルト
  return "text";
}

/**
 * item_type に対応するラベルとアイコン文字を返す
 */
export const TYPE_META = {
  text:       { label: "テキスト",    icon: "📝" },
  pdf:        { label: "PDF",         icon: "📄" },
  video_link: { label: "動画リンク",  icon: "🎬" },
  web_clip:   { label: "Webクリップ", icon: "🔗" },
  image:      { label: "画像",        icon: "🖼" },
  audio:      { label: "音声",        icon: "🎵" },
};
