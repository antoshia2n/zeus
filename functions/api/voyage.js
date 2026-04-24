/**
 * Voyage AI Embeddings API プロキシ
 * ブラウザから直接叩くとAPIキーが漏れるため、必ずここを経由させる
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.VOYAGE_API_KEY) {
    return json({ error: "VOYAGE_API_KEY not configured" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid json body" }, 400);
  }

  if (!body?.input) {
    return json({ error: "input required" }, 400);
  }

  const upstream = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model:            body.model            || "voyage-3.5",
      input:            body.input,
      input_type:       body.input_type       || undefined,
      output_dimension: body.output_dimension || 1024,
    }),
  });

  const data = await upstream.json().catch(() => ({ error: "upstream returned non-json" }));
  return json(data, upstream.status);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
