# Channel Documents Export 設計書

**プロジェクト名**：Channel Documents Export（社内ナレッジ抽出自動化）
**作成日**：2026-04-17
**オーナー**：Ray（Channel Corporation / 日本CSMチーム Manager）
**対象読者**：非エンジニアの社内運用担当者・本国エンジニア双方

---

## 1. エグゼクティブサマリー（経営報告向け）

| 項目 | 内容 |
|------|------|
| 目的 | チャネルトークDocumentsの記事データを定期的にCSV化し、社内ナレッジ管理・AI学習素材・翻訳チェック等に二次利用する |
| 背景 | これまで記事の棚卸し・コピペ・差分確認はすべて手作業。250件/月規模になると1回2〜3時間の手動工数 |
| 効果 | 1回あたり **2〜3時間 → 5秒** に短縮。属人化解消／分析基盤化 |
| 投資 | 開発：Claude Code で完了（追加費用ゼロ）／運用：APIキーのみ |
| リスク | APIキー漏洩のみ。`.env` 分離＋`.gitignore` 除外で対策済み |

---

## 2. プロジェクト背景と目的

### 2.1 背景（なぜ必要か）
- チャネルトークDocumentsは **SaaS上のGUIでしか中身を見られない**。一覧CSV・検索・差分確認機能が弱い
- 社内AI活用（ALF/NotionAI/Claude）用の学習素材としてテキスト化が必要
- 多言語（ja/ko/en）展開時、翻訳漏れ・更新漏れを**人手で目視確認**しており限界に来ている

### 2.2 目的（何を達成するか）
1. Documents記事を **1コマンド** でエクスポートできる状態にする
2. 出力CSVは **Excelで即開けるUTF-8 BOM付き** とし、非エンジニアも扱える
3. **本文は読めるプレーンテキスト**（内部JSON構造を隠蔽）
4. 将来的な **Notion連携・差分分析・多言語並列取得** に拡張可能な設計にする

### 2.3 非目的（スコープ外）
- 記事の作成・編集（Write系API）は扱わない（今回はRead専用）
- Web UIは作らない（CLIで完結）
- 添付画像バイナリのダウンロードは行わない（URL文字列のみ保持）

---

## 3. システム全体構成

```
┌─────────────────────┐      HTTPS (Basic Auth)       ┌──────────────────────────┐
│  Rayのローカル PC   │ ─────────────────────────────▶│ Channel Documents API    │
│  (macOS / Node.js)  │ ◀──── JSON (25件/ページ) ──── │ document-api.channel.io  │
└─────────┬───────────┘                               └──────────────────────────┘
          │
          │ CSV書き出し
          ▼
┌───────────────────────────────────────┐
│ /Users/ray/Desktop/                   │
│   channel_articles_YYYYMMDD.csv       │
│   （UTF-8 BOM付き・Excel対応）          │
└───────────────────────────────────────┘
```

### 3.1 構成要素
| 要素 | 技術 | 理由 |
|------|------|------|
| 実行環境 | Node.js 20+ (macOS標準)   | 追加ランタイム不要 |
| 認証 | Basic Auth（base64）     | Documents API公式仕様 |
| 設定管理 | `.env` + `--env-file` フラグ | 外部ライブラリ不要・キー分離 |
| 出力 | CSV（UTF-8 BOM）           | Excelで文字化けなし |
| バージョン管理 | Git（ローカル）| `.env` は `.gitignore` で除外 |

---

## 4. ディレクトリ・ファイル構成

```
/Users/ray/channel-docs-export/
├── .env                  ← 実キー保存（Git除外）
├── .env.example          ← 他人と共有する雛形
├── .gitignore            ← .env / *.csv を除外
├── export-articles.mjs   ← 実行スクリプト本体
└── DESIGN.md             ← 本設計書
```

### 4.1 各ファイルの役割

| ファイル | 役割 | 変更頻度 |
|----------|------|----------|
| `.env` | Access Key / Secret / 言語 / 出力先 | キー再発行時のみ |
| `.env.example` | チーム展開用のテンプレート | 設定項目追加時 |
| `.gitignore` | 機密情報のGit誤コミット防止 | 原則不変 |
| `export-articles.mjs` | API呼び出し→CSV生成ロジック | 機能追加時 |

---

## 5. 機能仕様

### 5.1 処理フロー（5ステップ）

```
① 環境変数ロード
    ↓
② 疎通確認 GET /spaces/$me
    ↓ (401/403なら即終了)
③ 記事一覧ページング取得 GET /spaces/$me/articles?limit=25
    ↓ (全件取得まで繰り返し／10req/sec制限遵守)
④ 正規化処理（bodyのJSONツリーをプレーンテキスト抽出）
    ↓
⑤ CSV書き出し（UTF-8 BOM + タイムスタンプ付きファイル名）
```

### 5.2 CSV列定義（v2 : 本文プレーンテキスト化対応版）

| 列名 | 型 | 説明 | 出典フィールド |
|------|---|------|----------------|
| id | string | 記事ID | `id` |
| title | string | タイトル | `title` / `name` |
| state | enum | `draft` / `published` / `unpublished` | `state` |
| category | string | トピックID（複数は `;` 区切り） | `topicIds` |
| summary | string | 記事要約 | `summary` |
| createdAt | epoch ms | 作成日時 | `createdAt` |
| updatedAt | epoch ms | 更新日時 | `updatedAt` |
| slug | string | URL用スラッグ | `slug` |
| **bodyText** | string | **本文プレーンテキスト** | `body`(JSON) を再帰展開 |
| bodyHtml | string | リッチ形式が必要な場合用 | `bodyHtml` |

### 5.3 本文抽出ロジック（ProseMirror JSON → テキスト）

チャネルDocumentsの `body` は下記のような入れ子JSONで返却されます：
```json
{"type":"heading","content":[{"type":"plain","attrs":{"text":"タイトル"}}]}
```

抽出関数 `extractPlainText(node)` は以下の再帰ルールで走査：
- `type: "plain"` / `type: "text"` → `attrs.text` を抽出
- `content` 配列がある → 子ノードを順次再帰
- `heading` / `paragraph` / `listItem` / `bullets` の終端で改行挿入
- 3連続以上の改行は2つに圧縮（可読性確保）

body が欠損している場合は `bodyHtml` から HTMLタグを除去してフォールバック。

---

## 6. 認証・セキュリティ設計

### 6.1 認証フロー（Basic Auth）

```
Authorization: Basic <base64(ACCESS_KEY:ACCESS_SECRET)>
```

### 6.2 セキュリティ対策サマリ

| リスク | 対策 | 実装箇所 |
|--------|------|----------|
| キーのコード同梱 | `.env` 分離＋環境変数経由ロード | `export-articles.mjs` 5–6行 |
| キーのGit流出 | `.gitignore` に `.env` 明示除外 | `.gitignore` |
| CSV内の顧客情報流出 | `*.csv` も `.gitignore` で除外 | `.gitignore` |
| キー誤入力で延々リトライ | 疎通確認で即時 401 判定 | `checkConnection()` |
| レート制限超過 | 120ms/request + 429時1秒待機自動リトライ | `fetchAllArticles()` |

### 6.3 キー発行手順（運用担当者向け）
1. Channel Desk → **Documents** → 該当スペース → **Space Settings** → **API Keys**
2. 「Create」で Access Key と Access Secret を取得（**Secret は作成直後しか表示されない**）
3. `/Users/ray/channel-docs-export/.env` に貼り付け保存

※ **Channel Desk本体の「API Keys」（Chat API用）では動きません**。必ず Documents スペース配下から発行。

---

## 7. 運用手順

### 7.1 初回セットアップ（1回のみ）
```bash
# 1. APIキーを .env に設定
open -a TextEdit /Users/ray/channel-docs-export/.env
```

### 7.2 定常実行（2回目以降）
Claude Code に「**記事エクスポートして**」と依頼するだけ。内部で以下が実行される：
```bash
cd /Users/ray/channel-docs-export && node --env-file=.env export-articles.mjs
```

### 7.3 出力先
`/Users/ray/Desktop/channel_articles_YYYYMMDD.csv`
（日付入りのため過去分は自動で残存）

---

## 8. エラーハンドリング設計

| HTTPステータス | 原因 | 自動対応 | 運用担当者への案内 |
|---------------|------|----------|---------------------|
| 401 Unauthorized | キー誤り／無効化 | 即時停止 | キー再発行して `.env` 更新 |
| 403 Forbidden | スコープ不足 | 即時停止 | キー権限に「articles:read」追加 |
| 429 Too Many Requests | レート超過 | 1秒待機後リトライ | 通常は自動回復。多発時は `limit` を下げる |
| 500系 | API側障害 | エラー投出 | 時間を置いて再実行 |
| body JSONパース失敗 | 新規フォーマット | フォールバック（HTML→テキスト変換） | ログに記事ID記録／調査 |

---

## 9. 性能要件

| 指標 | 目標値 | 実測値（3件時点） |
|------|--------|-------------------|
| レート制限遵守 | 10 req/sec以下 | 約8 req/sec（120ms間隔） |
| 1,000件取得所要時間 | 3分以内 | 推定 約2分（25件/page × 40ページ × 120ms） |
| メモリ使用量 | 500MB以内 | 記事本文依存（通常問題なし） |

---

## 10. 拡張ロードマップ

### Phase 1（完了）
- [x] 疎通確認＋全記事取得
- [x] CSV書き出し（UTF-8 BOM）
- [x] 本文JSON→プレーンテキスト化

### Phase 2（推奨・次優先）
- [ ] **多言語並列取得**：ja / ko / en を1ファイルに横並びで出力し、翻訳漏れ検出
- [ ] **差分出力**：前回CSVと比較し「新規／更新／削除」のみ抽出（`export-diff.mjs`）
- [ ] **Notion DB自動投入**：更新された記事のみNotion側にupsert

### Phase 3（将来・運用自動化）
- [ ] **スケジュール実行**：毎朝8時cronで自動エクスポート＋Slack通知
- [ ] **ALF学習用フォーマット**：Markdown化しAI学習用ディレクトリへ自動配置
- [ ] **棚卸しダッシュボード**：最終更新から30日経過の記事を可視化

---

## 11. 付録

### 11.1 APIエンドポイント一覧（今回使用分）
| メソッド | パス | 用途 |
|---------|------|------|
| GET | `/open/v1/spaces/$me` | 疎通確認・スペース情報取得 |
| GET | `/open/v1/spaces/$me/articles?language={lang}&limit=25&order=asc` | 記事一覧（ページング） |

Base URL：`https://document-api.channel.io`
公式ドキュメント：[Welcome the Documents Open API](https://developers.channel.io/en/articles/Welcome-fb13f66b)

### 11.2 環境変数定義
| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `CHANNEL_DOC_ACCESS_KEY` | ✅ | なし | Documentsスペース発行のAccess Key |
| `CHANNEL_DOC_ACCESS_SECRET` | ✅ | なし | 同 Access Secret |
| `CHANNEL_DOC_LANGUAGE` | - | `ja` | 取得対象言語（`ja`/`ko`/`en`等） |
| `CHANNEL_DOC_OUTPUT_DIR` | - | `/Users/ray/Desktop` | CSV出力先 |

---

## 12. アップデート提案（次回のご検討事項）

- **A案：多言語同時取得**（Phase 2最優先）— 翻訳運用負荷が現在一番大きいためROI最大
- **B案：Notion自動連携** — AXチーム全体への展開時に効く。CSVから1ステップ前進
- **C案：日次スケジュール化** — 手動実行を忘れるリスクゼロ化。運用が軌道に乗ってから推奨

ご希望あれば、いずれかを次ステップとして実装します。
