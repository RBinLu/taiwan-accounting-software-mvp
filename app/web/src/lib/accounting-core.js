import crypto from "node:crypto";
import { prisma } from "./prisma.js";

export class AccountingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AccountingError";
    this.status = status;
  }
}

export function textValue(value) {
  return String(value || "").trim();
}

export function moneyValue(value) {
  if (value === "" || value === null || value === undefined) return 0;

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new AccountingError("金額格式不正確");
  }

  return Math.round(number * 100) / 100;
}

export function dateValue(value) {
  const text = textValue(value);
  return text ? new Date(`${text}T00:00:00+08:00`) : new Date();
}

async function lockInvoiceRecord(companyId, periodId, invoiceId, db) {
  if (!invoiceId || typeof db.$queryRaw !== "function") return;

  await db.$queryRaw`
    SELECT "id"
    FROM "InvoiceRecord"
    WHERE "id" = ${invoiceId}
      AND "companyId" = ${companyId}
      AND "periodId" = ${periodId}
    FOR UPDATE
  `;
}

async function lockBankTransaction(companyId, transactionId, db) {
  if (!transactionId || typeof db.$queryRaw !== "function") return;

  await db.$queryRaw`
    SELECT bt."id"
    FROM "BankTransaction" bt
    INNER JOIN "BankAccount" ba ON ba."id" = bt."bankAccountId"
    WHERE bt."id" = ${transactionId}
      AND ba."companyId" = ${companyId}
    FOR UPDATE OF bt
  `;
}

async function lockJournalEntry(companyId, journalEntryId, db) {
  if (!journalEntryId || typeof db.$queryRaw !== "function") return;

  await db.$queryRaw`
    SELECT "id"
    FROM "JournalEntry"
    WHERE "id" = ${journalEntryId}
      AND "companyId" = ${companyId}
    FOR UPDATE
  `;
}

function generatedEntryNo(prefix) {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

export function periodDateRange(period) {
  const year = Number(period.year);
  const month = Number(period.month);
  const startMonth = String(month).padStart(2, "0");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    start: new Date(`${year}-${startMonth}-01T00:00:00+08:00`),
    end: new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`
    )
  };
}

export function assertPeriodOpen(period) {
  if (period?.isLocked) {
    throw new AccountingError("本期已鎖帳，不能新增或修改會計交易");
  }
}

function sameMoney(left, right) {
  return Math.abs(moneyValue(left) - moneyValue(right)) < 0.005;
}

function normalizeJournalLines(payload) {
  const description = textValue(payload.description) || "手動新增分錄";

  if (Array.isArray(payload.lines) && payload.lines.length) {
    return payload.lines.map((line, index) => ({
      accountCode: textValue(line.accountCode),
      description: textValue(line.description) || description,
      debit: moneyValue(line.debit),
      credit: moneyValue(line.credit),
      sortOrder: index + 1
    }));
  }

  const amount = moneyValue(payload.amount);
  return [
    {
      accountCode: textValue(payload.debitAccountCode),
      description,
      debit: amount,
      credit: 0,
      sortOrder: 1
    },
    {
      accountCode: textValue(payload.creditAccountCode),
      description,
      debit: 0,
      credit: amount,
      sortOrder: 2
    }
  ];
}

export async function resolveBalancedJournalLines(companyId, payload, db = prisma) {
  const rawLines = normalizeJournalLines(payload);

  if (rawLines.length < 2) {
    throw new AccountingError("分錄至少需要兩筆借貸分錄列");
  }

  const accountCodes = [...new Set(rawLines.map((line) => line.accountCode))];
  if (accountCodes.some((code) => !code)) {
    throw new AccountingError("每一筆分錄列都必須指定科目代碼");
  }

  const accounts = await db.account.findMany({
    where: {
      companyId,
      code: { in: accountCodes },
      isActive: true
    }
  });
  const accountMap = new Map(accounts.map((account) => [account.code, account]));

  const lines = rawLines.map((line) => {
    const account = accountMap.get(line.accountCode);

    if (!account) {
      throw new AccountingError(`找不到可用科目：${line.accountCode}`);
    }

    if (line.debit < 0 || line.credit < 0) {
      throw new AccountingError("借方與貸方金額不可為負數");
    }

    if (line.debit > 0 && line.credit > 0) {
      throw new AccountingError("同一筆分錄列不能同時有借方與貸方金額");
    }

    if (line.debit === 0 && line.credit === 0) {
      throw new AccountingError("分錄列金額不可為零");
    }

    return {
      accountId: account.id,
      account,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      sortOrder: line.sortOrder
    };
  });

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  if (!sameMoney(totalDebit, totalCredit)) {
    throw new AccountingError(
      `借貸不平衡：借方 ${totalDebit.toFixed(2)}，貸方 ${totalCredit.toFixed(2)}`
    );
  }

  if (totalDebit <= 0) {
    throw new AccountingError("分錄總金額必須大於零");
  }

  return {
    lines,
    totalDebit: moneyValue(totalDebit),
    totalCredit: moneyValue(totalCredit)
  };
}

export async function createBalancedJournalEntry({ company, period, payload, db = prisma }) {
  assertPeriodOpen(period);

  const description = textValue(payload.description) || "手動新增分錄";
  const status = textValue(payload.status) || "POSTED";
  if (!["DRAFT", "POSTED"].includes(status)) {
    throw new AccountingError("新分錄狀態只能是 DRAFT 或 POSTED");
  }

  const { lines } = await resolveBalancedJournalLines(company.id, payload, db);
  const entryPrefix = textValue(payload.entryPrefix) || "JV";
  const entryNo = textValue(payload.entryNo) || generatedEntryNo(entryPrefix);

  return db.journalEntry.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      entryNo,
      entryDate: dateValue(payload.entryDate),
      description,
      status,
      sourceType: textValue(payload.sourceType) || null,
      sourceId: textValue(payload.sourceId) || null,
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          sortOrder: line.sortOrder
        }))
      }
    }
  });
}

function invoiceJournalLines(kind, payload) {
  const subtotal = moneyValue(payload.subtotal);
  const taxAmount = moneyValue(payload.taxAmount);
  const totalAmount = moneyValue(subtotal + taxAmount);

  if (subtotal <= 0) {
    throw new AccountingError("未稅金額必須大於零");
  }

  if (taxAmount < 0) {
    throw new AccountingError("稅額不可為負數");
  }

  if (kind === "RECEIVABLE") {
    return [
      { accountCode: "1130", debit: totalAmount, credit: 0 },
      {
        accountCode: textValue(payload.revenueAccountCode) || "4110",
        debit: 0,
        credit: subtotal
      },
      ...(taxAmount > 0
        ? [{ accountCode: "2120", debit: 0, credit: taxAmount }]
        : [])
    ];
  }

  return [
    {
      accountCode: textValue(payload.expenseAccountCode) || "6110",
      debit: subtotal,
      credit: 0
    },
    ...(taxAmount > 0
      ? [{ accountCode: "1210", debit: taxAmount, credit: 0 }]
      : []),
    { accountCode: "2110", debit: 0, credit: totalAmount }
  ];
}

export async function createInvoiceWithJournal({
  company,
  period,
  payload,
  kind,
  db = prisma
}) {
  assertPeriodOpen(period);

  const documentNo = textValue(payload.documentNo);
  const counterpartyName = textValue(payload.counterpartyName);
  const subtotal = moneyValue(payload.subtotal);
  const taxAmount = moneyValue(payload.taxAmount);
  const totalAmount = moneyValue(subtotal + taxAmount);
  const counterpartyType = kind === "RECEIVABLE" ? "CUSTOMER" : "VENDOR";

  if (!documentNo || !counterpartyName) {
    throw new AccountingError("單據號碼與對象名稱必填");
  }

  const counterparty = await db.counterparty.upsert({
    where: {
      companyId_name_type: {
        companyId: company.id,
        name: counterpartyName,
        type: counterpartyType
      }
    },
    create: {
      companyId: company.id,
      name: counterpartyName,
      type: counterpartyType
    },
    update: {}
  });

  const invoice = await db.invoiceRecord.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      counterpartyId: counterparty.id,
      kind,
      documentNo,
      documentDate: dateValue(payload.documentDate),
      dueDate: payload.dueDate ? dateValue(payload.dueDate) : null,
      description: textValue(payload.description) || null,
      subtotal,
      taxAmount,
      totalAmount,
      status: "OPEN"
    }
  });

  const description =
    textValue(payload.description) ||
    `${kind === "RECEIVABLE" ? "應收" : "應付"}單據 ${documentNo}`;

  const journalEntry = await createBalancedJournalEntry({
    company,
    period,
    db,
    payload: {
      entryPrefix: kind === "RECEIVABLE" ? "AR" : "AP",
      entryDate: payload.documentDate,
      description,
      status: "POSTED",
      sourceType: "invoice",
      sourceId: invoice.id,
      lines: invoiceJournalLines(kind, payload)
    }
  });

  return { invoice, journalEntry };
}

export async function settleInvoice({
  company,
  period,
  bankAccount,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const invoiceId = textValue(payload.invoiceId);
  await lockInvoiceRecord(company.id, period.id, invoiceId, db);

  const invoice = await db.invoiceRecord.findFirst({
    where: {
      id: invoiceId,
      companyId: company.id,
      periodId: period.id
    },
    include: { counterparty: true }
  });

  if (!invoice) {
    throw new AccountingError("找不到本期單據", 404);
  }

  if (["PAID", "VOID"].includes(invoice.status)) {
    throw new AccountingError("這張單據已結清或作廢，不能再收付款");
  }

  const paidAmount = Number(invoice.paidAmount);
  const totalAmount = Number(invoice.totalAmount);
  const remainingAmount = moneyValue(totalAmount - paidAmount);
  const paymentAmount = moneyValue(payload.amount || remainingAmount);

  if (paymentAmount <= 0) {
    throw new AccountingError("收付款金額必須大於零");
  }

  if (paymentAmount > remainingAmount) {
    throw new AccountingError(
      `收付款金額超過未結餘額：尚餘 ${remainingAmount.toFixed(2)}`
    );
  }

  const isReceivable = invoice.kind === "RECEIVABLE";
  const paymentDate = payload.paymentDate || new Date().toISOString().slice(0, 10);
  const description =
    textValue(payload.description) ||
    `${isReceivable ? "應收收款" : "應付付款"} ${invoice.documentNo}`;

  const journalEntry = await createBalancedJournalEntry({
    company,
    period,
    db,
    payload: {
      entryPrefix: isReceivable ? "RCPT" : "PAY",
      entryDate: paymentDate,
      description,
      status: "POSTED",
      sourceType: "invoicePayment",
      sourceId: invoice.id,
      lines: isReceivable
        ? [
            { accountCode: "1120", debit: paymentAmount, credit: 0 },
            { accountCode: "1130", debit: 0, credit: paymentAmount }
          ]
        : [
            { accountCode: "2110", debit: paymentAmount, credit: 0 },
            { accountCode: "1120", debit: 0, credit: paymentAmount }
          ]
    }
  });

  const newPaidAmount = moneyValue(paidAmount + paymentAmount);
  const nextStatus = newPaidAmount >= totalAmount ? "PAID" : "PARTIAL";

  const [updatedInvoice, bankTransaction] = await Promise.all([
    db.invoiceRecord.update({
      where: { id: invoice.id },
      data: {
        paidAmount: newPaidAmount,
        status: nextStatus
      }
    }),
    db.bankTransaction.create({
      data: {
        bankAccountId: bankAccount.id,
        matchedJournalEntryId: journalEntry.id,
        transactionDate: dateValue(paymentDate),
        description,
        depositAmount: isReceivable ? paymentAmount : 0,
        withdrawalAmount: isReceivable ? 0 : paymentAmount,
        status: "MATCHED"
      }
    }),
    db.bankAccount.update({
      where: { id: bankAccount.id },
      data: {
        currentBalance: {
          increment: isReceivable ? paymentAmount : -paymentAmount
        }
      }
    })
  ]);

  return { invoice: updatedInvoice, journalEntry, bankTransaction };
}

function bankTransactionNetAmount(transaction) {
  return moneyValue(
    Number(transaction.depositAmount) - Number(transaction.withdrawalAmount)
  );
}

function journalBankNetAmount(journalEntry) {
  return moneyValue(
    journalEntry.lines.reduce((sum, line) => {
      if (line.account?.code !== "1120") return sum;
      return sum + Number(line.debit) - Number(line.credit);
    }, 0)
  );
}

async function findBankTransaction(companyId, transactionId, db) {
  const transaction = await db.bankTransaction.findFirst({
    where: {
      id: transactionId,
      bankAccount: { companyId }
    },
    include: {
      bankAccount: true,
      matchedJournalEntry: true
    }
  });

  if (!transaction) {
    throw new AccountingError("找不到銀行交易", 404);
  }

  return transaction;
}

export async function matchBankTransaction({
  company,
  period,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const transactionId = textValue(payload.transactionId);
  const journalEntryId = textValue(payload.journalEntryId);
  const entryNo = textValue(payload.entryNo);

  if (!transactionId) {
    throw new AccountingError("缺少銀行交易 ID");
  }

  if (!journalEntryId && !entryNo) {
    throw new AccountingError("請輸入要匹配的傳票號碼");
  }

  await lockBankTransaction(company.id, transactionId, db);
  const transaction = await findBankTransaction(company.id, transactionId, db);

  if (transaction.status === "RECONCILED") {
    throw new AccountingError("已對帳的銀行交易不能重新匹配");
  }

  if (transaction.matchedJournalEntryId) {
    throw new AccountingError("這筆銀行交易已匹配，請先解除匹配");
  }

  const journalEntry = await db.journalEntry.findFirst({
    where: {
      companyId: company.id,
      periodId: period.id,
      status: "POSTED",
      ...(journalEntryId ? { id: journalEntryId } : { entryNo })
    },
    include: {
      lines: { include: { account: true } }
    }
  });

  if (!journalEntry) {
    throw new AccountingError("找不到本期已過帳傳票", 404);
  }

  await lockJournalEntry(company.id, journalEntry.id, db);
  const duplicateMatch = await db.bankTransaction.findFirst({
    where: {
      matchedJournalEntryId: journalEntry.id,
      id: { not: transaction.id },
      bankAccount: { companyId: company.id }
    }
  });

  if (duplicateMatch) {
    throw new AccountingError("這張傳票已匹配到其他銀行交易");
  }

  const transactionAmount = bankTransactionNetAmount(transaction);
  const entryBankAmount = journalBankNetAmount(journalEntry);

  if (transactionAmount === 0) {
    throw new AccountingError("銀行交易淨額不可為零");
  }

  if (!sameMoney(transactionAmount, entryBankAmount)) {
    throw new AccountingError(
      `銀行交易淨額 ${transactionAmount.toFixed(2)} 與傳票銀行科目淨額 ${entryBankAmount.toFixed(2)} 不一致`
    );
  }

  return db.bankTransaction.update({
    where: { id: transaction.id },
    data: {
      matchedJournalEntryId: journalEntry.id,
      status: "MATCHED"
    },
    include: {
      bankAccount: true,
      matchedJournalEntry: true
    }
  });
}

export async function unmatchBankTransaction({
  company,
  period,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const transactionId = textValue(payload.transactionId);
  if (!transactionId) {
    throw new AccountingError("缺少銀行交易 ID");
  }

  await lockBankTransaction(company.id, transactionId, db);
  const transaction = await findBankTransaction(company.id, transactionId, db);

  if (transaction.status === "RECONCILED") {
    throw new AccountingError("已對帳的銀行交易不能解除匹配");
  }

  return db.bankTransaction.update({
    where: { id: transaction.id },
    data: {
      matchedJournalEntryId: null,
      status: "UNMATCHED"
    },
    include: {
      bankAccount: true,
      matchedJournalEntry: true
    }
  });
}

export async function reconcileBankTransaction({
  company,
  period,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const transactionId = textValue(payload.transactionId);
  if (!transactionId) {
    throw new AccountingError("缺少銀行交易 ID");
  }

  await lockBankTransaction(company.id, transactionId, db);
  const transaction = await findBankTransaction(company.id, transactionId, db);

  if (transaction.status === "RECONCILED") {
    throw new AccountingError("這筆銀行交易已完成對帳");
  }

  if (transaction.status !== "MATCHED" || !transaction.matchedJournalEntryId) {
    throw new AccountingError("銀行交易需先匹配傳票才能對帳");
  }

  return db.bankTransaction.update({
    where: { id: transaction.id },
    data: { status: "RECONCILED" },
    include: {
      bankAccount: true,
      matchedJournalEntry: true
    }
  });
}

export async function calculateBankBookBalance(company, period, bankAccount, db = prisma) {
  const bankLines = await db.journalLine.findMany({
    where: {
      account: {
        companyId: company.id,
        code: "1120"
      },
      journalEntry: {
        companyId: company.id,
        periodId: period.id,
        status: "POSTED"
      }
    }
  });

  const periodMovement = bankLines.reduce(
    (sum, line) => sum + Number(line.debit) - Number(line.credit),
    0
  );

  return moneyValue(Number(bankAccount.openingBalance) + periodMovement);
}

export async function lockBankReconciliation({
  company,
  period,
  bankAccount,
  payload = {},
  db = prisma
}) {
  assertPeriodOpen(period);

  const { start, end } = periodDateRange(period);
  const transactions = await db.bankTransaction.findMany({
    where: {
      bankAccountId: bankAccount.id,
      transactionDate: { gte: start, lt: end }
    }
  });

  const unmatchedCount = transactions.filter(
    (transaction) => transaction.status === "UNMATCHED"
  ).length;

  if (unmatchedCount > 0) {
    throw new AccountingError(`仍有 ${unmatchedCount} 筆銀行交易未匹配，不能鎖定對帳`);
  }

  const bookBalance = await calculateBankBookBalance(company, period, bankAccount, db);
  const bankBalance = moneyValue(
    payload.bankBalance === "" || payload.bankBalance === undefined
      ? bankAccount.currentBalance
      : payload.bankBalance
  );
  const difference = moneyValue(bankBalance - bookBalance);

  if (!sameMoney(difference, 0)) {
    throw new AccountingError(
      `銀行對帳差額 ${difference.toFixed(2)}，請先確認銀行餘額與總帳銀行科目`
    );
  }

  await db.bankTransaction.updateMany({
    where: {
      bankAccountId: bankAccount.id,
      transactionDate: { gte: start, lt: end },
      status: "MATCHED"
    },
    data: { status: "RECONCILED" }
  });

  const existing = await db.bankReconciliation.findFirst({
    where: {
      bankAccountId: bankAccount.id,
      periodId: period.id
    },
    orderBy: { updatedAt: "desc" }
  });

  const data = {
    statementDate: payload.statementDate
      ? dateValue(payload.statementDate)
      : new Date(),
    bookBalance,
    bankBalance,
    difference,
    status: "LOCKED"
  };

  const reconciliation = existing
    ? await db.bankReconciliation.update({
        where: { id: existing.id },
        data
      })
    : await db.bankReconciliation.create({
        data: {
          bankAccountId: bankAccount.id,
          periodId: period.id,
          ...data
        }
      });

  return {
    reconciliation,
    counts: {
      total: transactions.length,
      reconciled: transactions.length,
      unmatched: unmatchedCount
    }
  };
}

export function summarizeEntryLines(lines) {
  const totalDebit = moneyValue(
    lines.reduce((sum, line) => sum + Number(line.debit), 0)
  );
  const totalCredit = moneyValue(
    lines.reduce((sum, line) => sum + Number(line.credit), 0)
  );

  return {
    totalDebit,
    totalCredit,
    difference: moneyValue(totalDebit - totalCredit),
    isBalanced: sameMoney(totalDebit, totalCredit)
  };
}

export async function getTrialBalance(companyId, periodId, db = prisma) {
  const [accounts, lines] = await Promise.all([
    db.account.findMany({
      where: { companyId },
      orderBy: { code: "asc" }
    }),
    db.journalLine.findMany({
      where: {
        journalEntry: {
          companyId,
          periodId,
          status: "POSTED"
        }
      },
      include: { account: true }
    })
  ]);

  const totalsByAccount = new Map();
  for (const account of accounts) {
    totalsByAccount.set(account.id, {
      account,
      debit: 0,
      credit: 0
    });
  }

  for (const line of lines) {
    const row = totalsByAccount.get(line.accountId);
    if (!row) continue;
    row.debit += Number(line.debit);
    row.credit += Number(line.credit);
  }

  const rows = [...totalsByAccount.values()].map((row) => {
    const debit = moneyValue(row.debit);
    const credit = moneyValue(row.credit);
    const balance = moneyValue(debit - credit);
    const endingDebit = balance >= 0 ? balance : 0;
    const endingCredit = balance < 0 ? Math.abs(balance) : 0;

    return {
      ...row,
      debit,
      credit,
      endingDebit: moneyValue(endingDebit),
      endingCredit: moneyValue(endingCredit)
    };
  });

  const totalDebit = moneyValue(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = moneyValue(rows.reduce((sum, row) => sum + row.credit, 0));
  const totalEndingDebit = moneyValue(
    rows.reduce((sum, row) => sum + row.endingDebit, 0)
  );
  const totalEndingCredit = moneyValue(
    rows.reduce((sum, row) => sum + row.endingCredit, 0)
  );
  const difference = moneyValue(totalDebit - totalCredit);

  return {
    rows,
    totals: {
      totalDebit,
      totalCredit,
      totalEndingDebit,
      totalEndingCredit,
      difference
    },
    isBalanced: sameMoney(totalDebit, totalCredit)
  };
}

export async function getPeriodCloseStatus(companyId, periodId) {
  const period = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, companyId }
  });

  if (!period) {
    throw new AccountingError("找不到會計期別", 404);
  }

  const { start, end } = periodDateRange(period);
  const [trialBalance, entries, bankTransactionCount, bankOpenCount, bankLock, taxRecords, financialLineCount] = await Promise.all([
    getTrialBalance(companyId, periodId),
    prisma.journalEntry.findMany({
      where: { companyId, periodId },
      include: { lines: true }
    }),
    prisma.bankTransaction.count({
      where: {
        bankAccount: { companyId },
        transactionDate: { gte: start, lt: end }
      }
    }),
    prisma.bankTransaction.count({
      where: {
        bankAccount: { companyId },
        transactionDate: { gte: start, lt: end },
        status: { not: "RECONCILED" }
      }
    }),
    prisma.bankReconciliation.findFirst({
      where: {
        periodId,
        bankAccount: { companyId },
        status: "LOCKED"
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.taxRecord.findMany({
      where: { companyId, periodId }
    }),
    prisma.financialStatementLine.count({
      where: {
        companyId,
        periodId,
        rawFields: {
          path: ["generatedBy"],
          equals: "commercial-accounting"
        }
      }
    })
  ]);

  const draftCount = entries.filter((entry) => entry.status === "DRAFT").length;
  const unbalancedCount = entries.filter((entry) => {
    if (entry.status === "VOID") return false;
    const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
    return !sameMoney(debit, credit);
  }).length;
  const taxDraftCount = taxRecords.filter((row) => row.status === "DRAFT").length;
  const taxReady =
    taxRecords.length > 0 &&
    taxRecords.every((row) => ["REVIEWED", "FILED", "LOCKED"].includes(row.status));
  const bankReady =
    bankTransactionCount === 0 || (bankOpenCount === 0 && Boolean(bankLock));
  const financialReady = financialLineCount > 0;

  return {
    ...trialBalance,
    draftCount,
    unbalancedCount,
    bankTransactionCount,
    bankOpenCount,
    bankReconciliationLocked: Boolean(bankLock),
    taxRecordCount: taxRecords.length,
    taxDraftCount,
    taxReady,
    financialLineCount,
    financialReady,
    canLock:
      trialBalance.isBalanced &&
      draftCount === 0 &&
      unbalancedCount === 0 &&
      bankReady &&
      taxReady &&
      financialReady
  };
}
