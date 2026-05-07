/**
 * Settings.jsx
 * Phase 3 既存機能 + Notion同期（Phase 4 相当）追加
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

// ─── Notion 同期カード ──────────────────────────────────────────────────────────

function NotionSyncCard({ token }) {
  const [state, setState] = useState({
    running:  false,
    result:   null,   // { total_imported, by_source }
    error:    null,
    finished: false,
  });

  async function runSync(forceFullDelete) {
    setState({ running: true, result: null, error: null, finished: false });
    try {
      const res = await fetch("/api/ui/sync-from-notion", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ force_full: forceFullDelete }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      setState({ running: false, result: data, error: null, finished: true });
    } catch (e) {
      setState({ running: false, result: null, error: e.message, finished: true });
    }
  }

  const SOURCE_LABELS = {
    "notion-inbox":   "inbox",
    "notion-input":   "インプットDB",
    "notion-output":  "アウトプットDB",
    "notion-asset":   "アセットDB",
    "notion-project": "プロジェクトDB",
  };

  const { running, result, error, finished } = state;

  return (
    <div style={card}>
      <label style={lb}>Notion ナレッジ同期</label>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 14 }}>
        Notion ナレッジ5DB（inbox / インプット / アウトプット / アセット / プロジェクト）を
        Zeus pgvector に取り込みます。既存の notion-* アイテムは置き換えられます。
      </div>

      {!running && !finished && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => runSync(false)}
            style={{
              padding: "8px 20px", fontSize: 12, fontWeight: 600,
              background: "#1C1B18", color: "#FFF", border: "none",
              borderRadius: 4, cursor: "pointer",
            }}
          >
            同期する
          </button>
          <button
            onClick={() => runSync(true)}
            style={{
              padding: "8px 16px", fontSize: 12,
              background: "transparent", border: `1px solid ${T.border}`,
              borderRadius: 4, cursor: "pointer", color: T.muted,
            }}
          >
            全削除して同期（初回用）
          </button>
        </div>
      )}

      {running && (
        <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>
          同期中... Notion API → Voyage AI → Supabase の順に処理しています
        </div>
      )}

      {finished && result && (
        <div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: "#256E45", marginBottom: 10,
          }}>
            完了：{result.total_imported} 件を取り込みました
          </div>
          <div style={{
            background: T.surface, borderRadius: 4, padding: 10, marginBottom: 10,
          }}>
            {Object.entries(result.by_source || {}).map(([src, count]) => (
              <div key={src} style={{ fontSize: 12, lineHeight: 1.9, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: T.muted }}>{SOURCE_LABELS[src] || src}</span>
                <span style={{ fontWeight: 600 }}>{count} 件</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setState({ running: false, result: null, error: null, finished: false })}
            style={{
              padding: "6px 14px", fontSize: 11,
              background: "transparent", border: `1px solid ${T.border}`,
              borderRadius: 4, cursor: "pointer",
            }}
          >
            リセット
          </button>
        </div>
      )}

      {finished && error && (
        <div>
          <div style={{
            fontSize: 12, color: "#B8302A", background: "#FFF5F5",
            border: "1px solid #FFCCC7", borderRadius: 4, padding: "8px 12px", marginBottom: 10,
          }}>
            エラー: {error}
          </div>
          <button
            onClick={() => setState({ running: false, result: null, error: null, finished: false })}
            style={{
              padding: "6px 14px", fontSize: 11,
              background: "transparent", border: `1px solid ${T.border}`,
              borderRadius: 4, cursor: "pointer",
            }}
          >
            リセット
          </button>
        </div>
      )}
    </div>
  );
}

// ─── メイン Settings コンポーネント ────────────────────────────────────────────────

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

          await api.items.update({ item_id: item.id, content: text.trim() }, token);

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

      {/* Notion 同期（新規追加） */}
      <NotionSyncCard token={token} />

      {/* Phase 3：PDF 再処理バッチ（既存） */}
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
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8, marginBottom: 12,
            }}>
              {[
                { label: "対象",     value: total },
                { label: "完了",     value: done,    color: "#256E45" },
                { label: "スキップ", value: skipped, color: "#9A6010" },
                { label: "失敗",     value: failed,  color: "#B8302A" },
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
                <div style={{ fontSize: 10, color: "#7A7769" }}>
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

      {/* テーブル（既存） */}
      <div style={card}>
        <label style={lb}>テーブル</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div>zeus_projects（プロジェクト）</div>
          <div>zeus_folders（フォルダ）</div>
          <div>zeus_items（データ本体）</div>
          <div>zeus_item_projects（データ↔プロジェクト 多対多）</div>
        </div>
      </div>

      {/* タイプ判定（既存） */}
      <div style={card}>
        <label style={lb}>自動タイプ判定ロジック</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
          <div>テキスト — URL・ファイルなしのテキスト入力</div>
          <div>Webクリップ — 一般URLのみ（OGタグ自動取得）</div>
          <div>動画リンク — YouTube・Vimeo・Loom 等のURL</div>
          <div>PDF — .pdf拡張子のURL</div>
          <div>画像 — .jpg/.png/.gif/.webp等</div>
          <div>音声 — .mp3/.wav/.m4a等</div>
        </div>
      </div>

      {/* Phase 状態（既存） */}
      <div style={card}>
        <label style={lb}>Phase 状態</label>
        <div style={{ fontSize: 12, lineHeight: 2 }}>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 0：セットアップ</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 1：データモデル + 管理画面</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 2：双方向 API + MCP ツール化</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 3：データタイプ別ビュー + PDF テキスト抽出</div>
          <div style={{ color: "#256E45", fontWeight: 600 }}>✓ Phase 4：Notion ハイブリッド同期</div>
          <div style={{ color: T.muted }}>○ Phase 5：Web クリッパー</div>
          <div style={{ color: T.muted }}>○ Phase 6：AI 加工統合</div>
        </div>
      </div>
    </div>
  );
}
