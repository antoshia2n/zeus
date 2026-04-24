# Zeus

> 全知全能のナレッジハブ。MuNiKis Phase 1 の中核アプリ。

## 概要

シアニンのエコシステムにおける**データ基盤・AI文脈層 [4.5]**。

複数のソース（Whimsical / Notion / メモ / 自作アプリ / 過去チャット）から集まったナレッジを1箇所に集約し、Voyage AI でベクトル化。shia2n-mcp 経由で Claude が意味検索できるようにする。

## 技術スタック

- React + Vite
- shia2n-core（AuthGuard / Supabase / Firebase / styles）
- Cloudflare Pages
- Supabase pgvector
- Voyage AI voyage-3.5（Embeddings）

## 前提条件

1. Supabase で pgvector 拡張が有効化されていること
2. `zs_entries` テーブルと `zs_match_entries` RPC 関数が作成されていること（`zeus_migration.sql` 参照）
3. Voyage AI アカウントとAPIキーが用意されていること
4. Firebase Auth の Authorized domains に Cloudflare URL が追加されていること

## 環境変数（Cloudflare Pages）

```
# Supabase / Firebase（既存の共通パターン）
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_ID

# Zeus 固有
ANTHROPIC_API_KEY           # 将来のAI機能用（当面未使用でも可）
VOYAGE_API_KEY              # ベクトル化に必須
MCP_INTERNAL_SECRET         # shia2n-mcp との間で共有する秘密鍵（長いランダム文字列）
```

## タブ構成

| タブ | 用途 |
|---|---|
| 投入 | テキスト貼り付け→保存。Whimsicalからのコピペ、Notionメモ等の入口 |
| 一覧 | エントリ一覧。source別フィルタ・展開・削除 |
| 検索 | ベクトル検索のテスト画面 |
| ソース | source別件数サマリ |

## shia2n-mcp から使う内部API

| エンドポイント | 内容 |
|---|---|
| POST `/api/internal/search` | ベクトル検索 |
| POST `/api/internal/add-entry` | エントリ追加（created_by='mcp'） |
| POST `/api/internal/list-sources` | source別件数 |

すべて `Authorization: Bearer ${MCP_INTERNAL_SECRET}` 必須。

## デプロイ

GitHub Web UI でコード更新 → Cloudflare Pages が自動デプロイ。

Build command: `npm run build`
Output directory: `dist`

## 関連ドキュメント

- `ROADMAP.md`（MuNiKis全体計画）
- `HANDOFF.md`（セッション引き継ぎ）
- `shia2n-ecosystem-map.md`（エコシステム全体像）
- `project-doc.md`（各アプリ共通設計資料）
