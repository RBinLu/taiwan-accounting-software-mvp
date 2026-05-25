# 台灣會計 OCR 後台

這是一個以台灣中小企業、記帳士與會計師事務所流程為核心的會計 OCR 後台。第一版目標是先打通「文件上傳、OCR 任務、人工複核、401 / 財報資料入庫、報表中心」的資料鏈路，再逐步擴充成完整會計循環。

目前產品骨架包含：

- OCR 文件入口：文件上傳、OCR job、複核任務、資料入庫狀態。
- 會計核心：科目表、分錄 / 傳票、總帳、試算表。
- 營運模組：應收、應付、銀行對帳、銀行匯入、稅務、財報、附件。
- 管理模組：權限、審核、匯出、稽核軌跡、批次診斷。
- PostgreSQL + Prisma 資料模型，並要求本機資料留在專案資料夾內。

## 版本回報

| 版本 | 日期 | GitHub 推送狀態 | 內容摘要 | 驗證 |
| --- | --- | --- | --- | --- |
| `v1.0.6` | 2026-05-25 | 已推送 | 修復已初始化 OWNER 管理員仍重新產生 bootstrap one-time password 狀態檔的問題；既有管理員只維持啟用，不再覆寫密碼或重開首次登入流程，並完成外部 Chrome session 的權限頁驗證。 | `npm run verify`、Chrome 外網 `/permissions` / `/audit` / `/company-settings` 驗證 |
| `v1.0.5` | 2026-05-25 | 已推送 | 修復右上角設定 / 通知 hover 選單在按鈕與面板間移動時消失的 UX 問題；以延伸 `.topbar-tool` 互動區域處理，不改動既有視覺位置與樣式。 | `npm run lint`、`npm run test`、`npm run build`、Chrome 外網 hover bridge 驗證 |
| `v1.0.4` | 2026-05-25 | 已推送 | 修復外部網域完整操作：production CSP 允許 Next hydration、表單改有原生 POST fallback 並修正 async submit reset 錯誤、ACCOUNTANT 只顯示授權入口且未授權頁導到 `/forbidden`、文件列表不再暴露 storage path、OCR 分流支援 PDF / JPG / CSV / XLSX 入庫與安全略過非 OCR 表格檔。未改動既有 UI/UX 視覺設定。 | `npm run lint`、`npm run test`、`npm run build`、Chrome 外網 JPG / PDF / XLSX / CSV 上傳、搜尋、權限與選單驗證 |
| `v1.0.3` | 2026-05-25 | 已推送 | 推送目前工作區版本：補上 ACCTLY SaaS deck 交付檔、模組頁公司資訊欄位加寬以避免長公司名壓縮、期別鎖帳區塊加入完成度與更清楚的月結檢查狀態。 | `npm run test`、`npm run build` |
| `v1.0.2` | 2026-05-25 | 已推送 | 修復外網操作穩定性：OCR 任務不再因讀取權限導回登入、文件上傳支援外部網域原生 multipart fallback、手機常見圖片格式與 25MB 上限納入上傳驗證、主選單改為一次只展開一個群組並移除 hover 疊開問題。未改動既有 UI/UX 視覺設定。 | `npm run test`、`npm run build`、Chrome 外網選單驗證 |
| `v1.0.1` | 2026-05-24 | 已推送 | 修復 code review 發現的三個一致性問題：固定資產既有資料禁止直接改動取得日 / 成本 / 殘值 / 耐用月數以避免總帳不同步、固定資產併發建立遇 unique 衝突時改走安全更新流程、匯出 CSV 移出長交易並在 DB / audit 失敗時清理剛產生的檔案。未調整既有 UI/UX 設定。 | `npm run verify` |
| `v1.0.0` | 2026-05-24 | 已推送 | 以 `karpathy-guidelines` 原則完成第一輪非 UI/UX 程式碼穩定性強化：固定核心套件版本、補上 lint / test / verify 指令、強化 API 稽核寫入交易一致性、改善會計工作流併發保護與固定資產更新邏輯，並新增核心流程測試。未調整既有 UI/UX 設定。 | `npm run lint`、`npm run test`、`npm run db:validate`、`npm run build` |

## 技術棧

- Monorepo：npm workspaces
- Web app：Next.js App Router
- UI：React、CSS in `globals.css`、lucide-react icons
- Database：PostgreSQL 16 via Docker Compose
- ORM：Prisma 6
- Runtime：Node.js

## 本機啟動

第一次啟動：

```bash
npm_config_cache=.cache/npm npm install
npm run setup:dirs
npm run db:up
npm run db:migrate
npm run dev
```

網站預設位置：

```text
http://127.0.0.1:3000
```

常用指令：

```bash
npm run dev              # 啟動 Next.js 開發伺服器
npm run build            # 建置 web app
npm run db:up            # 啟動 PostgreSQL
npm run db:down          # 停止 PostgreSQL
npm run db:migrate       # Prisma migration
npm run db:generate      # 產生 Prisma client
npm run db:studio        # 開啟 Prisma Studio
npm run db:backup        # 備份資料庫到 storage/backups
npm run db:restore -- storage/backups/accounting_dev-YYYYMMDD-HHMMSS.sql
npm run seed:random      # 產生隨機會計測試資料
```

## 本機資料隔離

專案刻意避免使用系統預設 PostgreSQL port。開發資料庫固定使用：

```text
postgresql://accounting:accounting@127.0.0.1:55432/accounting_dev
```

資料固定放在本專案資料夾：

```text
.data/postgres       PostgreSQL data directory / Docker bind mount
.data/postgres-run   PostgreSQL socket / pid 預留目錄
.data/logs           PostgreSQL log 預留目錄
storage/uploads      上傳原始檔
storage/exports      匯出檔案
storage/backups      資料庫備份
.cache/npm           npm 快取
```

`app/web/src/lib/project-paths.js` 會檢查 `DATABASE_URL` 必須使用 `127.0.0.1:55432` 或 `localhost:55432`，避免誤連到其他本機資料庫。

## 專案結構

```text
.
├── app/web/                         Next.js 後台
│   ├── src/app/                     App Router 頁面與 API routes
│   ├── src/components/              UI components 與互動 action components
│   └── src/lib/                     Prisma、權限、會計邏輯、格式化、檔案路徑
├── docs/                            產品、資料庫與備份設計文件
├── prisma/                          Prisma schema 與 migrations
├── scripts/                         本機目錄、備份、還原、權限、測試資料腳本
├── storage/                         uploads / exports / backups / local security files
├── docker-compose.yml               PostgreSQL 16 開發資料庫
├── package.json                     workspace scripts
└── README.md
```

## 主要文件

- `docs/taiwan-accounting-software-feature-breakdown.md`：台灣會計軟體功能拆解、OCR 文件類型、401 / 財報欄位、MVP 階段規劃。
- `docs/postgresql-project-architecture.md`：PostgreSQL 選型、資料隔離規則、第一版資料流。
- `docs/db-security-and-backup.md`：資料庫帳號分層、最小權限 runtime role、備份與還原策略。

## Web App 頁面

主要頁面：

| Route | 用途 | 主要檔案 |
| --- | --- | --- |
| `/` | MVP 控制台、指標、模組入口、本期關帳流程 | `app/web/src/app/page.js` |
| `/documents` | 文件上傳與最近文件列表 | `app/web/src/app/documents/page.js` |
| `/ocr` | OCR 任務列表 | `app/web/src/app/ocr/page.js` |
| `/login` | 登入 | `app/web/src/app/login/page.js` |
| `/change-password` | 強制修改密碼 | `app/web/src/app/change-password/page.js` |
| `/reports/balance-sheet` | 資產負債表報表 | `app/web/src/app/reports/balance-sheet/page.js` |
| `/reports/vat-returns` | 401 / VAT 報表 | `app/web/src/app/reports/vat-returns/page.js` |
| `/:module` | MVP 動態模組頁 | `app/web/src/app/[module]/page.js` |

動態模組由 `app/web/src/lib/mvp-module-config.js` 定義，目前包含：

| Module key | 顯示名稱 | 功能 |
| --- | --- | --- |
| `accounts` | 科目表 | 科目代碼、類型、借貸方向 |
| `journal` | 分錄 / 傳票 | 建立借貸平衡傳票 |
| `ledger` | 總帳 | 依已過帳分錄彙整科目 |
| `trial-balance` | 試算表 | 科目借貸與期末餘額 |
| `receivables` | 應收帳款 | 客戶請款、收款狀態 |
| `payables` | 應付帳款 | 供應商請款、付款狀態 |
| `banking` | 銀行對帳 | 銀行交易、匹配、對帳 |
| `bank-rules` | 銀行匯入規則 | 以摘要關鍵字自動產生分錄 |
| `bank-imports` | 銀行匯入 | 貼上 CSV 建立交易與匹配 |
| `taxes` | 稅務 | 銷售額、進貨額、銷項 / 進項稅 |
| `financials` | 財報 | 損益表、資產負債表、現金流量表資料列 |
| `attachments` | 附件 | 憑證、附件與來源單據關聯 |
| `assets` | 固定資產 | 資產取得、折舊、折舊分錄 |
| `inventory` | 存貨明細帳 | SKU、進貨、出庫、平均成本 |
| `permissions` | 權限 | 使用者、公司角色、資料存取 |
| `approvals` | 審核 | 分錄、付款、匯出等審核流程 |
| `exports` | 匯出 | 報表、稅務、月結、資料交換檔 |
| `audit` | 稽核軌跡 | 操作紀錄與資料異動 |
| `batch` | 批次測試與錯誤復原 | 借貸、銀行、稅務、財報、匯出診斷 |

## UI 修改入口

後續要改 UI 時，優先看這幾個檔案：

- `app/web/src/app/globals.css`：全站版面、色彩、表格、卡片、按鈕、狀態樣式。
- `app/web/src/components/AppShell.js`：品牌列、主導覽、搜尋列、設定 / 通知 / 登出按鈕。
- `app/web/src/app/page.js`：首頁 dashboard 指標、模組卡片、本期關帳、待辦、最近文件、輸出狀態。
- `app/web/src/app/[module]/page.js`：各 MVP 模組共用的列表、表單、期別狀態、操作區塊。
- `app/web/src/lib/mvp-module-config.js`：模組名稱、導覽順序、描述、建立表單欄位。
- `app/web/src/components/StatusBadge.js`：所有狀態 badge 的顯示。
- `app/web/src/components/QuickCreateForm.js`：動態模組新增資料表單。
- `app/web/src/components/DocumentUploadForm.js`：文件上傳表單。
- `app/web/src/components/ModuleAutomationPanel.js`：模組頁上的自動化 / 生成操作面板。

如果只是調整視覺風格與排版，通常會集中在 `globals.css`、`AppShell.js`、`page.js` 與 `mvp-module-config.js`，不需要更動認證、權限或 API 邏輯。

## API 概覽

API routes 位於 `app/web/src/app/api/`：

- `auth/*`：login、logout、me、change-password。
- `documents`：文件上傳與文件列表。
- `ocr/jobs`：OCR 任務。
- `mvp/[module]`：動態 MVP 模組 CRUD / action 入口。
- `accounting/*`：期別鎖定、附件、分錄狀態、沖銷、收付款、銀行匹配、銀行調節、稅務流程、財報生成、匯出、固定資產折舊、批次診斷。
- `reports/*`：資產負債表與 VAT returns。
- `health`：健康檢查。

## 資料模型摘要

Prisma schema 位於 `prisma/schema.prisma`。目前資料表分成幾組：

- 使用者與權限：`User`、`AuthSession`、`Company`、`CompanyUser`
- 期間與文件：`AccountingPeriod`、`Document`、`OcrJob`、`OcrExtraction`、`ReviewTask`
- 401 與財報：`VatReturn`、`FinancialStatementLine`、`ValidationResult`
- 會計核心：`Account`、`JournalEntry`、`JournalLine`
- 應收應付：`Counterparty`、`InvoiceRecord`
- 銀行：`BankAccount`、`BankTransaction`、`BankReconciliation`、`BankImportBatch`、`BankImportRule`
- 營業稅與報表：`TaxRecord`、`ExportFile`
- 管理與稽核：`Attachment`、`ApprovalRequest`、`AuditLog`、`BatchJob`
- 擴充模組：`FixedAsset`、`FixedAssetDepreciation`、`InventoryItem`、`InventoryTransaction`

## 權限設計

角色定義在 `app/web/src/lib/permissions.js`：

- `OWNER`
- `ADMIN`
- `ACCOUNTANT`
- `REVIEWER`
- `CLIENT_READONLY`

各模組 read / write 權限由 `permissionMatrix.modules` 控制；API 權限由 `permissionMatrix.api` 控制。UI 修改時若沒有要改資料存取規則，避免調整這個檔案。

## 備份與最小權限

資料庫備份：

```bash
npm run db:backup
```

還原：

```bash
npm run db:restore -- storage/backups/accounting_dev-YYYYMMDD-HHMMSS.sql
```

建立 runtime 最小權限帳號：

```bash
DB_APP_PASSWORD='replace-with-a-strong-password' npm run db:least-privilege
```

備份檔只允許放在 `storage/backups/`，且 `.gitignore` 已排除 `.data/`、`.cache/`、`storage/uploads/`、`storage/exports/`、`storage/security/`、`storage/backups/` 與本機 env 檔。

## 產品路線

第一階段：

- 建立公司主檔、期間、文件上傳、OCR 任務、人工複核畫面。
- 支援資產負債表與 401 表 OCR。
- 建立欄位抽取、信心度、錯誤標示與驗證規則。
- 產生月度報表資料卡與匯出。

第二階段：

- 加入統一發票 / 電子發票 OCR 與 CSV 匯入。
- 建立進銷項發票管理、重複檢查、扣抵判斷。
- 由進銷項資料產生 401 草稿與申報媒體檔。
- 加入申報後期間鎖定與版本保存。

第三階段：

- 補齊傳票、總帳、試算表、損益表。
- 加入應收應付、銀行對帳、固定資產折舊。
- 報表中心支援月結包與年度申報包。

第四階段：

- 客戶上傳入口。
- 記帳士工作佇列。
- 批次審核與主管簽核。
- 多公司合併、權限隔離、稽核軌跡。
