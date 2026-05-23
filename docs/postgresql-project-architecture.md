# PostgreSQL 專案架構建議

日期：2026-05-23

## 結論

本專案採用 PostgreSQL 作為主要資料庫。會計系統需要交易一致性、資料關聯、稽核紀錄、期間鎖定與報表勾稽，PostgreSQL 比 SQLite 更接近正式上線鏈路，也方便日後擴充 OCR worker、多人後台與報表查詢。

目前本機 `psql`、`initdb`、`pg_ctl`、`postgres` 不在 PATH，因此尚未確認有可直接使用的 PostgreSQL binary。後續需要在下列方案中選一種。

## 安裝/執行方案

### 方案 A：本機 PostgreSQL binary + 專案內資料目錄

適合：電腦已有 PostgreSQL 或可接受安裝 PostgreSQL binary。

特性：

- PostgreSQL 程式本身在系統或 App 內。
- 資料庫資料、log、socket、設定檔都放在本專案資料夾。
- 最接近正式 PostgreSQL 運作方式。

專案資料：

```text
會計軟體/
  .data/
    postgres/
    postgres-run/
    logs/
```

概念命令：

```bash
initdb -D .data/postgres
pg_ctl -D .data/postgres \
  -l .data/logs/postgres.log \
  -o "-p 55432 -k $(pwd)/.data/postgres-run" \
  start
createdb -h 127.0.0.1 -p 55432 accounting_dev
```

連線字串：

```text
DATABASE_URL="postgresql://127.0.0.1:55432/accounting_dev"
```

### 方案 B：Docker Compose + 專案內 volume

適合：可接受 Docker daemon 與 Docker image 在系統層，但資料仍留在專案資料夾。

特性：

- 安裝與執行最穩定。
- 團隊成員容易重現環境。
- Docker 本身不是專案內部資產。

專案資料：

```text
會計軟體/
  docker-compose.yml
  .data/
    postgres/
```

連線字串：

```text
DATABASE_URL="postgresql://accounting:accounting@127.0.0.1:55432/accounting_dev"
```

### 方案 C：Portable PostgreSQL binary 放在專案 `.bin/`

適合：非常在意專案隔離，不想依賴系統 PostgreSQL。

特性：

- PostgreSQL binary、資料、log 都可放專案內。
- macOS 上維護成本較高，需注意 CPU 架構、lib 依賴與更新。
- 不建議當第一選擇，除非隔離需求高於維護成本。

結構：

```text
會計軟體/
  .bin/
    postgres/
  .data/
    postgres/
```

## 建議選擇

開發階段建議優先用「方案 A」或「方案 B」：

- 若本機已有 PostgreSQL：用方案 A。
- 若本機沒有 PostgreSQL 但有 Docker：用方案 B。
- 若兩者都沒有，再決定是否安裝 PostgreSQL binary 或採 portable 方案。

## 專案資料夾結構

```text
會計軟體/
  app/
    web/                         # 前後端網站
  docs/
    taiwan-accounting-software-feature-breakdown.md
    postgresql-project-architecture.md
  prisma/
    schema.prisma
    migrations/
  storage/
    uploads/                     # 原始 PDF / 圖片 / Excel
    exports/                     # 報表匯出
  .data/
    postgres/                    # PostgreSQL data directory 或 Docker bind mount
    postgres-run/                # socket / pid
    logs/
  .cache/
    npm/
    pip/
  .env.local
  .gitignore
  package.json
```

## 資料隔離規則

為避免資料混用，專案應加入以下硬規則：

- `DATABASE_URL` 必須使用 `127.0.0.1:55432` 或專案內 socket，不使用預設 `5432`。
- PostgreSQL data directory 必須位於 `/Users/rbin/Documents/Codex/會計軟體/.data/postgres`。
- 上傳檔案只能寫入 `/Users/rbin/Documents/Codex/會計軟體/storage/uploads`。
- 匯出檔案只能寫入 `/Users/rbin/Documents/Codex/會計軟體/storage/exports`。
- `.data/`、`storage/uploads/`、`.env.local` 不提交版本控制。
- 啟動程式時檢查 `DATABASE_URL`，若不是專案指定 port 或 socket，直接拒絕啟動。

## PostgreSQL 第一版資料表

第一版先只建 OCR 與報表鏈路，不做完整 ERP：

```text
users
companies
company_users
accounting_periods
documents
ocr_jobs
ocr_extractions
review_tasks
vat_returns
financial_statement_lines
validation_results
audit_logs
exports
```

## 核心資料流

### 401 表

```text
上傳 PDF / 圖片
  -> documents
  -> ocr_jobs
  -> ocr_extractions
  -> review_tasks
  -> validation_results
  -> vat_returns
  -> exports
```

### 資產負債表

```text
上傳 PDF / 圖片 / Excel
  -> documents
  -> ocr_jobs
  -> ocr_extractions
  -> review_tasks
  -> validation_results
  -> financial_statement_lines
  -> exports
```

## 建議下一步

1. 確認採用方案 A 或 B。
2. 建立專案骨架：Next.js、Prisma、PostgreSQL 連線設定。
3. 建立 `.data/`、`storage/`、`.env.local` 與啟動檢查。
4. 建立第一版 Prisma schema。
5. 建立文件上傳、OCR 任務列表、人工複核、401/資產負債表資料頁。
