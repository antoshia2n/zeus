-- Zeus v2 Phase 1 テーブルセットアップ
-- Supabase SQL Editor で全文貼り付け → Run
-- 前提：pgvector 拡張は Phase 0 で有効化済み（念のため冪等で実行）

CREATE EXTENSION IF NOT EXISTS vector;

-- プロジェクト（自己参照階層、データと多対多）
CREATE TABLE zeus_projects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  parent_id       uuid        REFERENCES zeus_projects(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  description     text,
  order_index     integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- フォルダ（Zeus 内部の整理用、自己参照階層）
CREATE TABLE zeus_folders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  parent_id       uuid        REFERENCES zeus_folders(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  order_index     integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- データ本体
CREATE TABLE zeus_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  folder_id       uuid        REFERENCES zeus_folders(id) ON DELETE SET NULL,
  item_type       text        NOT NULL DEFAULT 'text',
  title           text,
  content         text,
  source_url      text,
  file_url        text,
  metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  embedding       vector(1024),
  source_app      text        NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- データ ↔ プロジェクト（多対多）
CREATE TABLE zeus_item_projects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid        NOT NULL REFERENCES zeus_items(id) ON DELETE CASCADE,
  project_id      uuid        NOT NULL REFERENCES zeus_projects(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, project_id)
);

-- RLS 無効（他アプリと同じ方針）
ALTER TABLE zeus_projects      DISABLE ROW LEVEL SECURITY;
ALTER TABLE zeus_folders        DISABLE ROW LEVEL SECURITY;
ALTER TABLE zeus_items          DISABLE ROW LEVEL SECURITY;
ALTER TABLE zeus_item_projects  DISABLE ROW LEVEL SECURITY;

-- インデックス
CREATE INDEX idx_zeus_projects_user   ON zeus_projects(user_id, order_index);
CREATE INDEX idx_zeus_projects_parent ON zeus_projects(parent_id);
CREATE INDEX idx_zeus_folders_user    ON zeus_folders(user_id, order_index);
CREATE INDEX idx_zeus_folders_parent  ON zeus_folders(parent_id);
CREATE INDEX idx_zeus_items_user      ON zeus_items(user_id, updated_at DESC);
CREATE INDEX idx_zeus_items_folder    ON zeus_items(folder_id);
CREATE INDEX idx_zeus_items_type      ON zeus_items(item_type);
CREATE INDEX idx_zeus_item_projects_project ON zeus_item_projects(project_id);
CREATE INDEX idx_zeus_item_projects_item    ON zeus_item_projects(item_id);

-- ベクトル検索用インデックス（IVFFlat）
-- ※ データが少ない初期は lists=10 で問題ない。1000件超えたら lists=100 に変更推奨
CREATE INDEX idx_zeus_items_embedding ON zeus_items
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- ベクトル類似度検索 RPC（管理画面・MCP から呼び出し）
CREATE OR REPLACE FUNCTION zeus_match_items(
  query_embedding  vector(1024),
  match_user_id    text,
  match_count      int     DEFAULT 20,
  match_project_id uuid    DEFAULT NULL,
  match_item_types text[]  DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  title       text,
  content     text,
  item_type   text,
  source_url  text,
  folder_id   uuid,
  metadata    jsonb,
  source_app  text,
  similarity  float,
  created_at  timestamptz,
  updated_at  timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    i.id,
    i.title,
    i.content,
    i.item_type,
    i.source_url,
    i.folder_id,
    i.metadata,
    i.source_app,
    1 - (i.embedding <=> query_embedding) AS similarity,
    i.created_at,
    i.updated_at
  FROM zeus_items i
  WHERE
    i.user_id = match_user_id
    AND i.embedding IS NOT NULL
    AND (match_item_types IS NULL OR i.item_type = ANY(match_item_types))
    AND (
      match_project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM zeus_item_projects ip
        WHERE ip.item_id = i.id AND ip.project_id = match_project_id
      )
    )
  ORDER BY i.embedding <=> query_embedding
  LIMIT match_count;
$$;
