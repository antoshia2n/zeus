/**
 * Settings.jsx
 * Phase 4: Notion同期（per-DB順次呼び出し版）
 *
 * Cloudflare Pages Functionsのsubrequest上限（50回/invocation）回避のため、
 * 5DBを1つずつ順番にAPIへリクエストし、進捗をリアルタイム表示する。
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

const DBS = [
  { source: "notion-inbox",   label: "inbox" },
  { source: "notion-input",   label: "インプットDB" },
  { source: "notion-output",  label: "アウトプットDB" },
  { source: "notion-asset",   label: "アセットDB" },
  { source: "notion-project", label: "プロジェクトDB" },
];

// ─── Notion 同期カード ──────────────────────────────────────────────────────────

function NotionSyncCard({ token }) {
  // dbResults: { source → { status: "pending"|"running"|"done"|"error", imported, error } }
  const [dbResults, setDbResults] = useState(null);
  const [running,   setRunning]   = useState(false);
  const [finished,  setFinished]  = useState(false);

  function setDbState(source, patch) {
    setDbResults(prev => ({ ...prev, [source]: { ...(prev?.[source] || {}), ...patch } }));
  }

  async function runSync() {
    if (!token) {
      setDbResults({ _error: "ログイン情報が取得できていません。再読み込みしてください。" });
      setFinished(true);
      return;
    }

    // 初期化
    const init = {};
    DBS.forEach(d => { init[d.source] = { status: "pending", imported: 0, error: null }; });
    setDbResults(init);
    setRunning(true);
    setFinished(false);

    for (const { source } of DBS) {
      setDbState(source, { status: "running" });
      try {
        const res = await fetch("/api/ui/sync-notion-db", {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ source }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
        setDbState(source, { status: "done", imported: data.imported ?? 0 });
      } catch (e) {
        setDbState(source, { status: "error", error: e.message });
        // エラーが出ても残りのDBは続ける
      }
    }

    setRunning(false);
    setFinished(true);
  }

  function reset() {
    setDbResults(null);
    setRunning(false);
    setFinished(false);
  }

  const STATUS_ICON = { pending: "○", running: "…", done: "✓", error: "✗" };
  const STATUS_COLOR = { pending: T.muted, running: "#2F54C8", done: "#256E45", error: "#B8302A" };
  const totalImported = dbResults
    ? Object.values(dbResults).reduce((s, v) => s + (v?.imported || 0), 0)
    : 0;

  return (
    <div style={card}>
      <label style={lb}>Notion ナレッジ同期</label>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 14 }}>
        Notion ナレッジ5DB（inbox / インプット / アウトプット / アセット / プロジェクト）を
        Zeus pgvector に取り込みます。DBごとに順番に処理します。
      </div>

      {/* 初期ボタン */}
      {!running && !finished && (
        <button
          onClick={runSync}
          style={{
            padding: "8px 20px", fontSize: 12, fontWeight: 600,
            background: "#1C1B18", color: "#FFF",
            border: "none", borderRadius: 4, cursor: "pointer",
          }}
        >
          同期する
        </button>
      )}

      {/* DB別進捗（実行中 or 完了後） */}
      {dbResults && !dbResults._error && (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: "10px 12px", marginBottom: 12,
        }}>
          {DBS.map(({ source, label }) => {
            const s = dbResults[source] || { status: "pending" };
            return (
              <div key={source} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 12, lineHeight: 2.2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: STATUS_COLOR[s.status] || T.muted,
                    width: 12, textAlign: "center",
                  }}>
                    {s.status === "running"
                      ? <SpinnerInline />
                      : STATUS_ICON[s.status] || "○"}
                  </span>
                  <span style={{ color: T.text }}>{label}</span>
                </div>
                <div style={{ fontSize: 11 }}>
                  {s.status === "done"  && <span style={{ color: "#256E45", fontWeight: 600 }}>{s.imported} 件</span>}
                  {s.status === "error" && <span style={{ color: "#B8302A", fontSize: 10, maxWidth: 180, textAlign: "right", wordBreak: "break-all" }}>{s.error || "エラー"}</span>}
                  {s.status === "running" && <span style={{ color: "#2F54C8" }}>処理中...</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* グローバルエラー */}
      {dbResults?._error && (
        <div style={{
          fontSize: 12, color: "#B8302A", background: "#FFF5F5",
          border: "1px solid #FFCCC7", borderRadius: 4, padding: "8px 12px", marginBottom: 10,
        }}>
          {dbResults._error}
        </div>
      )}

      {/* 完了サマリ */}
      {finished && !dbResults?._error && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "#256E45", marginBottom: 10 }}>
          完了：合計 {totalImported} 件
        </div>
      )}

      {/* リセット */}
      {finished && (
        <button onClick={reset} style={{
          padding: "6px 14px", fontSize: 11,
          background: "transparent", border: `1px solid ${T.border}`,
          borderRadius: 4, cursor: "pointer",
        }}>
          リセット
        </button>
      )}
    </div>
  );
}

function SpinnerInline() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12"
      style={{ animation: "spin 1s linear infinite", display: "inline-block", verticalAlign: "middle" }}>
      <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
      <circle cx="6" cy="6" r="4" fill="none" stroke="#E5E2D9" strokeWidth="2"/>
      <path d="M6 2 A4 4 0 0 1 10 6" fill="none" stroke="#2F54C8" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ─── メイン Settings コンポーネント ────────────────────────────────────────────────

export default function Settings({ uid, token }) {
  const [batchState, setBatchState] = useState({
    running: false, total: 0, done: 0, skipped: 0, failed: 0, logs: [], finished: false,
  });

  function addLog(msg) {
    setBatchState(s => ({ ...s, logs: [msg, ...s.logs].slice(0, 50) }));
  }

  async function runPdfBatch() {
    if (!uid || !token) { addLog("UID または Token が取得できていません"); return; }
    setBatchState({ running: true, total: 0, done: 0, skipped: 0, failed: 0, logs: [], finished: false });
    try {
      const res = await api.items.list({ user_id: uid, item_type: "pdf", limit: "200" }, token);
      const pdfs = (res.items || []).filter(i => !i.content?.trim());
      setBatchState(s => ({ ...s, total: pdfs.length }));
      if (pdfs.length === 0) {
        addLog("テキスト抽出が必要な PDF はありません");
        setBatchState(s => ({ ...s, running: false, finished: true }));
        return;
      }
      addLog(`${pdfs.length} 件の PDF を処理します`);
      for (const item of pdfs) {
        const pdfUrl = item.file_url || item.source_url;
        if (!pdfUrl) { addLog(`スキップ：URL なし → ${item.title||item.id}`); setBatchState(s=>({...s,skipped:s.skipped+1})); continue; }
        try {
          addLog(`抽出中：${item.title||item.id}`);
          const text = await extractPdfText(pdfUrl);
          if (!text.trim()) { addLog(`スキップ：テキストなし → ${item.title||item.id}`); setBatchState(s=>({...s,skipped:s.skipped+1})); continue; }
          await api.items.update({ item_id: item.id, content: text.trim() }, token);
          addLog(`完了：${item.title||item.id}（${text.length.toLocaleString()} 文字）`);
          setBatchState(s=>({...s,done:s.done+1}));
        } catch(e) { addLog(`失敗：${item.title||item.id} → ${e.message}`); setBatchState(s=>({...s,failed:s.failed+1})); }
      }
      addLog("バッチ処理が完了しました");
    } catch(e) { addLog(`エラー：${e.message}`); }
    finally { setBatchState(s=>({...s,running:false,finished:true})); }
  }

  const { running, total, done, skipped, failed, logs, finished } = batchState;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>

      <NotionSyncCard token={token} />

      <div style={card}>
        <label style={lb}>既存 PDF の再処理（テキスト抽出バッチ）</label>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 14 }}>
          Phase 1 以前に投入された PDF で content が空のものを対象に、pdfjs-dist でテキストを抽出して保存します。
        </div>
        {!running && !finished && (
          <button onClick={runPdfBatch} style={{ padding:"8px 20px",fontSize:12,fontWeight:600,background:"#1C1B18",color:"#FFF",border:"none",borderRadius:4,cursor:"pointer" }}>
            PDF を再処理する
          </button>
        )}
        {(running||finished) && (
          <div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12 }}>
              {[{label:"対象",value:total},{label:"完了",value:done,color:"#256E45"},{label:"スキップ",value:skipped,color:"#9A6010"},{label:"失敗",value:failed,color:"#B8302A"}].map(s=>(
                <div key={s.label} style={{ background:T.surface,borderRadius:4,padding:"8px 10px",textAlign:"center" }}>
                  <div style={{ fontSize:18,fontWeight:700,color:s.color||T.text }}>{s.value}</div>
                  <div style={{ fontSize:10,color:T.muted }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"#1C1B18",borderRadius:4,padding:10,maxHeight:180,overflowY:"auto",fontFamily:"DM Mono,monospace" }}>
              {logs.map((log,i)=><div key={i} style={{fontSize:10,color:"#AAA8A0",lineHeight:1.6}}>{log}</div>)}
              {running && <div style={{fontSize:10,color:"#7A7769"}}>処理中...</div>}
            </div>
            {finished && (
              <button onClick={()=>setBatchState({running:false,total:0,done:0,skipped:0,failed:0,logs:[],finished:false})}
                style={{marginTop:10,padding:"6px 14px",fontSize:11,background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,cursor:"pointer"}}>
                リセット
              </button>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <label style={lb}>Embedding モデル</label>
        <div style={{ fontSize:13 }}>Voyage AI voyage-3.5（1024次元）</div>
        <div style={{ fontSize:11,color:T.muted,marginTop:4 }}>データ追加・更新時に自動的に呼び出されます。</div>
      </div>

      <div style={card}>
        <label style={lb}>テーブル</label>
        <div style={{ fontSize:12,color:T.muted,lineHeight:1.8 }}>
          <div>zeus_projects（プロジェクト）</div>
          <div>zeus_folders（フォルダ）</div>
          <div>zeus_items（データ本体）</div>
          <div>zeus_item_projects（データ↔プロジェクト 多対多）</div>
        </div>
      </div>

      <div style={card}>
        <label style={lb}>Phase 状態</label>
        <div style={{ fontSize:12,lineHeight:2 }}>
          <div style={{color:"#256E45",fontWeight:600}}>✓ Phase 0：セットアップ</div>
          <div style={{color:"#256E45",fontWeight:600}}>✓ Phase 1：データモデル + 管理画面</div>
          <div style={{color:"#256E45",fontWeight:600}}>✓ Phase 2：双方向 API + MCP ツール化</div>
          <div style={{color:"#256E45",fontWeight:600}}>✓ Phase 3：データタイプ別ビュー + PDF テキスト抽出</div>
          <div style={{color:"#256E45",fontWeight:600}}>✓ Phase 4：Notion ハイブリッド同期</div>
          <div style={{color:T.muted}}>○ Phase 5：Web クリッパー</div>
          <div style={{color:T.muted}}>○ Phase 6：AI 加工統合</div>
        </div>
      </div>
    </div>
  );
}
