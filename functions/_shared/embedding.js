/**
 * Voyage AI Embedding 生成
 * Cloudflare Pages Functions からのみ呼ぶ（サーバー側）
 */
const VOYAGE_MODEL    = "voyage-3.5";
const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MAX_CHARS       = 120000; // voyage-3.5 の token 制限の保守的な上限

/**
 * テキストを 1024 次元ベクトルに変換する
 * @param {string} text
 * @param {Env} env - { VOYAGE_API_KEY }
 * @returns {Promise<number[]>} 1024 次元の数値配列
 */
export async function generateEmbedding(text, env) {
  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY not configured");
  }
  if (!text?.trim()) {
    throw new Error("text is empty");
  }

  const trimmed = text.slice(0, MAX_CHARS);

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      input: [trimmed],
      model: VOYAGE_MODEL,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 1024) {
    throw new Error("Unexpected Voyage API response shape");
  }

  return embedding;
}

/**
 * item の title + content を結合して Embedding を生成する
 * どちらかだけでも動くようにフォールバック付き
 */
export async function generateItemEmbedding({ title, content }, env) {
  const parts = [];
  if (title?.trim())   parts.push(title.trim());
  if (content?.trim()) parts.push(content.trim());
  if (parts.length === 0) return null;
  return generateEmbedding(parts.join("\n\n"), env);
}
