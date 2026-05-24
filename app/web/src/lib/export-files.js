import { mkdir, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import {
  AccountingError,
  getTrialBalance,
  periodDateRange,
  textValue
} from "./accounting-core.js";
import { prisma } from "./prisma.js";
import { assertInsideWorkspace, exportsDir, workspaceRoot } from "./project-paths.js";

function workspacePath(relativePath) {
  const absolutePath = path.join(/* turbopackIgnore: true */ workspaceRoot, relativePath);
  return assertInsideWorkspace(absolutePath, "export path");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvRows(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function exportRows(company, period, exportType, db) {
  switch (exportType) {
    case "trial-balance": {
      const trialBalance = await getTrialBalance(company.id, period.id, db);
      return [
        ["科目代碼", "科目名稱", "類型", "借方發生", "貸方發生", "期末借方", "期末貸方"],
        ...trialBalance.rows.map((row) => [
          row.account.code,
          row.account.name,
          row.account.type,
          row.debit,
          row.credit,
          row.endingDebit,
          row.endingCredit
        ])
      ];
    }
    case "ledger": {
      const lines = await db.journalLine.findMany({
        where: {
          journalEntry: {
            companyId: company.id,
            periodId: period.id,
            status: "POSTED"
          }
        },
        include: { account: true, journalEntry: true },
        orderBy: { journalEntryId: "asc" }
      });
      return [
        ["日期", "傳票", "科目代碼", "科目名稱", "摘要", "借方", "貸方"],
        ...lines.map((line) => [
          line.journalEntry.entryDate.toISOString().slice(0, 10),
          line.journalEntry.entryNo,
          line.account.code,
          line.account.name,
          line.description || line.journalEntry.description,
          Number(line.debit),
          Number(line.credit)
        ])
      ];
    }
    case "taxes": {
      const rows = await db.taxRecord.findMany({
        where: { companyId: company.id, periodId: period.id },
        include: { period: true }
      });
      return [
        ["期別", "稅別", "銷售額", "進貨費用", "銷項稅", "進項稅", "應納稅額", "狀態"],
        ...rows.map((row) => [
          row.period?.taxPeriod || period.taxPeriod,
          row.taxType,
          Number(row.salesAmount),
          Number(row.purchaseAmount),
          Number(row.outputTax),
          Number(row.inputTax),
          Number(row.payableTax),
          row.status
        ])
      ];
    }
    case "vat-401-official": {
      const row = await db.vatReturn.findUnique({
        where: {
          companyId_periodId_returnType: {
            companyId: company.id,
            periodId: period.id,
            returnType: "FORM_401"
          }
        }
      });
      if (!row) {
        throw new AccountingError("請先產生 401 申報資料");
      }
      return [
        [
          "資料格式",
          "營業人統編",
          "稅籍編號",
          "期別",
          "銷售額",
          "銷項稅額",
          "進貨費用",
          "固定資產",
          "進項稅額",
          "應納稅額",
          "申報狀態"
        ],
        [
          "MOF-401-CSV",
          company.taxId,
          company.taxRegistrationNumber || "",
          period.taxPeriod,
          Number(row.taxableSales || 0),
          Number(row.outputTax || 0),
          Number(row.purchaseExpenseAmount || 0),
          Number(row.fixedAssetAmount || 0),
          Number(row.inputTax || 0),
          Number(row.payableTax || 0),
          row.filingStatus
        ]
      ];
    }
    case "einvoice-mig": {
      const rows = await db.invoiceRecord.findMany({
        where: { companyId: company.id, periodId: period.id, status: { not: "VOID" } },
        include: { counterparty: true }
      });
      return [
        [
          "MIG版本",
          "單據類型",
          "發票號碼",
          "賣方統編",
          "買受人統編",
          "發票日期",
          "銷售額",
          "稅額",
          "總計",
          "課稅別",
          "狀態"
        ],
        ...rows.map((row) => [
          "C0401-3.2",
          row.kind,
          row.documentNo,
          row.kind === "RECEIVABLE" ? company.taxId : row.counterparty?.taxId || "",
          row.kind === "RECEIVABLE" ? row.counterparty?.taxId || "" : company.taxId,
          row.documentDate.toISOString().slice(0, 10).replaceAll("-", ""),
          Number(row.subtotal),
          Number(row.taxAmount),
          Number(row.totalAmount),
          "1",
          row.status
        ])
      ];
    }
    case "financials": {
      const rows = await db.financialStatementLine.findMany({
        where: { companyId: company.id, periodId: period.id },
        orderBy: [{ statementType: "asc" }, { sortOrder: "asc" }]
      });
      return [
        ["期別", "報表", "代碼", "項目", "本期", "比較期"],
        ...rows.map((row) => [
          period.taxPeriod,
          row.statementType,
          row.lineCode || "",
          row.lineName,
          Number(row.amountCurrent || 0),
          Number(row.amountPrior || 0)
        ])
      ];
    }
    case "receivables":
    case "payables": {
      const kind = exportType === "receivables" ? "RECEIVABLE" : "PAYABLE";
      const rows = await db.invoiceRecord.findMany({
        where: { companyId: company.id, periodId: period.id, kind },
        include: { counterparty: true }
      });
      return [
        ["日期", "單號", "對象", "未稅", "稅額", "總額", "已收付", "狀態"],
        ...rows.map((row) => [
          row.documentDate.toISOString().slice(0, 10),
          row.documentNo,
          row.counterparty?.name || "",
          Number(row.subtotal),
          Number(row.taxAmount),
          Number(row.totalAmount),
          Number(row.paidAmount),
          row.status
        ])
      ];
    }
    case "banking": {
      const { start, end } = periodDateRange(period);
      const rows = await db.bankTransaction.findMany({
        where: {
          bankAccount: { companyId: company.id },
          transactionDate: { gte: start, lt: end }
        },
        include: { bankAccount: true, matchedJournalEntry: true }
      });
      return [
        ["日期", "帳戶", "摘要", "收入", "支出", "匹配傳票", "狀態"],
        ...rows.map((row) => [
          row.transactionDate.toISOString().slice(0, 10),
          row.bankAccount.accountName,
          row.description,
          Number(row.depositAmount),
          Number(row.withdrawalAmount),
          row.matchedJournalEntry?.entryNo || "",
          row.status
        ])
      ];
    }
    default:
      throw new AccountingError("不支援的匯出類型");
  }
}

export async function generateExportFile({
  company,
  period,
  payload,
  db = prisma
}) {
  const exportType = textValue(payload.exportType);
  const rows = await exportRows(company, period, exportType, db);
  const suffix = crypto.randomBytes(3).toString("hex");
  const fileName = `${period.taxPeriod}-${exportType}-${Date.now()}-${suffix}.csv`;
  const relativePath = path.relative(workspaceRoot, path.join(exportsDir, fileName));
  const absolutePath = workspacePath(relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, csvRows(rows), "utf8");

  return db.exportFile.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      exportType,
      status: "GENERATED",
      storagePath: relativePath
    }
  });
}
