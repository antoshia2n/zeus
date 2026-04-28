/**
 * AddItemModal.jsx（Phase 3 更新版）
 * Phase 3 追加：
 *   - URL が PDF の場合、pdfjs-dist でテキストを自動抽出して content に設定
 *   - 抽出中のプログレス表示
 */

import { useState } from "react";
import * as api from "../lib/api.js";
import { TYPE_META } from "../constants.js";
import { extractPdfText } from "./PdfViewer.jsx";

const OVERLAY = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
};
const DIALOG = {
  background: "#FFFFFF", borderRadius: 10, padding: 24,
  width: "min(640px, 95vw)", maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};
const LB = {
  fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
  textTransform: "uppercase", color: "#7A7769", marginBottom: 4, display: "block",
};
const INP = {
  width: "100%", padding: "8px 10px", fontSize: 13,
  border: "1px solid #D4D0C6", borderRadius: 4, background: "#FAFAF7",
  fontFamily: "inherit", outline: "none",
};
const BTN_P = {
  padding: "8px 20px", fontSize: 13, fontWeight: 600,
  background: "#1C1B18", color: "#FFFFFF",
  border: "none", borderRadius: 4, cursor: "pointer",
};
const BTN_G = {
  padding: "8px 20px", fontSize: 13, fontWeight: 400,
  background: "transparent", color: "#7A7769",
  border: "1px solid #D4D0C6", borderRadius: 4, cursor: "pointer",
};

function detectTypeClient({ source_url, file_url }) {
  const imageExt  = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  const audioExt  = /\.(mp3|wav|m4a|ogg|aac)$/i;
  const pdfExt    = /\.pdf$/i;
  const videoHosts = /youtube\.com|youtu\.be|vimeo\.com|loom\.com/i;

  if (file_url) {
    if (imageExt.test(file_url))  return "image";
    if (audioExt.test(file_url))  return "audio";
    if (pdfExt.test(file_url))    return "pdf";
  }
  if (source_url) {
    if (pdfExt.test(source_url))       return "pdf";
    if (videoHosts.test(source_url))   return "video_link";
    return "web_clip";
  }
  return "text";
}

export function AddItemModal({ uid, token, projectId, onClose, onCreated }) {
  const [title,      setTitle]      = useState("");
  const [content,    setContent]    = useState("");
  const [sourceUrl,  setSourceUrl]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error,      setError]      = useState(null);

  const detectedType = detectTypeClient({ source_url: sourceUrl, file_url: "" });
  const typeMeta = TYPE_META[detectedType] || {};
  const isPdf = detectedType === "pdf";

  /**
   * PDF URL が確定したタイミングでテキストを抽出する
   */
  async function handleExtractPdf() {
    if (!sourceUrl.trim() || !isPdf) return;
    setExtracting(true);
    setError(null);
    try {
      const text = await extractPdfText(sourceUrl.trim());
      setContent(text);
    } catch (e) {
      setError(`PDF テキスト抽出失敗: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!title.trim() && !content.trim() && !sourceUrl.trim()) {
      setError("タイトル・本文・URLのいずれかを入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        user_id:     uid,
        title:       title.trim()     || null,
        content:     content.trim()   || null,
        source_url:  sourceUrl.trim() || null,
        project_ids: projectId ? [projectId] : [],
      };
      const res = await api.items.create(body, token);
      onCreated(res.item);
      onClose();
    } catch (e) {
      setError(e.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={DIALOG} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>データを追加</div>

        {sourceUrl.trim() && (
          <div style={{
            fontSize: 11, fontWeight: 600, color: "#256E45",
            background: "#E8F5EC", padding: "4px 10px", borderRadius: 20,
            display: "inline-block", marginBottom: 12,
          }}>
            {typeMeta.icon} {typeMeta.label} として認識
          </div>
        )}

        {/* URL */}
        <div style={{ marginBottom: 14 }}>
          <label style={LB}>URL</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...INP, flex: 1 }}
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://..."
            />
            {/* PDF のときだけテキスト抽出ボタンを表示 */}
            {isPdf && (
              <button
                type="button"
                onClick={handleExtractPdf}
                disabled={extracting || !sourceUrl.trim()}
                style={{
                  ...BTN_G,
                  padding: "6px 12px", fontSize: 11,
                  opacity: extracting ? 0.5 : 1, flexShrink: 0,
                }}
              >
                {extracting ? "抽出中..." : "テキスト抽出"}
              </button>
            )}
          </div>
          {isPdf && (
            <div style={{ fontSize: 10, color: "#7A7769", marginTop: 3 }}>
              「テキスト抽出」を押すと PDF の本文を自動取得してベクトル検索の対象になります
            </div>
          )}
          {!isPdf && (
            <div style={{ fontSize: 10, color: "#7A7769", marginTop: 3 }}>
              URLを入力するとタイプが自動判定され、メタデータが自動取得されます
            </div>
          )}
        </div>

        {/* タイトル */}
        <div style={{ marginBottom: 14 }}>
          <label style={LB}>タイトル</label>
          <input
            style={INP}
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="URLがある場合は自動取得されます"
          />
        </div>

        {/* 本文 */}
        <div style={{ marginBottom: 14 }}>
          <label style={LB}>
            {isPdf ? "抽出テキスト（自動設定 or 手動入力）" : "本文"}
          </label>
          <textarea
            style={{ ...INP, minHeight: 120, resize: "vertical", lineHeight: 1.6 }}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={isPdf
              ? "「テキスト抽出」ボタンで自動入力されます"
              : "メモ・Whimsicalのテキスト・Notionのエクスポート等を貼り付け"}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#B8302A", marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={BTN_G} onClick={onClose}>キャンセル</button>
          <button
            style={{ ...BTN_P, opacity: saving ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={saving || extracting}
          >
            {saving ? "保存中..." : "Zeusに保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
