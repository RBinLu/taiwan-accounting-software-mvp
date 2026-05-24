import {
  AccountingError,
  assertPeriodOpen,
  getTrialBalance,
  moneyValue
} from "./accounting-core.js";
import { prisma } from "./prisma.js";

function accountSignedBalance(row) {
  const balance = Number(row.debit) - Number(row.credit);
  if (row.account.normalBalance === "CREDIT") {
    return moneyValue(-balance);
  }
  return moneyValue(balance);
}

function generatedRawFields(kind) {
  return {
    generatedBy: "commercial-accounting",
    generatedKind: kind,
    generatedAt: new Date().toISOString()
  };
}

export async function rebuildTaxSummary({ company, period, db = prisma }) {
  assertPeriodOpen(period);

  const invoices = await db.invoiceRecord.findMany({
    where: {
      companyId: company.id,
      periodId: period.id,
      status: { not: "VOID" }
    }
  });

  const salesAmount = moneyValue(
    invoices
      .filter((invoice) => invoice.kind === "RECEIVABLE")
      .reduce((sum, invoice) => sum + Number(invoice.subtotal), 0)
  );
  const purchaseAmount = moneyValue(
    invoices
      .filter((invoice) => invoice.kind === "PAYABLE")
      .reduce((sum, invoice) => sum + Number(invoice.subtotal), 0)
  );
  const outputTax = moneyValue(
    invoices
      .filter((invoice) => invoice.kind === "RECEIVABLE")
      .reduce((sum, invoice) => sum + Number(invoice.taxAmount), 0)
  );
  const inputTax = moneyValue(
    invoices
      .filter((invoice) => invoice.kind === "PAYABLE")
      .reduce((sum, invoice) => sum + Number(invoice.taxAmount), 0)
  );
  const payableTax = moneyValue(outputTax - inputTax);

  const existingTax = await db.taxRecord.findUnique({
    where: {
      companyId_periodId_taxType: {
        companyId: company.id,
        periodId: period.id,
        taxType: "VAT"
      }
    }
  });

  if (["FILED", "LOCKED"].includes(existingTax?.status)) {
    throw new AccountingError("稅務已申報或鎖定，不能直接重算");
  }

  const taxRecord = await db.taxRecord.upsert({
    where: {
      companyId_periodId_taxType: {
        companyId: company.id,
        periodId: period.id,
        taxType: "VAT"
      }
    },
    create: {
      companyId: company.id,
      periodId: period.id,
      taxType: "VAT",
      salesAmount,
      purchaseAmount,
      outputTax,
      inputTax,
      payableTax,
      status: "DRAFT"
    },
    update: {
      salesAmount,
      purchaseAmount,
      outputTax,
      inputTax,
      payableTax,
      status: "DRAFT"
    }
  });

  const vatReturn = await db.vatReturn.upsert({
    where: {
      companyId_periodId_returnType: {
        companyId: company.id,
        periodId: period.id,
        returnType: "FORM_401"
      }
    },
    create: {
      companyId: company.id,
      periodId: period.id,
      returnType: "FORM_401",
      taxableSales: salesAmount,
      outputTax,
      purchaseExpenseAmount: purchaseAmount,
      inputTax,
      payableTax,
      filingStatus: "DRAFT",
      rawFields: generatedRawFields("tax")
    },
    update: {
      taxableSales: salesAmount,
      outputTax,
      purchaseExpenseAmount: purchaseAmount,
      inputTax,
      payableTax,
      filingStatus: "DRAFT",
      rawFields: generatedRawFields("tax")
    }
  });

  return { taxRecord, vatReturn };
}

export async function updateTaxFilingStatus({
  company,
  period,
  action,
  db = prisma
}) {
  assertPeriodOpen(period);

  const nextStatus = action === "review" ? "REVIEWED" : action === "file" ? "FILED" : "";
  if (!nextStatus) {
    throw new AccountingError("未知的稅務操作");
  }

  const taxRecord = await db.taxRecord.findUnique({
    where: {
      companyId_periodId_taxType: {
        companyId: company.id,
        periodId: period.id,
        taxType: "VAT"
      }
    }
  });

  if (!taxRecord) {
    throw new AccountingError("請先重算本期稅務");
  }

  if (action === "file" && taxRecord.status !== "REVIEWED") {
    throw new AccountingError("申報前需先完成稅務複核");
  }

  const [updatedTaxRecord, vatReturn] = await Promise.all([
    db.taxRecord.update({
      where: { id: taxRecord.id },
      data: { status: nextStatus }
    }),
    db.vatReturn.upsert({
      where: {
        companyId_periodId_returnType: {
          companyId: company.id,
          periodId: period.id,
          returnType: "FORM_401"
        }
      },
      create: {
        companyId: company.id,
        periodId: period.id,
        returnType: "FORM_401",
        taxableSales: taxRecord.salesAmount,
        outputTax: taxRecord.outputTax,
        purchaseExpenseAmount: taxRecord.purchaseAmount,
        inputTax: taxRecord.inputTax,
        payableTax: taxRecord.payableTax,
        filingStatus: nextStatus,
        filingDate: nextStatus === "FILED" ? new Date() : undefined,
        rawFields: generatedRawFields("tax")
      },
      update: {
        filingStatus: nextStatus,
        filingDate: nextStatus === "FILED" ? new Date() : undefined
      }
    })
  ]);

  return { taxRecord: updatedTaxRecord, vatReturn };
}

export async function generateFinancialStatements({
  company,
  period,
  db = prisma
}) {
  assertPeriodOpen(period);

  const trialBalance = await getTrialBalance(company.id, period.id, db);
  const revenueRows = trialBalance.rows
    .filter((row) => row.account.type === "REVENUE" && accountSignedBalance(row) !== 0)
    .map((row) => ({
      statementType: "INCOME_STATEMENT",
      lineCode: row.account.code,
      lineName: row.account.name,
      amountCurrent: accountSignedBalance(row)
    }));
  const expenseRows = trialBalance.rows
    .filter((row) => row.account.type === "EXPENSE" && accountSignedBalance(row) !== 0)
    .map((row) => ({
      statementType: "INCOME_STATEMENT",
      lineCode: row.account.code,
      lineName: row.account.name,
      amountCurrent: accountSignedBalance(row)
    }));
  const totalRevenue = moneyValue(
    revenueRows.reduce((sum, row) => sum + Number(row.amountCurrent), 0)
  );
  const totalExpense = moneyValue(
    expenseRows.reduce((sum, row) => sum + Number(row.amountCurrent), 0)
  );
  const netIncome = moneyValue(totalRevenue - totalExpense);

  const balanceRows = trialBalance.rows
    .filter((row) => ["ASSET", "LIABILITY", "EQUITY"].includes(row.account.type))
    .filter((row) => accountSignedBalance(row) !== 0)
    .map((row) => ({
      statementType: "BALANCE_SHEET",
      lineCode: row.account.code,
      lineName: row.account.name,
      amountCurrent: accountSignedBalance(row)
    }));
  const cashRows = trialBalance.rows.filter((row) =>
    ["1110", "1120"].includes(row.account.code)
  );
  const cashInflows = moneyValue(
    cashRows.reduce((sum, row) => sum + Number(row.debit), 0)
  );
  const cashOutflows = moneyValue(
    cashRows.reduce((sum, row) => sum + Number(row.credit), 0)
  );
  const netCashFlow = moneyValue(cashInflows - cashOutflows);
  const endingCash = moneyValue(
    cashRows.reduce((sum, row) => sum + accountSignedBalance(row), 0)
  );
  const cashFlowRows = [
    {
      statementType: "CASH_FLOW",
      lineCode: "CF_IN",
      lineName: "本期現金流入",
      amountCurrent: cashInflows
    },
    {
      statementType: "CASH_FLOW",
      lineCode: "CF_OUT",
      lineName: "本期現金流出",
      amountCurrent: cashOutflows
    },
    {
      statementType: "CASH_FLOW",
      lineCode: "CF_NET",
      lineName: "本期現金淨增加",
      amountCurrent: netCashFlow
    },
    {
      statementType: "CASH_FLOW",
      lineCode: "CF_END",
      lineName: "期末現金及銀行存款",
      amountCurrent: endingCash
    }
  ];

  const statementRows = [
    ...revenueRows,
    ...expenseRows,
    {
      statementType: "INCOME_STATEMENT",
      lineCode: "NET_INCOME",
      lineName: "本期損益",
      amountCurrent: netIncome
    },
    ...balanceRows,
    {
      statementType: "BALANCE_SHEET",
      lineCode: "3999",
      lineName: "本期損益",
      amountCurrent: netIncome
    },
    ...cashFlowRows
  ];

  await db.financialStatementLine.deleteMany({
    where: {
      companyId: company.id,
      periodId: period.id,
      rawFields: {
        path: ["generatedBy"],
        equals: "commercial-accounting"
      }
    }
  });

  const created = [];
  for (const [index, row] of statementRows.entries()) {
    created.push(
      await db.financialStatementLine.create({
        data: {
          companyId: company.id,
          periodId: period.id,
          statementType: row.statementType,
          lineCode: row.lineCode,
          lineName: row.lineName,
          amountCurrent: row.amountCurrent,
          amountPrior: 0,
          sortOrder: index + 1,
          rawFields: generatedRawFields("financials")
        }
      })
    );
  }

  return {
    rows: created,
    summary: {
      totalRevenue,
      totalExpense,
      netIncome,
      netCashFlow,
      lineCount: created.length
    }
  };
}
