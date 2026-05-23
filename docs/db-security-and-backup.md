# PostgreSQL 權限與備份策略

## 帳號分層

- `accounting`：本機開發與 Prisma migration 管理者帳號，只用於 `npm run db:migrate`、備份與維運。
- `accounting_app`：正式 runtime 建議使用的最小權限帳號，只授權 `CONNECT`、schema `USAGE`、既有表格 `SELECT/INSERT/UPDATE/DELETE`、sequence `USAGE/SELECT`。
- 不把 migration 權限交給 runtime 帳號；正式環境應用程式的 `DATABASE_URL` 指向 `accounting_app`，migration job 才使用管理者連線。

建立或更新 runtime role：

```bash
DB_APP_PASSWORD='replace-with-a-strong-password' npm run db:least-privilege
```

## 備份

備份檔只寫入專案資料夾內的 `storage/backups/`，檔案權限設為 `600`，避免和本機其他 SQLite 或資料庫資料混在一起。

```bash
npm run db:backup
```

還原時只接受 `storage/backups/` 底下的檔案：

```bash
npm run db:restore -- storage/backups/accounting_dev-YYYYMMDD-HHMMSS.sql
```

## 營運規則

- 每次 migration 前先跑一次 `npm run db:backup`。
- 每日保留至少 7 份、每週保留至少 4 份；超過保留期再人工刪除。
- 備份檔不可提交到 Git，已由 `.gitignore` 排除。
- 正式環境需把備份檔同步到加密儲存，並定期做還原演練。
