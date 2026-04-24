export const APP_ID = "zeus";
export const APP_NAME = "Zeus";
export const APP_TAGLINE = "全知全能のナレッジハブ";

export const TABS = [
  { id: "paste",   label: "投入" },
  { id: "list",    label: "一覧" },
  { id: "search",  label: "検索" },
  { id: "sources", label: "ソース" },
];

export const SOURCES = [
  { id: "memo",      label: "メモ" },
  { id: "whimsical", label: "Whimsical" },
  { id: "notion",    label: "Notion" },
  { id: "consult",   label: "コンサルシート" },
  { id: "chat",      label: "過去チャット" },
  { id: "evernote",  label: "Evernote" },
  { id: "iphone",    label: "iPhoneメモ" },
  { id: "mm-app",    label: "MMアプリ" },
  { id: "content-os",label: "ContentOS" },
  { id: "other",     label: "その他" },
];

export const SOURCE_LABEL_MAP = Object.fromEntries(
  SOURCES.map((s) => [s.id, s.label])
);
