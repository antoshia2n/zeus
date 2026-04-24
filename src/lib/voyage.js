/**
 * Voyage AI Embeddings API クライアント
 * 実際の呼び出しは Cloudflare Pages Functions の /api/voyage 経由
 * （APIキーをブラウザに露出させないため）
 */

/**
 * テキストをベクトル化する
 * @param {string|string[]} input - 単一テキストまたは配列
 * @param {"document"|"query"} inputType - document=保存用, query=検索用
 * @returns {Promise<number[]|number[][]>} - 単一入力なら1次元配列、配列入力なら2次元配列
 */
export async function embed(input, inputType = "document") {
  const isArray = Array.isArray(input);
  const texts = isArray ? input : [input];

  if (texts.length === 0) return isArray ? [] : null;

  const res = await fetch("/api/voyage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: texts,
      model: "voyage-3.5",
      input_type: inputType,
      output_dimension: 1024,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Voyage API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (!data?.data || !Array.isArray(data.data)) {
    throw new Error("Voyage API: invalid response shape");
  }

  const embeddings = data.data.map((d) => d.embedding);
  return isArray ? embeddings : embeddings[0];
}
