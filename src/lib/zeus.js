import { supabase } from "shia2n-core";
import { embed } from "./voyage.js";

/**
 * ユーザーのエントリ一覧取得（新しい順）
 */
export async function listEntries(uid, { limit = 100, source = null } = {}) {
  let q = supabase
    .from("zs_entries")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (source) q = q.eq("source", source);

  const { data, error } = await q;
  if (error) {
    console.error("[listEntries]", error);
    return { data: [], error };
  }
  return { data: data ?? [], error: null };
}

/**
 * エントリ追加（ベクトル化も同時に実行）
 */
export async function addEntry(uid, {
  title,
  content,
  source = "memo",
  source_app = null,
  source_ref = null,
  tags = [],
  created_by = "user",
}) {
  if (!title?.trim() || !content?.trim()) {
    return { data: null, error: new Error("title と content は必須") };
  }

  // ベクトル化（失敗してもエントリは保存する設計にするか検討だが、MVPでは必須）
  let embedding = null;
  try {
    embedding = await embed(`${title}\n\n${content}`, "document");
  } catch (e) {
    console.error("[addEntry] embed failed", e);
    return { data: null, error: e };
  }

  const row = {
    user_id:    uid,
    title:      title.trim(),
    content:    content.trim(),
    source,
    source_app,
    source_ref,
    tags,
    embedding,
    created_by,
  };

  const { data, error } = await supabase
    .from("zs_entries")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[addEntry]", error);
    return { data: null, error };
  }
  return { data, error: null };
}

/**
 * エントリ更新（内容が変わったら再ベクトル化）
 */
export async function updateEntry(id, patch, { reembed = false } = {}) {
  let updates = { ...patch, updated_at: new Date().toISOString() };

  if (reembed && (patch.title !== undefined || patch.content !== undefined)) {
    // 既存レコードを取得して結合テキストを作る
    const { data: existing } = await supabase
      .from("zs_entries")
      .select("title, content")
      .eq("id", id)
      .single();

    const title   = patch.title   ?? existing?.title   ?? "";
    const content = patch.content ?? existing?.content ?? "";

    try {
      updates.embedding = await embed(`${title}\n\n${content}`, "document");
    } catch (e) {
      console.error("[updateEntry] embed failed", e);
      return { data: null, error: e };
    }
  }

  const { data, error } = await supabase
    .from("zs_entries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[updateEntry]", error);
    return { data: null, error };
  }
  return { data, error: null };
}

/**
 * エントリ削除
 */
export async function deleteEntry(id) {
  const { error } = await supabase.from("zs_entries").delete().eq("id", id);
  if (error) {
    console.error("[deleteEntry]", error);
    return { error };
  }
  return { error: null };
}

/**
 * ベクトル類似度検索（RPC経由）
 */
export async function searchEntries(uid, query, {
  limit = 5,
  source = null,
} = {}) {
  if (!query?.trim()) return { data: [], error: null };

  let queryEmbedding;
  try {
    queryEmbedding = await embed(query.trim(), "query");
  } catch (e) {
    return { data: [], error: e };
  }

  const { data, error } = await supabase.rpc("zs_match_entries", {
    query_embedding: queryEmbedding,
    match_user_id:   uid,
    match_count:     limit,
    match_source:    source,
  });

  if (error) {
    console.error("[searchEntries]", error);
    return { data: [], error };
  }
  return { data: data ?? [], error: null };
}

/**
 * ソース別の件数集計
 */
export async function listSources(uid) {
  const { data, error } = await supabase
    .from("zs_entries")
    .select("source")
    .eq("user_id", uid);

  if (error) {
    console.error("[listSources]", error);
    return { data: [], error };
  }

  const counts = {};
  for (const row of data ?? []) {
    counts[row.source] = (counts[row.source] || 0) + 1;
  }

  const result = Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return { data: result, error: null };
}
