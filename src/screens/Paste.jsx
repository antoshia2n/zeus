import { useState } from "react";
import { T, card, lb10, inp, solidBtn, ghostBtn } from "shia2n-core";
import { Clipboard, Check, AlertCircle } from "lucide-react";
import { SOURCES } from "../constants.js";
import { useEntries } from "../hooks/useEntries.js";

export default function Paste({ uid }) {
  const { create } = useEntries(uid, { enabled: false });
  const [title, setTitle]     = useState("");
  const [content, setContent] = useState("");
  const [source, setSource]   = useState("memo");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState(null); // {type:"ok"|"err", msg:string}

  const charCount = content.length;
  const canSave   = !!title.trim() && !!content.trim() && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setStatus(null);

    const tags = tagsText
      .split(/[,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const { error } = await create({ title, content, source, tags });
    setSaving(false);

    if (error) {
      setStatus({ type: "err", msg: error.message || "保存失敗" });
      return;
    }

    setStatus({ type: "ok", msg: "保存しました" });
    setTitle("");
    setContent("");
    setTagsText("");
    setTimeout(() => setStatus(null), 3000);
  }

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setContent((prev) => (prev ? prev + "\n\n" + text : text));
    } catch (e) {
      setStatus({
        type: "err",
        msg: "クリップボードの読み取りに失敗（ブラウザの許可が必要）",
      });
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={card}>
        <div style={{ ...lb10, marginBottom: 6 }}>TITLE</div>
        <input
          style={inp}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="このナレッジの見出し（例：発信軸 / Aさんの相談内容）"
        />

        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...lb10, marginBottom: 6 }}>SOURCE</div>
            <select
              style={{ ...inp, width: "100%" }}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 2 }}>
            <div style={{ ...lb10, marginBottom: 6 }}>TAGS（カンマ区切り）</div>
            <input
              style={inp}
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="例：発信軸, コーチング, 価値観"
            />
          </div>
        </div>

        <div
          style={{
            ...lb10,
            marginTop: 16,
            marginBottom: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>CONTENT</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "DM Mono", fontWeight: 400, color: T.muted }}>
              {charCount.toLocaleString()} chars
            </span>
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              style={{
                ...ghostBtn,
                padding: "4px 10px",
                fontSize: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Clipboard size={12} strokeWidth={1.5} />
              貼り付け
            </button>
          </div>
        </div>

        <textarea
          style={{
            ...inp,
            width: "100%",
            minHeight: 300,
            resize: "vertical",
            fontFamily:
              '"Noto Sans JP", "Hiragino Sans", "YuGothic", monospace',
            lineHeight: 1.6,
          }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="ここにナレッジを貼り付け。Whimsicalからは Cmd+Shift+V でテキスト化される"
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
          }}
        >
          {status && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: status.type === "ok" ? "#1F7A4A" : "#B42318",
              }}
            >
              {status.type === "ok" ? (
                <Check size={14} strokeWidth={1.5} />
              ) : (
                <AlertCircle size={14} strokeWidth={1.5} />
              )}
              {status.msg}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              ...solidBtn,
              opacity: canSave ? 1 : 0.4,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "保存中..." : "Zeusに保存"}
          </button>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          color: T.muted,
          marginTop: 12,
          lineHeight: 1.7,
        }}
      >
        保存時にVoyage AIで自動的にベクトル化され、Claude（shia2n-mcp経由）から意味検索できるようになります。
      </div>
    </div>
  );
}
