/**
 * GET /api/diag — 設定の「有無」と、管理者キーで表に届くかだけを返す（Zeus）
 *
 * ログインの外側に置くため、値も件数も一切返さない（あり／なし・届く／届かない のみ）。
 * 外部への課金が発生する呼び出し・書き込みは行わない。
 *
 * 正本：2026-07-30 決定「画面は公開キーでデータベースに直接触らない」
 */

import { checkSupaConfig } from "../_shared/supabase.js";

export async function onRequestGet({ env }) {
  const 設定 = {
    管理者キー:           !!env.SUPABASE_SERVICE_ROLE_KEY,
    データベースの住所:   !!(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    "取り込み用のトークン": !!env.NOTION_API_KEY,
    ベクトル生成の鍵:     !!env.VOYAGE_API_KEY,
  };

  const config = checkSupaConfig(env);
  let 到達 = { ok: false, detail: "未確認" };

  if (config.ok) {
    const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL).replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = await fetch(`${url}/rest/v1/zeus_items?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        到達 = { ok: false, detail: `表に届きません（応答コード ${res.status}）` };
      } else {
        const rows = await res.json().catch(() => []);
        到達 = Array.isArray(rows) && rows.length > 0
          ? { ok: true,  detail: "管理者キーで表に届いた（データあり）" }
          : { ok: false, detail: "届いたがデータが0件。閉じる前に確認が必要" };
      }
    } catch (e) {
      到達 = { ok: false, detail: "接続に失敗しました" };
    }
  } else {
    到達 = { ok: false, detail: config.detail };
  }

  const 不足 = Object.entries(設定).filter(([, v]) => !v).map(([k]) => k);

  return new Response(
    JSON.stringify(
      {
        判定: 不足.length === 0 && 到達.ok ? "OK" : "NG",
        要約: 不足.length ? `設定が足りません：${不足.join(" / ")}` : 到達.detail,
        設定: 設定,
        表への到達: 到達,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
