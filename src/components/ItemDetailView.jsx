/**
 * ItemDetailView.jsx（バグ修正版）
 *
 * 修正:
 *   - Notion由来のアイテム（metadata.notion_page_id あり）にNotionリンクを表示
 *   - contentのtextareaを全文表示（行数制限を解除）
 *   - Notion同期アイテムは編集不可の注記を表示（次回同期で上書きされるため）
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

const SOURCE_LABELS = {
  "notion-inbox":   "Notion inbox",
  "notion-input":   "Notion インプットDB",
  "notion-output":  "Notion アウトプットDB",
  "notion-asset":   "Notion アセットDB",
  "notion-project": "Notion プロジェクトDB",
};

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// Notion page UUID → URL
function notionPageUrl(pageId) {
  if (!pageId) return null;
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
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
          <VideoPlayer url={item.source_url} title={item.title} metadata={item.metadata} />
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
            style={{ maxWidth: "100%", borderRadius: 4, border: `1px solid ${T.border}`, display: "block" }}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
      ) : null;

    case "audio":
      return item.file_url || item.source_url ? (
        <div style={S.section}>
          <label style={S.lb}>音声</label>
          <audio controls src={item.file_url || item.source_url} style={{ width: "100%" }} />
        </div>
      ) : null;

    default:
      return null;
  }
}

export function ItemDetailView({ uid, token, item, projects, onSaved, onDeleted }) {
  const [title,   setTitle]   = useState(item.title   ?? "");
  const [content, setContent] = useState(item.content ?? "");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  const typeLabel  = TYPE_LABELS[item.item_type] || item.item_type;
  const typeIcon   = TYPE_ICONS[item.item_type]  || "📎";
  const isNotion   = item.source_app?.startsWith("notion-");
  const notionUrl  = notionPageUrl(item.metadata?.notion_page_id);
  const sourceLabel = SOURCE_LABELS[item.source_app] || item.source_app;

  // Notionアイテムは内容編集不可（次回同期で上書きされる）
  // textとpdfのみ編集可、ただしNotionアイテムは除く
  const isTextEditable = !isNotion && (item.item_type === "text" || item.item_type === "pdf");

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={S.badge}>{typeIcon} {typeLabel}</span>
        {isNotion && (
          <span style={{
            ...S.badge,
            background: "#EBF5FF", color: "#2F54C8",
          }}>
            {sourceLabel}
          </span>
        )}
      </div>

      {/* Notion リンク（Notion由来のアイテムのみ表示） */}
      {notionUrl && (
        <div style={{ ...S.section }}>
          <label style={S.lb}>NOTION で開く</label>
          <a
            href={notionUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "#2F54C8",
              padding: "5px 10px", border: "1px solid #BFD7FF",
              borderRadius: 4, background: "#EBF5FF", textDecoration: "none",
            }}
          >
            Notionページを開く
          </a>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
            ※ 編集はNotionで行い、Zeusで同期してください
          </div>
        </div>
      )}

      {/* タイプ別ビュー */}
      <TypedViewer item={item} />

      {/* タイトル */}
      <div style={S.section}>
        <label style={S.lb}>TITLE</label>
        {isNotion ? (
          <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>
            {item.title || "(無題)"}
          </div>
        ) : (
          <input
            style={S.inp}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="(無題)"
          />
        )}
      </div>

      {/* CONTENT（全文表示） */}
      <div style={S.section}>
        <label style={S.lb}>CONTENT</label>
        {isNotion ? (
          // Notionアイテムは読み取り専用で全文表示
          <div style={{
            fontSize: 12, lineHeight: 1.8, color: T.text,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 4, padding: "8px 10px",
            maxHeight: 400, overflowY: "auto",
          }}>
            {item.content || "(本文なし)"}
          </div>
        ) : isTextEditable ? (
          <textarea
            style={{ ...S.inp, minHeight: 160, resize: "vertical", lineHeight: 1.6 }}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        ) : null}
      </div>

      {/* SOURCE URL（Notion以外） */}
      {!isNotion && item.source_url && (
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

      {/* ボタン（Notionアイテムは保存ボタン非表示） */}
      <div style={{ display: "flex", gap: 8 }}>
        {!isNotion && (
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
        )}
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
