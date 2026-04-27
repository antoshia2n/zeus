export const APP_ID      = "zeus";
export const APP_NAME    = "Zeus";
export const APP_VERSION = "v2.0.0-phase1";

export const TABS = [
  { id: "projects", label: "プロジェクト" },
  { id: "folders",  label: "フォルダビュー" },
  { id: "settings", label: "設定" },
];

export const TYPE_META = {
  text:       { label: "テキスト",    icon: "📝" },
  pdf:        { label: "PDF",         icon: "📄" },
  video_link: { label: "動画リンク",  icon: "🎬" },
  web_clip:   { label: "Webクリップ", icon: "🔗" },
  image:      { label: "画像",        icon: "🖼" },
  audio:      { label: "音声",        icon: "🎵" },
};

export const ALL_TYPES = Object.entries(TYPE_META).map(([id, m]) => ({ id, ...m }));
