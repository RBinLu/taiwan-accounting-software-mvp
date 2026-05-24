import {
  AccountingError,
  assertPeriodOpen,
  createBalancedJournalEntry,
  dateValue,
  getTrialBalance,
  moneyValue,
  periodDateRange,
  textValue
} from "./accounting-core.js";
import {
  generateFinancialStatements,
  rebuildTaxSummary,
  updateTaxFilingStatus
} from "./commercial-accounting.js";
import { prisma } from "./prisma.js";

function periodEndDate(period) {
  return periodDateRange(period).end;
}

function decimal4(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    throw new AccountingError("數量格式不正確");
  }
  return Math.round(number * 10000) / 10000;
}

function sameDay(left, right) {
  const leftDate = left instanceof Date ? left : dateValue(left);
  const rightDate = right instanceof Date ? right : dateValue(right);
  return leftDate.toISOString().slice(0, 10) ===
    rightDate.toISOString().slice(0, 10);
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

async function lockInventoryItem(companyId, itemId, db) {
  if (!itemId || typeof db.$queryRaw !== "function") return;

  await db.$queryRaw`
    SELECT "id"
    FROM "InventoryItem"
    WHERE "id" = ${itemId}
      AND "companyId" = ${companyId}
    FOR UPDATE
  `;
}

function journalDateForPeriod(period) {
  return `${period.year}-${String(period.month).padStart(2, "0")}-01`;
}

async function updateExistingFixedAsset({ existingAsset, assetData, db }) {
  const sameBookBasis =
    sameDay(existingAsset.acquisitionDate, assetData.acquisitionDate) &&
    moneyValue(existingAsset.acquisitionCost) === assetData.acquisitionCost &&
    moneyValue(existingAsset.salvageValue) === assetData.salvageValue &&
    Number(existingAsset.usefulLifeMonths) === assetData.usefulLifeMonths;

  if (!sameBookBasis) {
    throw new AccountingError(
      "既有固定資產不能直接修改取得日、成本、殘值或耐用月數；請建立調整或沖銷分錄",
      400
    );
  }

  const asset = await db.fixedAsset.update({
    where: { id: existingAsset.id },
    data: {
      name: assetData.name,
      depreciationAccountCode: assetData.depreciationAccountCode,
      accumulatedDepreciationAccountCode:
        assetData.accumulatedDepreciationAccountCode,
      status: "ACTIVE"
    }
  });

  return { asset, journalEntry: null, created: false, beforeValue: existingAsset };
}

export async function reverseJournalEntry({
  company,
  period,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const entryId = textValue(payload.entryId);
  if (!entryId) throw new AccountingError("缺少分錄 ID");

  const entry = await db.journalEntry.findFirst({
    where: {
      id: entryId,
      companyId: company.id,
      periodId: period.id
    },
    include: {
      lines: { include: { account: true } },
      reversalEntries: true
    }
  });

  if (!entry) throw new AccountingError("找不到本期分錄", 404);
  if (entry.status !== "POSTED") throw new AccountingError("只有已過帳分錄可以沖銷");
  if (entry.reversalEntries.length) throw new AccountingError("這張分錄已建立沖銷分錄");

  const reversal = await createBalancedJournalEntry({
    company,
    period,
    db,
    payload: {
      entryPrefix: "RV",
      entryDate: payload.entryDate || new Date().toISOString().slice(0, 10),
      description: textValue(payload.reason) || `沖銷 ${entry.entryNo}`,
      status: "POSTED",
      sourceType: "reversal",
      sourceId: entry.id,
      lines: entry.lines.map((line) => ({
        accountCode: line.account.code,
        description: `沖銷 ${entry.entryNo}`,
        debit: Number(line.credit),
        credit: Number(line.debit)
      }))
    }
  });

  const marked = await db.journalEntry.update({
    where: { id: entry.id },
    data: {
      voidReason: textValue(payload.reason) || "已建立沖銷分錄",
      voidedAt: new Date()
    }
  });

  await db.journalEntry.update({
    where: { id: reversal.id },
    data: { reversalOfId: entry.id }
  });

  return { original: marked, reversal };
}

export async function createFixedAsset({
  company,
  period,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const assetNo = textValue(payload.assetNo);
  const name = textValue(payload.name);
  const acquisitionCost = moneyValue(payload.acquisitionCost);
  const salvageValue = moneyValue(payload.salvageValue);
  const usefulLifeMonths = Number(payload.usefulLifeMonths || 0);

  if (!assetNo || !name) throw new AccountingError("資產編號與名稱必填");
  if (acquisitionCost <= 0) throw new AccountingError("取得成本必須大於零");
  if (usefulLifeMonths <= 0) throw new AccountingError("耐用月數必須大於零");
  if (salvageValue >= acquisitionCost) {
    throw new AccountingError("殘值必須小於取得成本");
  }

  const existingAsset = await db.fixedAsset.findUnique({
    where: {
      companyId_assetNo: {
        companyId: company.id,
        assetNo
      }
    }
  });
  const assetData = {
    name,
    acquisitionDate: dateValue(payload.acquisitionDate),
    acquisitionCost,
    salvageValue,
    usefulLifeMonths,
    depreciationAccountCode: textValue(payload.depreciationAccountCode) || "6170",
    accumulatedDepreciationAccountCode:
      textValue(payload.accumulatedDepreciationAccountCode) || "1230"
  };

  if (existingAsset) {
    return updateExistingFixedAsset({
      existingAsset,
      assetData,
      db
    });
  }

  let asset;
  try {
    asset = await db.fixedAsset.create({
      data: {
        companyId: company.id,
        periodId: period.id,
        assetNo,
        ...assetData
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const racedAsset = await db.fixedAsset.findUnique({
      where: {
        companyId_assetNo: {
          companyId: company.id,
          assetNo
        }
      }
    });
    if (!racedAsset) throw error;
    return updateExistingFixedAsset({
      existingAsset: racedAsset,
      assetData,
      db
    });
  }

  const journalEntry = await createBalancedJournalEntry({
    company,
    period,
    db,
    payload: {
      entryPrefix: "FA",
      entryDate: payload.acquisitionDate,
      description: `固定資產取得 ${assetNo} ${name}`,
      status: "POSTED",
      sourceType: "fixedAsset",
      sourceId: asset.id,
      lines: [
        { accountCode: "1220", debit: acquisitionCost, credit: 0 },
        {
          accountCode: textValue(payload.creditAccountCode) || "2110",
          debit: 0,
          credit: acquisitionCost
        }
      ]
    }
  });

  return { asset, journalEntry, created: true, beforeValue: null };
}

export async function runFixedAssetDepreciation({
  company,
  period,
  db = prisma
}) {
  assertPeriodOpen(period);

  const assets = await db.fixedAsset.findMany({
    where: {
      companyId: company.id,
      status: "ACTIVE",
      acquisitionDate: { lt: periodEndDate(period) }
    },
    include: { depreciationRuns: true }
  });

  const created = [];
  for (const asset of assets) {
    if (asset.depreciationRuns.some((run) => run.periodId === period.id)) {
      continue;
    }

    const depreciableAmount = moneyValue(
      Number(asset.acquisitionCost) - Number(asset.salvageValue)
    );
    const accumulated = moneyValue(
      asset.depreciationRuns.reduce(
        (sum, run) => sum + Number(run.depreciationAmount),
        0
      )
    );
    const monthlyAmount = moneyValue(depreciableAmount / asset.usefulLifeMonths);
    const remaining = moneyValue(depreciableAmount - accumulated);
    const depreciationAmount = moneyValue(Math.min(monthlyAmount, remaining));

    if (depreciationAmount <= 0) {
      await db.fixedAsset.update({
        where: { id: asset.id },
        data: { status: "FULLY_DEPRECIATED" }
      });
      continue;
    }

    const journalEntry = await createBalancedJournalEntry({
      company,
      period,
      db,
      payload: {
        entryPrefix: "DEP",
        entryDate: journalDateForPeriod(period),
        description: `提列折舊 ${asset.assetNo} ${asset.name}`,
        status: "POSTED",
        sourceType: "fixedAssetDepreciation",
        sourceId: asset.id,
        lines: [
          {
            accountCode: asset.depreciationAccountCode,
            debit: depreciationAmount,
            credit: 0
          },
          {
            accountCode: asset.accumulatedDepreciationAccountCode,
            debit: 0,
            credit: depreciationAmount
          }
        ]
      }
    });

    const run = await db.fixedAssetDepreciation.create({
      data: {
        fixedAssetId: asset.id,
        periodId: period.id,
        journalEntryId: journalEntry.id,
        depreciationAmount,
        accumulatedAmount: moneyValue(accumulated + depreciationAmount)
      }
    });
    created.push({ asset, run, journalEntry });
  }

  return { created, count: created.length };
}

export async function recordInventoryTransaction({
  company,
  period,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const sku = textValue(payload.sku);
  const name = textValue(payload.name) || sku;
  const transactionType = textValue(payload.transactionType) || "PURCHASE";
  const quantity = decimal4(payload.quantity);
  const unitCostInput = decimal4(payload.unitCost);

  if (!sku || !name) throw new AccountingError("SKU 與品名必填");
  if (!["PURCHASE", "ISSUE", "ADJUSTMENT"].includes(transactionType)) {
    throw new AccountingError("存貨異動類型不正確");
  }
  if (quantity <= 0) throw new AccountingError("數量必須大於零");

  let item = await db.inventoryItem.upsert({
    where: {
      companyId_sku: {
        companyId: company.id,
        sku
      }
    },
    create: {
      companyId: company.id,
      sku,
      name,
      unit: textValue(payload.unit) || "件",
      inventoryAccountCode: textValue(payload.inventoryAccountCode) || "1140",
      cogsAccountCode: textValue(payload.cogsAccountCode) || "5110"
    },
    update: {
      name,
      unit: textValue(payload.unit) || "件",
      isActive: true
    }
  });
  await lockInventoryItem(company.id, item.id, db);
  item = await db.inventoryItem.findFirst({
    where: {
      id: item.id,
      companyId: company.id
    }
  });

  if (!item) {
    throw new AccountingError("找不到存貨品項", 404);
  }

  const currentQty = decimal4(item.quantityOnHand);
  const currentAvg = decimal4(item.averageCost);
  let signedQuantity = quantity;
  let unitCost = unitCostInput;
  let totalAmount = moneyValue(quantity * unitCost);
  let nextQty = currentQty;
  let nextAvg = currentAvg;
  let journalLines;

  if (transactionType === "PURCHASE") {
    if (unitCost <= 0) throw new AccountingError("進貨單價必須大於零");
    nextQty = decimal4(currentQty + quantity);
    nextAvg = decimal4(
      nextQty === 0 ? 0 : (currentQty * currentAvg + quantity * unitCost) / nextQty
    );
    journalLines = [
      { accountCode: item.inventoryAccountCode, debit: totalAmount, credit: 0 },
      {
        accountCode: textValue(payload.creditAccountCode) || "2110",
        debit: 0,
        credit: totalAmount
      }
    ];
  } else if (transactionType === "ISSUE") {
    if (quantity > currentQty) throw new AccountingError("出庫數量超過庫存");
    unitCost = currentAvg;
    totalAmount = moneyValue(quantity * unitCost);
    signedQuantity = -quantity;
    nextQty = decimal4(currentQty - quantity);
    nextAvg = nextQty === 0 ? 0 : currentAvg;
    journalLines = [
      { accountCode: item.cogsAccountCode, debit: totalAmount, credit: 0 },
      { accountCode: item.inventoryAccountCode, debit: 0, credit: totalAmount }
    ];
  } else {
    const adjustmentDirection = textValue(payload.adjustmentDirection) || "INCREASE";
    signedQuantity = adjustmentDirection === "DECREASE" ? -quantity : quantity;
    if (signedQuantity < 0 && quantity > currentQty) {
      throw new AccountingError("調減數量超過庫存");
    }
    unitCost = unitCost > 0 ? unitCost : currentAvg;
    totalAmount = moneyValue(quantity * unitCost);
    nextQty = decimal4(currentQty + signedQuantity);
    nextAvg = nextQty === 0 ? 0 : currentAvg || unitCost;
    journalLines =
      signedQuantity >= 0
        ? [
            { accountCode: item.inventoryAccountCode, debit: totalAmount, credit: 0 },
            { accountCode: "4130", debit: 0, credit: totalAmount }
          ]
        : [
            { accountCode: "6110", debit: totalAmount, credit: 0 },
            { accountCode: item.inventoryAccountCode, debit: 0, credit: totalAmount }
          ];
  }

  const journalEntry = await createBalancedJournalEntry({
    company,
    period,
    db,
    payload: {
      entryPrefix: "INV",
      entryDate: payload.transactionDate,
      description: `${transactionType} ${sku} ${name}`,
      status: "POSTED",
      sourceType: "inventory",
      sourceId: item.id,
      lines: journalLines
    }
  });

  const [updatedItem, transaction] = await Promise.all([
    db.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantityOnHand: nextQty,
        averageCost: nextAvg
      }
    }),
    db.inventoryTransaction.create({
      data: {
        companyId: company.id,
        periodId: period.id,
        itemId: item.id,
        journalEntryId: journalEntry.id,
        transactionDate: dateValue(payload.transactionDate),
        transactionType,
        quantity: signedQuantity,
        unitCost,
        totalAmount,
        note: textValue(payload.note) || null
      }
    })
  ]);

  return { item: updatedItem, transaction, journalEntry };
}

export async function createBankImportRule({
  company,
  payload,
  db = prisma
}) {
  const name = textValue(payload.name);
  const keyword = textValue(payload.keyword);
  const accountCode = textValue(payload.accountCode);

  if (!name || !keyword || !accountCode) {
    throw new AccountingError("規則名稱、關鍵字與科目代碼必填");
  }

  const account = await db.account.findUnique({
    where: {
      companyId_code: {
        companyId: company.id,
        code: accountCode
      }
    }
  });

  if (!account) throw new AccountingError(`找不到科目：${accountCode}`);

  return db.bankImportRule.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name
      }
    },
    create: {
      companyId: company.id,
      name,
      keyword,
      direction: textValue(payload.direction) || "ANY",
      accountCode
    },
    update: {
      keyword,
      direction: textValue(payload.direction) || "ANY",
      accountCode,
      isActive: true
    }
  });
}

function parseBankCsv(rawCsv) {
  return String(rawCsv || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, description, deposit, withdrawal] = line
        .split(",")
        .map((part) => part.trim());
      return {
        date,
        description,
        depositAmount: moneyValue(deposit),
        withdrawalAmount: moneyValue(withdrawal)
      };
    });
}

function findRule(rules, row) {
  const direction =
    row.depositAmount > row.withdrawalAmount ? "DEPOSIT" : "WITHDRAWAL";
  return rules.find((rule) => {
    const directionMatches = rule.direction === "ANY" || rule.direction === direction;
    return directionMatches && row.description.includes(rule.keyword);
  });
}

export async function importBankCsv({
  company,
  period,
  bankAccount,
  payload,
  db = prisma
}) {
  assertPeriodOpen(period);

  const rows = parseBankCsv(payload.rawCsv);
  if (!rows.length) {
    throw new AccountingError("請貼上銀行 CSV，格式：日期,摘要,收入,支出");
  }

  const rules = await db.bankImportRule.findMany({
    where: { companyId: company.id, isActive: true }
  });

  const batch = await db.bankImportBatch.create({
    data: {
      companyId: company.id,
      bankAccountId: bankAccount.id,
      periodId: period.id,
      fileName: textValue(payload.fileName) || `bank-import-${Date.now()}.csv`,
      status: "RUNNING",
      rawPreview: rows.slice(0, 5)
    }
  });

  let matchedRows = 0;
  const transactions = [];
  for (const row of rows) {
    if (!row.date || !row.description) {
      throw new AccountingError("銀行 CSV 每列都需要日期與摘要");
    }

    const rule = findRule(rules, row);
    let journalEntry = null;
    const netAmount = moneyValue(row.depositAmount - row.withdrawalAmount);

    if (rule && netAmount !== 0) {
      journalEntry = await createBalancedJournalEntry({
        company,
        period,
        db,
        payload: {
          entryPrefix: "BANK",
          entryDate: row.date,
          description: `銀行匯入 ${row.description}`,
          status: "POSTED",
          sourceType: "bankImport",
          sourceId: batch.id,
          lines:
            netAmount > 0
              ? [
                  { accountCode: "1120", debit: Math.abs(netAmount), credit: 0 },
                  { accountCode: rule.accountCode, debit: 0, credit: Math.abs(netAmount) }
                ]
              : [
                  { accountCode: rule.accountCode, debit: Math.abs(netAmount), credit: 0 },
                  { accountCode: "1120", debit: 0, credit: Math.abs(netAmount) }
                ]
        }
      });
      matchedRows += 1;
    }

    const transaction = await db.bankTransaction.create({
      data: {
        bankAccountId: bankAccount.id,
        importBatchId: batch.id,
        matchedJournalEntryId: journalEntry?.id || null,
        transactionDate: dateValue(row.date),
        description: row.description,
        depositAmount: row.depositAmount,
        withdrawalAmount: row.withdrawalAmount,
        status: journalEntry ? "MATCHED" : "UNMATCHED"
      }
    });
    transactions.push(transaction);
  }

  const balanceIncrement = moneyValue(
    rows.reduce((sum, row) => sum + row.depositAmount - row.withdrawalAmount, 0)
  );

  await db.bankAccount.update({
    where: { id: bankAccount.id },
    data: {
      currentBalance: {
        increment: balanceIncrement
      }
    }
  });

  const updatedBatch = await db.bankImportBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      importedRows: rows.length,
      matchedRows
    }
  });

  return { batch: updatedBatch, transactions };
}

export async function runBatchDiagnostics({
  company,
  period,
  recover = false,
  db = prisma
}) {
  const job = await db.batchJob.create({
    data: {
      companyId: company.id,
      periodId: period.id,
      jobType: recover ? "RECOVERY" : "DIAGNOSTIC",
      status: "RUNNING",
      startedAt: new Date()
    }
  });

  try {
    const trialBalance = await getTrialBalance(company.id, period.id, db);
    const { start, end } = periodDateRange(period);
    const [bankAccount, taxRecord, financialLineCount, failedExports] =
      await Promise.all([
        db.bankAccount.findFirst({ where: { companyId: company.id, isActive: true } }),
        db.taxRecord.findUnique({
          where: {
            companyId_periodId_taxType: {
              companyId: company.id,
              periodId: period.id,
              taxType: "VAT"
            }
          }
        }),
        db.financialStatementLine.count({
          where: {
            companyId: company.id,
            periodId: period.id,
            rawFields: { path: ["generatedBy"], equals: "commercial-accounting" }
          }
        }),
        db.exportFile.count({
          where: { companyId: company.id, periodId: period.id, status: "FAILED" }
        })
      ]);

    const bankTransactions = bankAccount
      ? await db.bankTransaction.findMany({
          where: {
            bankAccountId: bankAccount.id,
            transactionDate: { gte: start, lt: end }
          },
          include: {
            matchedJournalEntry: {
              include: { lines: { include: { account: true } } }
            }
          }
        })
      : [];
    const bankMovement = moneyValue(
      bankTransactions.reduce(
        (sum, row) => sum + Number(row.depositAmount) - Number(row.withdrawalAmount),
        0
      )
    );
    const bookMovement = moneyValue(
      bankTransactions.reduce((sum, row) => {
        if (!row.matchedJournalEntry) return sum;
        return (
          sum +
          row.matchedJournalEntry.lines
            .filter((line) => line.account.code === "1120")
            .reduce((lineSum, line) => lineSum + Number(line.debit) - Number(line.credit), 0)
        );
      }, 0)
    );

    const issues = [
      ...(trialBalance.isBalanced
        ? []
        : [`試算表借貸差額 ${trialBalance.totals.difference.toFixed(2)}`]),
      ...(moneyValue(bankMovement - bookMovement) === 0
        ? []
        : [`銀行匯入與帳簿差額 ${moneyValue(bankMovement - bookMovement).toFixed(2)}`]),
      ...(taxRecord ? [] : ["缺少 401 稅務摘要"]),
      ...(financialLineCount ? [] : ["缺少自動產生財報"]),
      ...(failedExports ? [`有 ${failedExports} 筆匯出失敗`] : [])
    ];

    if (recover) {
      if (!taxRecord || taxRecord.status === "DRAFT") {
        await rebuildTaxSummary({ company, period, db });
        await updateTaxFilingStatus({ company, period, action: "review", db });
      }
      if (!financialLineCount) {
        await generateFinancialStatements({ company, period, db });
      }
      if (failedExports) {
        await db.exportFile.updateMany({
          where: { companyId: company.id, periodId: period.id, status: "FAILED" },
          data: { status: "QUEUED", errorMessage: "已由錯誤復原流程退回待產生" }
        });
      }
    }

    const result = {
      trialBalanceDifference: trialBalance.totals.difference,
      bankDifference: moneyValue(bankMovement - bookMovement),
      taxStatus: taxRecord?.status || "MISSING",
      financialLineCount,
      failedExports,
      issues
    };

    const updated = await db.batchJob.update({
      where: { id: job.id },
      data: {
        status: recover ? "RECOVERED" : issues.length ? "FAILED" : "COMPLETED",
        message: issues.length ? issues.join("；") : "批次檢查通過",
        rawResult: result,
        finishedAt: new Date()
      }
    });

    return { job: updated, result };
  } catch (error) {
    const updated = await db.batchJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        message: error.message,
        finishedAt: new Date()
      }
    });
    throw new AccountingError(updated.message || "批次工作失敗", 500);
  }
}
