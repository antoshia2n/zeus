/**
 * ItemDetailView.jsx
 * Phase 3：データタイプ別ビュー統合。
 * Phase 1 の ItemDetail（ProjectView.jsx インライン定義）を独立コンポーネントに昇格。
 * 罠 #2 対応：Phase 1 でインライン定義していた ItemDetail をここに移動。
 */

import { useState } from "react";
import { PdfViewer } from "./PdfViewer.jsx";
import { VideoPlayer } from "./VideoPlayer.jsx";
import { WebClipView } from "./WebClipView.jsx";
import * as api from "../lib/api.js";

const T = { muted: "#7A7769", border: "#E5E2D9", text: "#1C1B18", surface: "#FAFAF7" };

const TYPE_LABELS = {
  text:       "テキスト",
  pdf:        "PDF",
  video_link: "動画リンク",
  web_clip:   "Webクリップ",
  image:      "画像",
  audio:      "音声",
};

const TYPE_ICONS = {
  text:       "📝",
  pdf:        "📄",
  video_link: "🎬",
  web_clip:   "🔗",
  image:      "🖼",
  audio:      "🎵",
};

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const S = {
  root:  { padding: 16, height: "100%", overflowY: "auto" },
  badge: {
    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
    background: T.surface, color: T.muted, marginBottom: 10, display: "inline-block",
  },
  lb: {
    fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
    textTransform: "uppercase", color: T.muted, marginBottom: 4, display: "block",
  },
  inp: {
    width: "100%", padding: "6px 8px", fontSize: 13,
    border: `1px solid ${T.border}`, borderRadius: 4, fontFamily: "inherit", outline: "none",
  },
  meta: { fontSize: 11, color: T.muted, lineHeight: 1.6, wordBreak: "break-all" },
  section: { marginBottom: 14 },
};

/**
 * タイプ別のメインビュー部分
 */
function TypedViewer({ item }) {
  const pdfUrl = item.file_url || (item.item_type === "pdf" ? item.source_url : null);

  switch (item.item_type) {
    case "pdf":
      return pdfUrl ? (
        <div style={S.section}>
          <label style={S.lb}>PDF プレビュー</label>
          <PdfViewer url={pdfUrl} />
          {item.content && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11, color: T.muted, cursor: "pointer" }}>
                抽出テキストを表示
              </summary>
              <div style={{
                marginTop: 8, fontSize: 11, color: T.muted, lineHeight: 1.7,
                maxHeight: 200, overflowY: "auto", background: T.surface,
                padding: 8, borderRadius: 4, whiteSpace: "pre-wrap",
              }}>
                {item.content}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.muted, padding: 12, background: T.surface, borderRadius: 4 }}>
          PDF ファイルの URL が設定されていません
        </div>
      );

    case "video_link":
      return (
        <div style={S.section}>
          <label style={S.lb}>動画</label>
          <VideoPlayer
            url={item.source_url}
            title={item.title}
            metadata={item.metadata}
          />
        </div>
      );

    case "web_clip":
      return (
        <div style={S.section}>
          <label style={S.lb}>Web クリップ</label>
          <WebClipView item={item} />
        </div>
      );

    case "image":
      return item.file_url || item.source_url ? (
        <div style={S.section}>
          <label style={S.lb}>画像</label>
          <img
            src={item.file_url || item.source_url}
            alt={item.title || ""}
            style={{
              maxWidth: "100%", borderRadius: 4,
              border: `1px solid ${T.border}`, display: "block",
            }}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
      ) : null;

    case "audio":
      return item.file_url || item.source_url ? (
        <div style={S.section}>
          <label style={S.lb}>音声</label>
          <audio
            controls
            src={item.file_url || item.source_url}
            style={{ width: "100%" }}
          />
        </div>
      ) : null;

    default:
      return null;
  }
}

/**
 * ItemDetailView
 * props: { uid, token, item, projects, onSaved, onDeleted }
 */
export function ItemDetailView({ uid, token, item, projects, onSaved, onDeleted }) {
  const [title,   setTitle]   = useState(item.title   ?? "");
  const [content, setContent] = useState(item.content ?? "");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  const typeLabel = TYPE_LABELS[item.item_type] || item.item_type;
  const typeIcon  = TYPE_ICONS[item.item_type]  || "📎";
  const isTextEditable = item.item_type === "text" || item.item_type === "pdf";

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      await api.items.update({
        item_id: item.id,
        title:   title.trim()   || null,
        content: content.trim() || null,
      }, token);
      setMsg({ ok: true, text: "保存しました" });
      onSaved({ ...item, title: title.trim(), content: content.trim() });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`「${item.title || "(無題)"}」を削除しますか？`)) return;
    await api.items.delete({ item_id: item.id }, token);
    onDeleted(item.id);
  }

  return (
    <div style={S.root}>
      {/* バッジ */}
      <div style={S.badge}>{typeIcon} {typeLabel}</div>

      {/* タイプ別ビュー */}
      <TypedViewer item={item} />

      {/* タイトル（全タイプ共通） */}
      <div style={S.section}>
        <label style={S.lb}>TITLE</label>
        <input
          style={S.inp}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="(無題)"
        />
      </div>

      {/* テキスト本文（text / pdf のみ） */}
      {isTextEditable && (
        <div style={S.section}>
          <label style={S.lb}>
            {item.item_type === "pdf" ? "抽出テキスト（編集可）" : "CONTENT"}
          </label>
          <textarea
            style={{ ...S.inp, minHeight: 120, resize: "vertical", lineHeight: 1.6 }}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>
      )}

      {/* SOURCE URL */}
      {item.source_url && (
        <div style={S.section}>
          <label style={S.lb}>SOURCE URL</label>
          <div style={S.meta}>
            <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: "#2F54C8" }}>
              {item.source_url}
            </a>
          </div>
        </div>
      )}

      {/* 所属プロジェクト */}
      <div style={S.section}>
        <label style={S.lb}>所属プロジェクト</label>
        <div style={{ fontSize: 12, color: T.muted }}>
          {projects?.length > 0
            ? projects.map(p => (
                <span key={p.id} style={{
                  display: "inline-block", margin: "2px 4px 2px 0",
                  padding: "2px 8px", background: T.surface, borderRadius: 20, fontSize: 11,
                }}>
                  {p.name}
                </span>
              ))
            : "(未所属)"}
        </div>
      </div>

      {/* 更新日時 */}
      <div style={S.section}>
        <label style={S.lb}>更新日時</label>
        <div style={S.meta}>{formatDate(item.updated_at)}</div>
      </div>

      {/* メッセージ */}
      {msg && (
        <div style={{ fontSize: 12, color: msg.ok ? "#256E45" : "#B8302A", marginBottom: 8 }}>
          {msg.text}
        </div>
      )}

      {/* ボタン */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "7px 16px", fontSize: 12, fontWeight: 600,
            background: "#1C1B18", color: "#FFF",
            border: "none", borderRadius: 4, cursor: "pointer", opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={handleDelete}
          style={{
            padding: "7px 12px", fontSize: 12, background: "transparent",
            color: "#B8302A", border: `1px solid #B8302A`, borderRadius: 4, cursor: "pointer",
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}
