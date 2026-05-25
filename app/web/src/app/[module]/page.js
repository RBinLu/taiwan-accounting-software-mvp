import ApprovalRequestActions from "@/components/ApprovalRequestActions";
import AttachmentUploadForm from "@/components/AttachmentUploadForm";
import BankReconciliationControl from "@/components/BankReconciliationControl";
import BankTransactionActions from "@/components/BankTransactionActions";
import InvoicePaymentActions from "@/components/InvoicePaymentActions";
import JournalEntryActions from "@/components/JournalEntryActions";
import ModuleAutomationPanel from "@/components/ModuleAutomationPanel";
import PeriodCloseSummary from "@/components/PeriodCloseSummary";
import PeriodLockControl from "@/components/PeriodLockControl";
import PermissionUserActions from "@/components/PermissionUserActions";
import QuickCreateForm from "@/components/QuickCreateForm";
import StatusBadge from "@/components/StatusBadge";
import {
  calculateBankBookBalance,
  getPeriodCloseStatus,
  getTrialBalance,
  moneyValue,
  periodDateRange
} from "@/lib/accounting-core";
import { AuthError } from "@/lib/auth";
import { ensureMvpContext } from "@/lib/demo-context";
import { formatMoney } from "@/lib/format";
import { mvpModules } from "@/lib/mvp-module-config";
import { rolesForModule } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function dateCell(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

function moneyCell(value) {
  return `NT$ ${formatMoney(value || 0)}`;
}

function statusCell(value) {
  return { type: "status", value };
}

function journalActionCell(entry) {
  return {
    type: "journalActions",
    entryId: entry.id,
    status: entry.status
  };
}

function invoicePaymentCell(invoice, periodState) {
  return {
    type: "invoicePayment",
    invoiceId: invoice.id,
    kind: invoice.kind,
    status: invoice.status,
    remainingAmount: Math.max(
      0,
      Number(invoice.totalAmount) - Number(invoice.paidAmount)
    ),
    periodLocked: periodState.isLocked
  };
}

function bankTransactionActionCell(transaction, periodState) {
  return {
    type: "bankTransactionActions",
    transactionId: transaction.id,
    status: transaction.status,
    matchedEntryNo: transaction.matchedJournalEntry?.entryNo || "",
    periodLocked: periodState.isLocked
  };
}

function approvalActionCell(approval) {
  return {
    type: "approvalActions",
    approvalId: approval.id,
    status: approval.status
  };
}

function permissionActionCell(membership, currentUserId) {
  return {
    type: "permissionActions",
    membershipId: membership.id,
    role: membership.role,
    isActive: membership.user.isActive,
    isCurrentUser: membership.userId === currentUserId
  };
}

const periodControlModules = new Set([
  "journal",
  "receivables",
  "payables",
  "banking",
  "bank-imports",
  "taxes",
  "financials",
  "assets",
  "inventory",
  "batch"
]);

function linkCell(href, label) {
  return { type: "link", href, label };
}

function roleScope(role) {
  const scopes = {
    OWNER: "全權管理",
    ADMIN: "系統與資料管理",
    ACCOUNTANT: "會計建檔與月結",
    REVIEWER: "審核與檢視",
    CLIENT_READONLY: "唯讀查詢"
  };
  return scopes[role] || "未定義";
}

function renderCell(cell) {
  if (cell && typeof cell === "object" && cell.type === "status") {
    return <StatusBadge value={cell.value} />;
  }

  if (cell && typeof cell === "object" && cell.type === "journalActions") {
    return <JournalEntryActions entryId={cell.entryId} status={cell.status} />;
  }

  if (cell && typeof cell === "object" && cell.type === "invoicePayment") {
    return (
      <InvoicePaymentActions
        invoiceId={cell.invoiceId}
        kind={cell.kind}
        periodLocked={cell.periodLocked}
        remainingAmount={cell.remainingAmount}
        status={cell.status}
      />
    );
  }

  if (cell && typeof cell === "object" && cell.type === "bankTransactionActions") {
    return (
      <BankTransactionActions
        matchedEntryNo={cell.matchedEntryNo}
        periodLocked={cell.periodLocked}
        status={cell.status}
        transactionId={cell.transactionId}
      />
    );
  }

  if (cell && typeof cell === "object" && cell.type === "approvalActions") {
    return <ApprovalRequestActions approvalId={cell.approvalId} status={cell.status} />;
  }

  if (cell && typeof cell === "object" && cell.type === "permissionActions") {
    return (
      <PermissionUserActions
        isActive={cell.isActive}
        isCurrentUser={cell.isCurrentUser}
        membershipId={cell.membershipId}
        role={cell.role}
      />
    );
  }

  if (cell && typeof cell === "object" && cell.type === "link") {
    return (
      <a className="module-inline-link" href={cell.href} target="_blank" rel="noreferrer">
        {cell.label}
      </a>
    );
  }

  return cell || "-";
}

async function getModuleRows(moduleKey) {
  const { company, period, bankAccount, user } = await ensureMvpContext({
    roles: rolesForModule(moduleKey, "read")
  });
  const closeStatus = await getPeriodCloseStatus(company.id, period.id);
  const periodState = {
    taxPeriod: period.taxPeriod,
    isLocked: period.isLocked,
    lockedAt: period.lockedAt,
    canLock: closeStatus.canLock,
    draftCount: closeStatus.draftCount,
    unbalancedCount: closeStatus.unbalancedCount,
    difference: closeStatus.totals.difference,
    bankTransactionCount: closeStatus.bankTransactionCount,
    bankOpenCount: closeStatus.bankOpenCount,
    bankReconciliationLocked: closeStatus.bankReconciliationLocked,
    taxRecordCount: closeStatus.taxRecordCount,
    taxDraftCount: closeStatus.taxDraftCount,
    taxReady: closeStatus.taxReady,
    financialLineCount: closeStatus.financialLineCount,
    financialReady: closeStatus.financialReady
  };
  const context = [
    { label: "公司", value: company.name },
    { label: "期別", value: period.taxPeriod },
    { label: "期別狀態", value: period.isLocked ? "已鎖帳" : "開放中" }
  ];

  switch (moduleKey) {
    case "accounts": {
      const rows = await prisma.account.findMany({
        where: { companyId: company.id },
        orderBy: { code: "asc" }
      });
      return {
        context,
        periodState,
        columns: ["代碼", "名稱", "類型", "借貸方向", "狀態"],
        rows: rows.map((row) => [
          row.code,
          row.name,
          row.type,
          row.normalBalance,
          row.isActive ? "啟用" : "停用"
        ])
      };
    }
    case "journal": {
      const rows = await prisma.journalEntry.findMany({
        where: { companyId: company.id, periodId: period.id },
        include: { lines: { include: { account: true } }, period: true },
        orderBy: { entryDate: "desc" },
        take: 80
      });
      return {
        context: [
          ...context,
          { label: "草稿", value: closeStatus.draftCount },
          { label: "試算差額", value: moneyCell(closeStatus.totals.difference) }
        ],
        periodState,
        columns: ["日期", "傳票號碼", "摘要", "借方", "貸方", "差額", "狀態", "操作"],
        rows: rows.map((row) => {
          const debit = row.lines.reduce((sum, line) => sum + Number(line.debit), 0);
          const credit = row.lines.reduce((sum, line) => sum + Number(line.credit), 0);
          const difference = Math.abs(debit - credit);
          return [
            dateCell(row.entryDate),
            row.entryNo,
            row.description,
            moneyCell(debit),
            moneyCell(credit),
            moneyCell(difference),
            statusCell(row.status),
            journalActionCell(row)
          ];
        })
      };
    }
    case "ledger": {
      const rows = await prisma.journalLine.findMany({
        where: {
          journalEntry: {
            companyId: company.id,
            periodId: period.id,
            status: "POSTED"
          }
        },
        include: { account: true, journalEntry: true },
        take: 120
      });
      rows.sort((a, b) => b.journalEntry.entryDate - a.journalEntry.entryDate);
      return {
        context,
        periodState,
        columns: ["日期", "科目", "傳票", "摘要", "借方", "貸方"],
        rows: rows.map((row) => [
          dateCell(row.journalEntry.entryDate),
          `${row.account.code} ${row.account.name}`,
          row.journalEntry.entryNo,
          row.description || row.journalEntry.description,
          moneyCell(row.debit),
          moneyCell(row.credit)
        ])
      };
    }
    case "trial-balance": {
      const trialBalance = await getTrialBalance(company.id, period.id);
      return {
        context: [
          ...context,
          { label: "借方合計", value: moneyCell(trialBalance.totals.totalDebit) },
          { label: "貸方合計", value: moneyCell(trialBalance.totals.totalCredit) },
          {
            label: "試算結果",
            value: trialBalance.isBalanced ? "平衡" : "不平衡"
          }
        ],
        periodState,
        columns: ["代碼", "科目", "類型", "借方發生", "貸方發生", "期末借方", "期末貸方"],
        rows: trialBalance.rows.map((row) => [
          row.account.code,
          row.account.name,
          row.account.type,
          moneyCell(row.debit),
          moneyCell(row.credit),
          moneyCell(row.endingDebit),
          moneyCell(row.endingCredit)
        ])
      };
    }
    case "receivables":
    case "payables": {
      const kind = moduleKey === "receivables" ? "RECEIVABLE" : "PAYABLE";
      const rows = await prisma.invoiceRecord.findMany({
        where: { companyId: company.id, periodId: period.id, kind },
        include: { counterparty: true, period: true },
        orderBy: { documentDate: "desc" },
        take: 80
      });
      return {
        context: [
          ...context,
          {
            label: moduleKey === "receivables" ? "未收總額" : "未付總額",
            value: moneyCell(
              rows.reduce(
                (sum, row) =>
                  sum + Math.max(0, Number(row.totalAmount) - Number(row.paidAmount)),
                0
              )
            )
          }
        ],
        periodState,
        columns: [
          "日期",
          "單號",
          "對象",
          "未稅",
          "稅額",
          "總額",
          moduleKey === "receivables" ? "已收" : "已付",
          moduleKey === "receivables" ? "未收" : "未付",
          "狀態",
          "操作"
        ],
        rows: rows.map((row) => [
          dateCell(row.documentDate),
          row.documentNo,
          row.counterparty?.name || "-",
          moneyCell(row.subtotal),
          moneyCell(row.taxAmount),
          moneyCell(row.totalAmount),
          moneyCell(row.paidAmount),
          moneyCell(Number(row.totalAmount) - Number(row.paidAmount)),
          statusCell(row.status),
          invoicePaymentCell(row, periodState)
        ])
      };
    }
    case "banking": {
      const { start, end } = periodDateRange(period);
      const [rows, accountCount, latestReconciliation] = await Promise.all([
        prisma.bankTransaction.findMany({
          where: {
            bankAccount: { companyId: company.id },
            transactionDate: { gte: start, lt: end }
          },
          include: {
            bankAccount: true,
            matchedJournalEntry: true
          },
          orderBy: { transactionDate: "desc" },
          take: 80
        }),
        prisma.bankAccount.count({
          where: { companyId: company.id, isActive: true }
        }),
        prisma.bankReconciliation.findFirst({
          where: {
            bankAccountId: bankAccount.id,
            periodId: period.id
          },
          orderBy: { updatedAt: "desc" }
        })
      ]);
      const bookBalance = await calculateBankBookBalance(company, period, bankAccount);
      const bankBalance = moneyValue(bankAccount.currentBalance);
      const difference = moneyValue(bankBalance - bookBalance);
      const unmatchedCount = rows.filter((row) => row.status === "UNMATCHED").length;
      const matchedCount = rows.filter((row) => row.status === "MATCHED").length;
      const reconciledCount = rows.filter((row) => row.status === "RECONCILED").length;
      return {
        context: [
          ...context,
          { label: "銀行帳戶", value: accountCount },
          { label: "未匹配", value: unmatchedCount },
          { label: "已對帳", value: reconciledCount }
        ],
        periodState,
        bankState: {
          accountName: bankAccount.accountName,
          transactionCount: rows.length,
          unmatchedCount,
          matchedCount,
          reconciledCount,
          bankBalance,
          bookBalance,
          difference,
          latestStatus: latestReconciliation?.status || "OPEN"
        },
        columns: ["日期", "帳戶", "摘要", "收入", "支出", "匹配傳票", "狀態", "操作"],
        rows: rows.map((row) => [
          dateCell(row.transactionDate),
          row.bankAccount.accountName,
          row.description,
          moneyCell(row.depositAmount),
          moneyCell(row.withdrawalAmount),
          row.matchedJournalEntry?.entryNo || "-",
          statusCell(row.status),
          bankTransactionActionCell(row, periodState)
        ])
      };
    }
    case "bank-rules": {
      const rows = await prisma.bankImportRule.findMany({
        where: { companyId: company.id },
        orderBy: { updatedAt: "desc" },
        take: 80
      });
      return {
        context: [
          ...context,
          { label: "啟用規則", value: rows.filter((row) => row.isActive).length }
        ],
        periodState,
        columns: ["規則", "關鍵字", "方向", "對應科目", "狀態", "更新時間"],
        rows: rows.map((row) => [
          row.name,
          row.keyword,
          row.direction,
          row.accountCode,
          row.isActive ? "啟用" : "停用",
          dateCell(row.updatedAt)
        ])
      };
    }
    case "bank-imports": {
      const rows = await prisma.bankImportBatch.findMany({
        where: { companyId: company.id, periodId: period.id },
        include: { bankAccount: true },
        orderBy: { createdAt: "desc" },
        take: 80
      });
      return {
        context: [
          ...context,
          { label: "匯入批次", value: rows.length },
          {
            label: "自動匹配",
            value: rows.reduce((sum, row) => sum + row.matchedRows, 0)
          }
        ],
        periodState,
        columns: ["建立時間", "銀行帳戶", "檔名", "匯入列", "自動匹配", "狀態", "錯誤"],
        rows: rows.map((row) => [
          dateCell(row.createdAt),
          row.bankAccount.accountName,
          row.fileName,
          row.importedRows,
          row.matchedRows,
          statusCell(row.status),
          row.errorMessage || "-"
        ])
      };
    }
    case "taxes": {
      const rows = await prisma.taxRecord.findMany({
        where: { companyId: company.id, periodId: period.id },
        include: { period: true },
        orderBy: { updatedAt: "desc" },
        take: 80
      });
      const currentTax = rows.find((row) => row.taxType === "VAT");
      return {
        context: [
          ...context,
          { label: "稅務狀態", value: currentTax?.status || "尚未重算" },
          { label: "應納稅額", value: moneyCell(currentTax?.payableTax || 0) }
        ],
        periodState,
        automationState: {
          salesAmount: Number(currentTax?.salesAmount || 0),
          payableTax: Number(currentTax?.payableTax || 0),
          status: currentTax?.status || "",
          hasTaxRecord: Boolean(currentTax)
        },
        columns: ["期別", "稅別", "銷售額", "進貨額", "應納稅額", "狀態"],
        rows: rows.map((row) => [
          row.period?.taxPeriod || "-",
          row.taxType,
          moneyCell(row.salesAmount),
          moneyCell(row.purchaseAmount),
          moneyCell(row.payableTax),
          statusCell(row.status)
        ])
      };
    }
    case "financials": {
      const rows = await prisma.financialStatementLine.findMany({
        where: { companyId: company.id, periodId: period.id },
        include: { period: true },
        orderBy: [{ statementType: "asc" }, { sortOrder: "asc" }],
        take: 120
      });
      const generatedRows = rows.filter(
        (row) => row.rawFields?.generatedBy === "commercial-accounting"
      );
      const netIncome = generatedRows.find((row) => row.lineCode === "NET_INCOME");
      return {
        context: [
          ...context,
          { label: "自動列數", value: generatedRows.length },
          { label: "本期損益", value: moneyCell(netIncome?.amountCurrent || 0) }
        ],
        periodState,
        automationState: {
          generatedLineCount: generatedRows.length,
          netIncome: Number(netIncome?.amountCurrent || 0)
        },
        columns: ["期別", "報表", "代碼", "項目", "本期", "比較期"],
        rows: rows.map((row) => [
          row.period.taxPeriod,
          row.statementType,
          row.lineCode || "-",
          row.lineName,
          moneyCell(row.amountCurrent),
          moneyCell(row.amountPrior)
        ])
      };
    }
    case "attachments": {
      const rows = await prisma.attachment.findMany({
        where: { companyId: company.id },
        include: { document: true, uploadedBy: true, versions: true },
        orderBy: { createdAt: "desc" },
        take: 80
      });
      return {
        context,
        periodState,
        columns: ["建立時間", "檔名", "版本", "上傳者", "關聯類型", "來源文件", "預覽"],
        rows: rows.map((row) => [
          dateCell(row.createdAt),
          row.fileName,
          `v${row.version}`,
          row.uploadedBy?.name || "-",
          row.linkedEntityType || "-",
          row.document?.originalName || "-",
          linkCell(`/api/accounting/attachments/${row.id}`, "開啟")
        ])
      };
    }
    case "assets": {
      const rows = await prisma.fixedAsset.findMany({
        where: { companyId: company.id },
        include: { depreciationRuns: true },
        orderBy: { acquisitionDate: "desc" },
        take: 80
      });
      const depreciationCount = rows.reduce(
        (sum, row) =>
          sum + row.depreciationRuns.filter((run) => run.periodId === period.id).length,
        0
      );
      return {
        context: [
          ...context,
          { label: "資產數", value: rows.length },
          { label: "本期折舊", value: depreciationCount }
        ],
        periodState,
        automationState: { depreciationCount },
        columns: ["取得日", "資產編號", "名稱", "取得成本", "殘值", "耐用月數", "狀態", "折舊次數"],
        rows: rows.map((row) => [
          dateCell(row.acquisitionDate),
          row.assetNo,
          row.name,
          moneyCell(row.acquisitionCost),
          moneyCell(row.salvageValue),
          row.usefulLifeMonths,
          row.status,
          row.depreciationRuns.length
        ])
      };
    }
    case "inventory": {
      const [items, transactions] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { companyId: company.id },
          orderBy: { updatedAt: "desc" },
          take: 80
        }),
        prisma.inventoryTransaction.findMany({
          where: { companyId: company.id, periodId: period.id },
          include: { item: true, journalEntry: true },
          orderBy: { transactionDate: "desc" },
          take: 80
        })
      ]);
      const inventoryValue = items.reduce(
        (sum, item) => sum + Number(item.quantityOnHand) * Number(item.averageCost),
        0
      );
      return {
        context: [
          ...context,
          { label: "SKU", value: items.length },
          { label: "庫存金額", value: moneyCell(inventoryValue) }
        ],
        periodState,
        columns: ["日期", "SKU", "品名", "類型", "數量", "單價", "金額", "傳票"],
        rows: transactions.map((row) => [
          dateCell(row.transactionDate),
          row.item.sku,
          row.item.name,
          row.transactionType,
          Number(row.quantity),
          moneyCell(row.unitCost),
          moneyCell(row.totalAmount),
          row.journalEntry?.entryNo || "-"
        ])
      };
    }
    case "permissions": {
      const rows = await prisma.companyUser.findMany({
        where: { companyId: company.id },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 80
      });
      return {
        context,
        periodState,
        columns: ["使用者", "Email", "角色", "權限範圍", "狀態", "加入時間", "操作"],
        rows: rows.map((row) => [
          row.user.name,
          row.user.email,
          row.role,
          roleScope(row.role),
          statusCell(row.user.isActive ? "ACTIVE" : "INACTIVE"),
          dateCell(row.createdAt),
          permissionActionCell(row, user.id)
        ])
      };
    }
    case "approvals": {
      const rows = await prisma.approvalRequest.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 80
      });
      return {
        context,
        periodState,
        columns: ["建立時間", "標題", "類型", "申請人", "審核人", "狀態", "操作"],
        rows: rows.map((row) => [
          dateCell(row.createdAt),
          row.title,
          row.entityType,
          row.requesterName || "-",
          row.approverName || "-",
          statusCell(row.status),
          approvalActionCell(row)
        ])
      };
    }
    case "exports": {
      const rows = await prisma.exportFile.findMany({
        where: { companyId: company.id, periodId: period.id },
        include: { period: true, document: true },
        orderBy: { updatedAt: "desc" },
        take: 80
      });
      return {
        context: [
          ...context,
          { label: "已產生", value: rows.filter((row) => row.status === "GENERATED").length }
        ],
        periodState,
        automationState: {
          generatedCount: rows.filter((row) => row.status === "GENERATED").length
        },
        columns: ["建立時間", "類型", "期別", "文件", "路徑", "狀態"],
        rows: rows.map((row) => [
          dateCell(row.createdAt),
          row.exportType,
          row.period?.taxPeriod || "-",
          row.document?.originalName || "-",
          row.storagePath || "-",
          statusCell(row.status)
        ])
      };
    }
    case "audit": {
      const rows = await prisma.auditLog.findMany({
        where: { companyId: company.id },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 120
      });
      return {
        context: [
          ...context,
          { label: "稽核筆數", value: rows.length }
        ],
        periodState,
        columns: ["時間", "使用者", "對象", "動作", "資料 ID", "異動摘要"],
        rows: rows.map((row) => [
          dateCell(row.createdAt),
          row.user?.name || "系統",
          row.entityType,
          row.action,
          row.entityId,
          JSON.stringify(row.afterValue || row.beforeValue || {}).slice(0, 120)
        ])
      };
    }
    case "batch": {
      const rows = await prisma.batchJob.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 80
      });
      const latest = rows[0];
      return {
        context: [
          ...context,
          { label: "批次工作", value: rows.length },
          { label: "最近狀態", value: latest?.status || "尚未執行" }
        ],
        periodState,
        automationState: {
          latestStatus: latest?.status || ""
        },
        columns: ["建立時間", "類型", "狀態", "訊息", "完成時間"],
        rows: rows.map((row) => [
          dateCell(row.createdAt),
          row.jobType,
          statusCell(row.status),
          row.message || "-",
          dateCell(row.finishedAt)
        ])
      };
    }
    default:
      notFound();
  }
}

export default async function ModulePage({ params }) {
  const { module } = await params;
  const config = mvpModules[module];

  if (!config) {
    notFound();
  }

  let data;
  try {
    data = await getModuleRows(module);
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.status === 428 ? "/change-password" : "/login");
    }
    throw error;
  }

  return (
    <>
      <header className="page-head module-page-head">
        <div>
          <div className="eyebrow">{config.eyebrow}</div>
          <h1>{config.title}</h1>
          <p className="page-copy">{config.description}</p>
        </div>
        <a className="secondary-action" href="/">
          返回總覽
        </a>
      </header>

      {periodControlModules.has(module) ? (
        <PeriodCloseSummary periodState={data.periodState} />
      ) : null}

      <section className="module-shell">
        <aside className="module-side-panel">
          <div className="module-context-grid">
            {data.context.map((item) => (
              <div
                className={`module-context ${item.label === "公司" ? "wide" : ""}`}
                key={item.label}
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <div className="module-context">
              <span>目前筆數</span>
              <strong>{data.rows.length}</strong>
            </div>
          </div>
          {data.bankState ? (
            <BankReconciliationControl
              bankState={data.bankState}
              periodState={data.periodState}
            />
          ) : null}
          {periodControlModules.has(module) ? (
            <PeriodLockControl periodState={data.periodState} />
          ) : null}
          <div className="module-create-panel">
            <div className="module-section-head">
              <span>Quick Entry</span>
              <h2>{config.createLabel || config.title}</h2>
            </div>
            <QuickCreateForm moduleKey={module} config={config} periodState={data.periodState} />
            {module === "attachments" ? <AttachmentUploadForm /> : null}
          </div>
          {data.automationState ? (
            <ModuleAutomationPanel
              moduleKey={module}
              state={data.automationState}
            />
          ) : null}
        </aside>

        <section className="module-table-panel">
          <div className="module-section-head">
            <span>Records</span>
            <h2>{config.title}清單</h2>
          </div>
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  {data.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length ? (
                  data.rows.map((row, index) => (
                    <tr key={`${module}-${index}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${module}-${index}-${cellIndex}`}>{renderCell(cell)}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={data.columns.length}>
                      <div className="module-empty">目前沒有資料，先從左側新增一筆。</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}
