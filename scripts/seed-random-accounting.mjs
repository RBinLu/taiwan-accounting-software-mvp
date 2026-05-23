import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function loadLocalEnv() {
  const envPath = path.join(rootDir, "app", "web", ".env.local");
  const content = await readFile(envPath, "utf8").catch(() => "");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
  process.env.ACCOUNTING_WORKSPACE_ROOT ||= rootDir;
}

await loadLocalEnv();

if (!process.env.DATABASE_URL?.includes("127.0.0.1:55432")) {
  throw new Error("Random seed must use the project PostgreSQL on 127.0.0.1:55432.");
}

const prisma = new PrismaClient();
const runId = `R${Date.now().toString(36).toUpperCase()}`;

function makeRng(seedText) {
  let seed = 2166136261;
  for (const char of seedText) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return function rng() {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(runId);

function pick(items) {
  return items[Math.floor(rng() * items.length)];
}

function amount(min, max, step = 100) {
  const raw = min + Math.floor(rng() * ((max - min) / step + 1)) * step;
  return Math.round(raw * 100) / 100;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dateValue(text) {
  return new Date(`${text}T00:00:00+08:00`);
}

function randomDate(period) {
  const day = 1 + Math.floor(rng() * 23);
  return `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function upsertAccount(companyId, [code, name, type, normalBalance]) {
  return prisma.account.upsert({
    where: { companyId_code: { companyId, code } },
    create: { companyId, code, name, type, normalBalance },
    update: { name, type, normalBalance, isActive: true }
  });
}

async function ensureContext() {
  const company = await prisma.company.upsert({
    where: { taxId: "00000000" },
    create: {
      taxId: "00000000",
      taxRegistrationNumber: "DEMO-TAX-REG",
      name: "範例公司",
      representativeName: "測試負責人",
      address: "台北市信義區範例路 1 號",
      filingType: "401"
    },
    update: {}
  });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const period = await prisma.accountingPeriod.upsert({
    where: { companyId_year_month: { companyId: company.id, year, month } },
    create: {
      companyId: company.id,
      year,
      month,
      taxPeriod: `${year}-${String(month).padStart(2, "0")}`
    },
    update: {}
  });

  if (period.isLocked) {
    throw new Error(`${period.taxPeriod} 已鎖帳，不能產生測試資料。`);
  }

  const bankAccount = await prisma.bankAccount.upsert({
    where: { companyId_accountName: { companyId: company.id, accountName: "主要銀行帳戶" } },
    create: {
      companyId: company.id,
      bankName: "範例銀行",
      accountName: "主要銀行帳戶",
      accountNumber: "000-000-000000",
      openingBalance: 0,
      currentBalance: 0
    },
    update: {}
  });

  const accounts = [
    ["1110", "現金", "ASSET", "DEBIT"],
    ["1120", "銀行存款", "ASSET", "DEBIT"],
    ["1130", "應收帳款", "ASSET", "DEBIT"],
    ["1140", "存貨", "ASSET", "DEBIT"],
    ["1150", "預付費用", "ASSET", "DEBIT"],
    ["1210", "進項稅額", "ASSET", "DEBIT"],
    ["1220", "固定資產", "ASSET", "DEBIT"],
    ["2110", "應付帳款", "LIABILITY", "CREDIT"],
    ["2120", "銷項稅額", "LIABILITY", "CREDIT"],
    ["2130", "其他應付款", "LIABILITY", "CREDIT"],
    ["3110", "業主資本", "EQUITY", "CREDIT"],
    ["3120", "保留盈餘", "EQUITY", "CREDIT"],
    ["4110", "銷貨收入", "REVENUE", "CREDIT"],
    ["4120", "服務收入", "REVENUE", "CREDIT"],
    ["4130", "其他收入", "REVENUE", "CREDIT"],
    ["5110", "進貨成本", "EXPENSE", "DEBIT"],
    ["6110", "營業費用", "EXPENSE", "DEBIT"],
    ["6120", "租金支出", "EXPENSE", "DEBIT"],
    ["6130", "薪資支出", "EXPENSE", "DEBIT"],
    ["6140", "交通費", "EXPENSE", "DEBIT"],
    ["6150", "廣告費", "EXPENSE", "DEBIT"],
    ["6160", "水電費", "EXPENSE", "DEBIT"]
  ];

  await Promise.all(accounts.map((row) => upsertAccount(company.id, row)));
  return { company, period, bankAccount };
}

async function accountIdByCode(companyId, code) {
  const account = await prisma.account.findUnique({
    where: { companyId_code: { companyId, code } }
  });
  if (!account) throw new Error(`找不到科目 ${code}`);
  return account.id;
}

async function createJournal(company, period, entryDate, entryNo, description, lines) {
  const totalDebit = money(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const totalCredit = money(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  if (Math.abs(totalDebit - totalCredit) >= 0.005) {
    throw new Error(`${entryNo} 借貸不平衡`);
  }

  const lineData = [];
  for (const [index, line] of lines.entries()) {
    lineData.push({
      accountId: await accountIdByCode(company.id, line.accountCode),
      description,
      debit: money(line.debit),
      credit: money(line.credit),
      sortOrder: index + 1
    });
  }

  return prisma.journalEntry.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      entryNo,
      entryDate: dateValue(entryDate),
      description,
      status: "POSTED",
      sourceType: "randomSeed",
      sourceId: runId,
      lines: { create: lineData }
    }
  });
}

async function upsertCounterparty(companyId, type, name) {
  return prisma.counterparty.upsert({
    where: { companyId_name_type: { companyId, name, type } },
    create: {
      companyId,
      type,
      name,
      taxId: String(10000000 + Math.floor(rng() * 89999999))
    },
    update: {}
  });
}

async function createInvoice(company, period, kind, index) {
  const isReceivable = kind === "RECEIVABLE";
  const counterparty = await upsertCounterparty(
    company.id,
    isReceivable ? "CUSTOMER" : "VENDOR",
    `${isReceivable ? "客戶" : "供應商"}-${runId}-${index}`
  );
  const subtotal = amount(isReceivable ? 6000 : 3000, isReceivable ? 42000 : 26000);
  const taxAmount = money(subtotal * 0.05);
  const totalAmount = money(subtotal + taxAmount);
  const documentNo = `${isReceivable ? "AR" : "AP"}-${runId}-${String(index).padStart(2, "0")}`;
  const documentDate = randomDate(period);
  const revenueAccountCode = pick(["4110", "4120", "4130"]);
  const expenseAccountCode = pick(["5110", "6110", "6120", "6130", "6140", "6150", "6160"]);
  const description = `${isReceivable ? "隨機銷售" : "隨機採購"} ${documentNo}`;

  const invoice = await prisma.invoiceRecord.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      counterpartyId: counterparty.id,
      kind,
      documentNo,
      documentDate: dateValue(documentDate),
      dueDate: dateValue(randomDate(period)),
      description,
      subtotal,
      taxAmount,
      totalAmount,
      status: "OPEN"
    }
  });

  const lines = isReceivable
    ? [
        { accountCode: "1130", debit: totalAmount, credit: 0 },
        { accountCode: revenueAccountCode, debit: 0, credit: subtotal },
        { accountCode: "2120", debit: 0, credit: taxAmount }
      ]
    : [
        { accountCode: expenseAccountCode, debit: subtotal, credit: 0 },
        { accountCode: "1210", debit: taxAmount, credit: 0 },
        { accountCode: "2110", debit: 0, credit: totalAmount }
      ];

  const journalEntry = await createJournal(
    company,
    period,
    documentDate,
    `${isReceivable ? "AR" : "AP"}J-${runId}-${String(index).padStart(2, "0")}`,
    description,
    lines
  );

  return { invoice, journalEntry };
}

async function settleInvoice(company, period, bankAccount, invoice, ratio = 1) {
  const totalAmount = Number(invoice.totalAmount);
  const paidAmount = Number(invoice.paidAmount);
  const remaining = money(totalAmount - paidAmount);
  const paymentAmount = money(Math.min(remaining, Math.max(100, totalAmount * ratio)));
  const isReceivable = invoice.kind === "RECEIVABLE";
  const paymentDate = randomDate(period);
  const description = `${isReceivable ? "隨機收款" : "隨機付款"} ${invoice.documentNo}`;
  const journalEntry = await createJournal(
    company,
    period,
    paymentDate,
    `${isReceivable ? "RCPT" : "PAY"}-${runId}-${invoice.documentNo}`,
    description,
    isReceivable
      ? [
          { accountCode: "1120", debit: paymentAmount, credit: 0 },
          { accountCode: "1130", debit: 0, credit: paymentAmount }
        ]
      : [
          { accountCode: "2110", debit: paymentAmount, credit: 0 },
          { accountCode: "1120", debit: 0, credit: paymentAmount }
        ]
  );

  const newPaidAmount = money(paidAmount + paymentAmount);
  const nextStatus = newPaidAmount >= totalAmount ? "PAID" : "PARTIAL";

  const [updatedInvoice, bankTransaction] = await Promise.all([
    prisma.invoiceRecord.update({
      where: { id: invoice.id },
      data: {
        paidAmount: newPaidAmount,
        status: nextStatus
      }
    }),
    prisma.bankTransaction.create({
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
    prisma.bankAccount.update({
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

async function createManualJournals(company, period) {
  const cases = [
    () => ({
      description: "業主增資",
      lines: [
        { accountCode: "1110", debit: amount(20000, 80000), credit: 0 },
        { accountCode: "3110", debit: 0, credit: 0 }
      ]
    }),
    () => ({
      description: "現金支付營業費用",
      lines: [
        { accountCode: pick(["6110", "6120", "6130", "6140", "6150", "6160"]), debit: amount(800, 9000), credit: 0 },
        { accountCode: "1110", debit: 0, credit: 0 }
      ]
    }),
    () => ({
      description: "購入存貨",
      lines: [
        { accountCode: "1140", debit: amount(5000, 28000), credit: 0 },
        { accountCode: "1110", debit: 0, credit: 0 }
      ]
    }),
    () => ({
      description: "購入固定資產",
      lines: [
        { accountCode: "1220", debit: amount(12000, 60000), credit: 0 },
        { accountCode: "1110", debit: 0, credit: 0 }
      ]
    })
  ];

  for (let i = 1; i <= 14; i += 1) {
    const row = pick(cases)();
    const debit = row.lines[0].debit;
    row.lines[1].credit = debit;
    await createJournal(
      company,
      period,
      randomDate(period),
      `JV-${runId}-${String(i).padStart(2, "0")}`,
      `${row.description} ${runId}-${i}`,
      row.lines
    );
  }
}

async function rebuildTax(company, period) {
  const invoices = await prisma.invoiceRecord.findMany({
    where: { companyId: company.id, periodId: period.id, status: { not: "VOID" } }
  });
  const salesAmount = money(invoices.filter((row) => row.kind === "RECEIVABLE").reduce((sum, row) => sum + Number(row.subtotal), 0));
  const purchaseAmount = money(invoices.filter((row) => row.kind === "PAYABLE").reduce((sum, row) => sum + Number(row.subtotal), 0));
  const outputTax = money(invoices.filter((row) => row.kind === "RECEIVABLE").reduce((sum, row) => sum + Number(row.taxAmount), 0));
  const inputTax = money(invoices.filter((row) => row.kind === "PAYABLE").reduce((sum, row) => sum + Number(row.taxAmount), 0));
  const payableTax = money(outputTax - inputTax);

  await prisma.taxRecord.upsert({
    where: { companyId_periodId_taxType: { companyId: company.id, periodId: period.id, taxType: "VAT" } },
    create: {
      companyId: company.id,
      periodId: period.id,
      taxType: "VAT",
      salesAmount,
      purchaseAmount,
      outputTax,
      inputTax,
      payableTax,
      status: "REVIEWED"
    },
    update: {
      salesAmount,
      purchaseAmount,
      outputTax,
      inputTax,
      payableTax,
      status: "REVIEWED"
    }
  });

  await prisma.vatReturn.upsert({
    where: { companyId_periodId_returnType: { companyId: company.id, periodId: period.id, returnType: "FORM_401" } },
    create: {
      companyId: company.id,
      periodId: period.id,
      returnType: "FORM_401",
      taxableSales: salesAmount,
      outputTax,
      purchaseExpenseAmount: purchaseAmount,
      inputTax,
      payableTax,
      filingStatus: "REVIEWED",
      rawFields: { generatedBy: "random-seed", runId }
    },
    update: {
      taxableSales: salesAmount,
      outputTax,
      purchaseExpenseAmount: purchaseAmount,
      inputTax,
      payableTax,
      filingStatus: "REVIEWED",
      rawFields: { generatedBy: "random-seed", runId }
    }
  });

  return { salesAmount, purchaseAmount, outputTax, inputTax, payableTax };
}

async function getTrialBalance(company, period) {
  const [accounts, lines] = await Promise.all([
    prisma.account.findMany({ where: { companyId: company.id }, orderBy: { code: "asc" } }),
    prisma.journalLine.findMany({
      where: { journalEntry: { companyId: company.id, periodId: period.id, status: "POSTED" } },
      include: { account: true }
    })
  ]);
  const map = new Map(accounts.map((account) => [account.id, { account, debit: 0, credit: 0 }]));
  for (const line of lines) {
    const row = map.get(line.accountId);
    if (!row) continue;
    row.debit += Number(line.debit);
    row.credit += Number(line.credit);
  }
  return [...map.values()].map((row) => {
    const debit = money(row.debit);
    const credit = money(row.credit);
    const balance = money(debit - credit);
    return {
      ...row,
      debit,
      credit,
      endingDebit: balance >= 0 ? balance : 0,
      endingCredit: balance < 0 ? Math.abs(balance) : 0
    };
  });
}

function accountSignedBalance(row) {
  const balance = Number(row.debit) - Number(row.credit);
  return row.account.normalBalance === "CREDIT" ? money(-balance) : money(balance);
}

async function rebuildFinancials(company, period) {
  const rows = await getTrialBalance(company, period);
  const revenueRows = rows
    .filter((row) => row.account.type === "REVENUE" && accountSignedBalance(row) !== 0)
    .map((row) => ({ statementType: "INCOME_STATEMENT", lineCode: row.account.code, lineName: row.account.name, amountCurrent: accountSignedBalance(row) }));
  const expenseRows = rows
    .filter((row) => row.account.type === "EXPENSE" && accountSignedBalance(row) !== 0)
    .map((row) => ({ statementType: "INCOME_STATEMENT", lineCode: row.account.code, lineName: row.account.name, amountCurrent: accountSignedBalance(row) }));
  const totalRevenue = money(revenueRows.reduce((sum, row) => sum + Number(row.amountCurrent), 0));
  const totalExpense = money(expenseRows.reduce((sum, row) => sum + Number(row.amountCurrent), 0));
  const netIncome = money(totalRevenue - totalExpense);
  const balanceRows = rows
    .filter((row) => ["ASSET", "LIABILITY", "EQUITY"].includes(row.account.type))
    .filter((row) => accountSignedBalance(row) !== 0)
    .map((row) => ({ statementType: "BALANCE_SHEET", lineCode: row.account.code, lineName: row.account.name, amountCurrent: accountSignedBalance(row) }));

  await prisma.financialStatementLine.deleteMany({
    where: {
      companyId: company.id,
      periodId: period.id,
      rawFields: { path: ["generatedBy"], equals: "commercial-accounting" }
    }
  });

  const statementRows = [
    ...revenueRows,
    ...expenseRows,
    { statementType: "INCOME_STATEMENT", lineCode: "NET_INCOME", lineName: "本期損益", amountCurrent: netIncome },
    ...balanceRows,
    { statementType: "BALANCE_SHEET", lineCode: "3999", lineName: "本期損益", amountCurrent: netIncome }
  ];

  for (const [index, row] of statementRows.entries()) {
    await prisma.financialStatementLine.create({
      data: {
        companyId: company.id,
        periodId: period.id,
        statementType: row.statementType,
        lineCode: row.lineCode,
        lineName: row.lineName,
        amountCurrent: row.amountCurrent,
        amountPrior: 0,
        sortOrder: index + 1,
        rawFields: { generatedBy: "commercial-accounting", generatedKind: "financials", runId }
      }
    });
  }

  return { lineCount: statementRows.length, totalRevenue, totalExpense, netIncome };
}

async function createApprovalsAndAttachments(company, period, invoices) {
  for (let i = 1; i <= 5; i += 1) {
    await prisma.approvalRequest.create({
      data: {
        companyId: company.id,
        entityType: pick(["journal", "payment", "export", "tax"]),
        title: `隨機審核 ${runId}-${i}`,
        requesterName: pick(["王會計", "林出納", "陳財務"]),
        approverName: pick(["系統管理者", "李主管"]),
        status: pick(["PENDING", "PENDING", "APPROVED"])
      }
    });
  }

  for (let i = 0; i < Math.min(6, invoices.length); i += 1) {
    const invoice = invoices[i];
    await prisma.attachment.create({
      data: {
        companyId: company.id,
        linkedEntityType: invoice.kind === "RECEIVABLE" ? "receivable" : "payable",
        linkedEntityId: invoice.id,
        fileName: `${invoice.documentNo}.pdf`,
        storagePath: `storage/uploads/mock-${invoice.documentNo}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: Math.floor(amount(60_000, 500_000, 1000))
      }
    });
  }
}

async function createExport(company, period, exportType, rows) {
  const fileName = `${period.taxPeriod}-${exportType}-${runId}.csv`;
  const relativePath = path.join("storage", "exports", fileName);
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
  return prisma.exportFile.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      exportType,
      status: "GENERATED",
      storagePath: relativePath
    }
  });
}

async function createExports(company, period) {
  const trialRows = await getTrialBalance(company, period);
  await createExport(company, period, "trial-balance", [
    ["科目代碼", "科目名稱", "類型", "借方發生", "貸方發生", "期末借方", "期末貸方"],
    ...trialRows.map((row) => [row.account.code, row.account.name, row.account.type, row.debit, row.credit, row.endingDebit, row.endingCredit])
  ]);
  const financialRows = await prisma.financialStatementLine.findMany({
    where: { companyId: company.id, periodId: period.id },
    orderBy: [{ statementType: "asc" }, { sortOrder: "asc" }]
  });
  await createExport(company, period, "financials", [
    ["期別", "報表", "代碼", "項目", "本期", "比較期"],
    ...financialRows.map((row) => [period.taxPeriod, row.statementType, row.lineCode || "", row.lineName, Number(row.amountCurrent || 0), Number(row.amountPrior || 0)])
  ]);
}

async function main() {
  const { company, period, bankAccount } = await ensureContext();
  const createdInvoices = [];

  await createManualJournals(company, period);

  for (let i = 1; i <= 10; i += 1) {
    const { invoice } = await createInvoice(company, period, "RECEIVABLE", i);
    createdInvoices.push(invoice);
    if (i <= 7) {
      await settleInvoice(company, period, bankAccount, invoice, i % 3 === 0 ? 0.55 : 1);
    }
  }

  for (let i = 1; i <= 9; i += 1) {
    const { invoice } = await createInvoice(company, period, "PAYABLE", i);
    createdInvoices.push(invoice);
    if (i <= 6) {
      await settleInvoice(company, period, bankAccount, invoice, i % 2 === 0 ? 0.5 : 1);
    }
  }

  const taxSummary = await rebuildTax(company, period);
  const financialSummary = await rebuildFinancials(company, period);
  await createApprovalsAndAttachments(company, period, createdInvoices);
  await createExports(company, period);

  const counts = {
    accounts: await prisma.account.count({ where: { companyId: company.id } }),
    journalEntries: await prisma.journalEntry.count({ where: { companyId: company.id, periodId: period.id } }),
    invoices: await prisma.invoiceRecord.count({ where: { companyId: company.id, periodId: period.id } }),
    bankTransactions: await prisma.bankTransaction.count({ where: { bankAccount: { companyId: company.id } } }),
    financialLines: await prisma.financialStatementLine.count({ where: { companyId: company.id, periodId: period.id } })
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId,
        period: period.taxPeriod,
        counts,
        taxSummary,
        financialSummary
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
