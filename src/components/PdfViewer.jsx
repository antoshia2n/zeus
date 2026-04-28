/**
 * PdfViewer.jsx
 * pdfjs-dist を CDN から動的ロードして PDF をレンダリングする。
 * CF Workers / Vite ビルドに pdf-parse を含めないため CDN 方式を採用。
 *
 * 罠 #2 対応：再帰コンポーネントなし、トップレベルで定義。
 */

import { useEffect, useRef, useState, useCallback } from "react";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const T = { muted: "#7A7769", border: "#E5E2D9", text: "#1C1B18", surface: "#FAFAF7" };

/**
 * pdfjs をグローバルにロードして返す（二重ロード防止）
 */
async function loadPdfjsLib() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDFJS_CDN;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return window.pdfjsLib;
}

/**
 * URL または ArrayBuffer から PDF テキストを全ページ抽出する
 * AddItemModal と Settings（バッチ処理）から呼べる公開関数
 */
export async function extractPdfText(source) {
  const pdfjsLib = await loadPdfjsLib();
  const loadingTask = pdfjsLib.getDocument(
    typeof source === "string" ? { url: source } : { data: source }
  );
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc   = await page.getTextContent();
    pages.push(tc.items.map(item => item.str).join(" "));
  }
  return pages.join("\n\n");
}

/**
 * PdfViewer コンポーネント
 * @param {{ url: string }} props
 */
export function PdfViewer({ url }) {
  const canvasRef = useRef(null);
  const [pdf,       setPdf]       = useState(null);
  const [pageNum,   setPageNum]   = useState(1);
  const [numPages,  setNumPages]  = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [scale,     setScale]     = useState(1.2);
  const renderTask  = useRef(null);

  // PDF ロード
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setPageNum(1);

    loadPdfjsLib()
      .then(lib => lib.getDocument({ url }).promise)
      .then(doc => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || "PDF の読み込みに失敗しました");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  // ページレンダリング
  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;
    if (renderTask.current) {
      renderTask.current.cancel();
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas   = canvasRef.current;
    const ctx      = canvas.getContext("2d");
    canvas.height  = viewport.height;
    canvas.width   = viewport.width;

    renderTask.current = page.render({ canvasContext: ctx, viewport });
    try {
      await renderTask.current.promise;
    } catch (e) {
      // キャンセルは無視
      if (e?.name !== "RenderingCancelledException") throw e;
    }
  }, [pdf, pageNum, scale]);

  useEffect(() => { renderPage(); }, [renderPage]);

  // キーボード操作
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setPageNum(n => Math.min(n + 1, numPages));
      }
      if (e.key === "ArrowLeft") {
        setPageNum(n => Math.max(n - 1, 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages]);

  if (error) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: "#B8302A", background: "#FEF3F2", borderRadius: 4 }}>
        {error}
        <div style={{ marginTop: 8 }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: "#2F54C8" }}>
            PDF を直接開く →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* コントロール */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "6px 8px", background: T.surface, borderRadius: 4, border: `1px solid ${T.border}`,
      }}>
        <button
          onClick={() => setPageNum(n => Math.max(n - 1, 1))}
          disabled={pageNum <= 1 || loading}
          style={btnStyle}
        >◀</button>

        <span style={{ fontSize: 11, color: T.muted }}>
          {loading ? "読み込み中..." : `${pageNum} / ${numPages}`}
        </span>

        <button
          onClick={() => setPageNum(n => Math.min(n + 1, numPages))}
          disabled={pageNum >= numPages || loading}
          style={btnStyle}
        >▶</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button onClick={() => setScale(s => Math.max(s - 0.2, 0.6))} style={btnStyle}>−</button>
          <span style={{ fontSize: 11, color: T.muted, minWidth: 32, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale(s => Math.min(s + 0.2, 2.4))} style={btnStyle}>＋</button>
        </div>

        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#2F54C8" }}>
          全画面 →
        </a>
      </div>

      {/* キャンバス */}
      <div style={{ overflowX: "auto", borderRadius: 4, border: `1px solid ${T.border}` }}>
        <canvas ref={canvasRef} style={{ display: "block", maxWidth: "100%" }} />
      </div>

      <div style={{ fontSize: 10, color: T.muted }}>
        ←→ キーまたは ▶ ボタンでページを移動
      </div>
    </div>
  );
}

const btnStyle = {
  padding: "2px 8px", fontSize: 12,
  background: "transparent", border: `1px solid ${T.border}`,
  borderRadius: 3, cursor: "pointer",
};
