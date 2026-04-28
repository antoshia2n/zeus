/**
 * Settings.jsx（Phase 3 更新版）
 * Phase 3 追加：
 *   - 既存 PDF 再処理バッチ（content が空の PDF を一括テキスト抽出）
 */

import { useState } from "react";
import { extractPdfText } from "../components/PdfViewer.jsx";
import * as api from "../lib/api.js";

const T = { surface: "#FAFAF7", border: "#E5E2D9", muted: "#7A7769", text: "#1C1B18" };

const card = {
  background: "#FFFFFF", border: `1px solid ${T.border}`,
  borderRadius: 8, padding: 20, marginBottom: 16,
};
const lb = {
  fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
  textTransform: "uppercase", color: T.muted, marginBottom: 6, display: "block",
};

export default function Settings({ uid, token }) {
  const [batchState, setBatchState] = useState({
    running:   false,
    total:     0,
    done:      0,
    skipped:   0,
    failed:    0,
    logs:      [],
    finished:  false,
  });

  function addLog(msg) {
    setBatchState(s => ({ ...s, logs: [msg, ...s.logs].slice(0, 50) }));
  }

  async function runPdfBatch() {
    if (!uid || !token) { addLog("UID または Token が取得できていません"); return; }
    setBatchState({ running: true, total: 0, done: 0, skipped: 0, failed: 0, logs: [], finished: false });

    try {
      // content が空の PDF アイテムを取得（最大 200 件）
      const res = await api.items.list(
        { user_id: uid, item_type: "pdf", limit: "200" },
        token
      );
      const pdfs = (res.items || []).filter(i => !i.content?.trim());

      setBatchState(s => ({ ...s, total: pdfs.length }));

      if (pdfs.length === 0) {
        addLog("テキスト抽出が必要な PDF はありません（または全件処理済み）");
        setBatchState(s => ({ ...s, running: false, finished: true }));
        return;
      }

      addLog(`${pdfs.length} 件の PDF を処理します`);

      for (const item of pdfs) {
        const pdfUrl = item.file_url || item.source_url;
        if (!pdfUrl) {
          addLog(`スキップ：URL なし → ${item.title || item.id}`);
          setBatchState(s => ({ ...s, skipped: s.skipped + 1 }));
          continue;
        }

        try {
          addLog(`抽出中：${item.title || item.id}`);
          const text = await extractPdfText(pdfUrl);

          if (!text.trim()) {
            addLog(`スキップ：テキストなし → ${item.title || item.id}`);
            setBatchState(s => ({ ...s, skipped: s.skipped + 1 }));
            continue;
          }

          await api.items.update({
            item_id: item.id,
            content: text.trim(),
          }, token);

          addLog(`完了：${item.title || item.id}（${text.length.toLocaleString()} 文字）`);
          setBatchState(s => ({ ...s, done: s.done + 1 }));
        } catch (e) {
          addLog(`失敗：${item.title || item.id} → ${e.message}`);
          setBatchState(s => ({ ...s, failed: s.failed + 1 }));
        }
      }

      addLog("バッチ処理が完了しました");
    } catch (e) {
      addLog(`エラー：${e.message}`);
    } finally {
      setBatchState(s => ({ ...s, running: false, finished: true }));
    }
  }

  const { running, total, done, skipped, failed, logs, finished } = batchState;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>

      {/* Phase 3：PDF 再処理バッチ */}
      <div style={card}>
        <label style={lb}>既存 PDF の再処理（テキスト抽出バッチ）</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 14 }}>
          Phase 1 以前に投入された PDF で `content` が空のものを対象に、
          pdfjs-dist でテキストを抽出して保存します。
          抽出後はベクトル検索の対象になります。
        </div>

        {!running && !finished && (
          <button
            onClick={runPdfBatch}
            style={{
              padding: "8px 20px", fontSize: 12, fontWeight: 600,
              background: "#1C1B18", color: "#FFF", border: "none",
              borderRadius: 4, cursor: "pointer",
            }}
          >
            PDF を再処理する
          </button>
        )}

        {(running || finished) && (
          <div>
            {/* プログレス */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8, marginBottom: 12,
            }}>
              {[
                { label: "対象", value: total },
                { label: "完了", value: done,    color: "#256E45" },
                { label: "スキップ", value: skipped, color: "#9A6010" },
                { label: "失敗", value: failed,  color: "#B8302A" },
              ].map(s => (
                <div key={s.label} style={{
                  background: T.surface, borderRadius: 4,
                  padding: "8px 10px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color || T.text }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* ログ */}
            <div style={{
              background: "#1C1B18", borderRadius: 4, padding: 10,
              maxHeight: 180, overflowY: "auto",
              fontFamily: "DM Mono, JetBrains Mono, monospace",
            }}>
              {logs.map((log, i) => (
                <div key={i} style={{ fontSize: 10, color: "#AAA8A0", lineHeight: 1.6 }}>
                  {log}
                </div>
              ))}
              {running && (
                <div style={{ fontSize: 10, color: "#7A7769", animation: "pulse 1s infinite" }}>
                  処理中...
                </div>
              )}
            </div>

            {finished && (
              <button
                onClick={() => setBatchState({ running: false, total: 0, done: 0, skipped: 0, failed: 0, logs: [], finished: false })}
                style={{
                  marginTop: 10, padding: "6px 14px", fontSize: 11,
                  background: "transparent", border: `1px solid ${T.border}`,
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                リセット
              </button>
            )}
          </div>
        )}
      </div>

      {/* Embedding 設定（既存） */}
      <div style={card}>
        <label style={lb}>Embedding モデル</label>
        <div style={{ fontSize: 13 }}>Voyage AI voyage-3.5（1024次元）</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
          データ追加・更新時に自動的に呼び出されます。
        </div>
      </div>

      {/* テーブル */}
      <div style={card}>
        <label style={lb}>テーブル</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div>zeus_projects（プロジェクト）</div>
          <div>zeus_folders（フォルダ）</div>
          <div>zeus_items（データ本体）</div>
          <div>zeus_item_projects（データ↔プロジェクト 多対多）</div>
        </div>
      </div>

      {/* タイプ判定 */}
      <div style={card}>
        <label style={lb}>自動タイプ判定ロジック</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div>📝 テキスト — URL・ファイルなしのテキスト入力</div>
          <div>🔗 Webクリップ — 一般URLのみ（OGタグ自動取得）</div>
          <div>🎬 動画リンク — YouTube・Vimeo・Loom 等のURL</div>
          <div>📄 PDF — .pdf拡張子のURL</div>
          <div>🖼 画像 — .jpg/.png/.gif/.webp等</div>
          <div>🎵 音声 — .mp3/.wav/.m4a等</div>
        </div>
      </div>

      {/* Phase 状態 */}
      <div style={card}>
        <label style={lb}>Phase 状態</label>
        <div style={{ fontSize: 12, lineHeight: 2 }}>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 0：セットアップ</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 1：データモデル + 管理画面</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 2：双方向 API + MCP ツール化</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 3：データタイプ別ビュー + PDF テキスト抽出</div>
          <div style={{ color: T.muted }}>○ Phase 4：Web クリッパー</div>
          <div style={{ color: T.muted }}>○ Phase 5：AI 加工統合</div>
          <div style={{ color: T.muted }}>○ Phase 6：他アプリ連携の本格化</div>
        </div>
      </div>
    </div>
  );
}
