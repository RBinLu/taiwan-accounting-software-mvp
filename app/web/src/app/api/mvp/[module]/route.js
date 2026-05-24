import {
  assertPeriodOpen,
  createBalancedJournalEntry,
  createInvoiceWithJournal,
  dateValue,
  moneyValue,
  textValue
} from "@/lib/accounting-core";
import { hashPassword, validatePasswordStrength } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  createBankImportRule,
  createFixedAsset,
  importBankCsv,
  recordInventoryTransaction
} from "@/lib/commercial-workflows";
import { rolesForModule } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

function badRequest(message) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

const periodBoundModules = new Set([
  "journal",
  "receivables",
  "payables",
  "banking",
  "bank-imports",
  "taxes",
  "financials",
  "assets",
  "inventory"
]);

export async function POST(request, { params }) {
  const { module } = await params;

  try {
    const payload = await request.json();
    const { company, period, bankAccount, user } = await requireApiAccess(request, {
      roles: rolesForModule(module, "write")
    });

    if (periodBoundModules.has(module)) {
      assertPeriodOpen(period);
    }

    let record;
    let skipFinalAudit = false;

    switch (module) {
      case "accounts": {
        const code = textValue(payload.code);
        const name = textValue(payload.name);

        if (!code || !name) {
          return badRequest("科目代碼與名稱必填");
        }

        const before = await prisma.account.findUnique({
          where: {
            companyId_code: {
              companyId: company.id,
              code
            }
          }
        });
        record = await prisma.account.upsert({
          where: {
            companyId_code: {
              companyId: company.id,
              code
            }
          },
          create: {
            companyId: company.id,
            code,
            name,
            type: payload.type,
            normalBalance: payload.normalBalance
          },
          update: {
            name,
            type: payload.type,
            normalBalance: payload.normalBalance,
            isActive: true
          }
        });
        await writeAudit({
          companyId: company.id,
          userId: user.id,
          entityType: "account",
          entityId: record.id,
          action: before ? "UPDATE" : "CREATE",
          beforeValue: before,
          afterValue: record,
          request
        });
        skipFinalAudit = true;
        break;
      }
      case "journal": {
        record = await createBalancedJournalEntry({
          company,
          period,
          payload
        });
        break;
      }
      case "receivables":
      case "payables": {
        const kind = module === "receivables" ? "RECEIVABLE" : "PAYABLE";
        const result = await prisma.$transaction(async (tx) => {
          const invoiceResult = await createInvoiceWithJournal({
            company,
            period,
            payload,
            kind,
            db: tx
          });
          await writeAudit({
            companyId: company.id,
            userId: user.id,
            entityType: "journal",
            entityId: invoiceResult.journalEntry.id,
            action: "AUTO_CREATE",
            afterValue: invoiceResult.journalEntry,
            request,
            db: tx
          });
          await writeAudit({
            companyId: company.id,
            userId: user.id,
            entityType: module,
            entityId: invoiceResult.invoice.id,
            action: "CREATE",
            afterValue: invoiceResult.invoice,
            request,
            db: tx
          });
          return invoiceResult;
        });
        record = result.invoice;
        skipFinalAudit = true;
        break;
      }
      case "banking": {
        const depositAmount = moneyValue(payload.depositAmount);
        const withdrawalAmount = moneyValue(payload.withdrawalAmount);

        if (depositAmount <= 0 && withdrawalAmount <= 0) {
          return badRequest("收入或支出至少要填一個正數金額");
        }

        const [transaction] = await prisma.$transaction([
          prisma.bankTransaction.create({
            data: {
              bankAccountId: bankAccount.id,
              transactionDate: dateValue(payload.transactionDate),
              description: textValue(payload.description) || "銀行交易",
              depositAmount,
              withdrawalAmount,
              status: "UNMATCHED"
            }
          }),
          prisma.bankAccount.update({
            where: { id: bankAccount.id },
            data: {
              currentBalance: {
                increment: depositAmount - withdrawalAmount
              }
            }
          })
        ]);
        record = transaction;
        break;
      }
      case "bank-rules": {
        record = await createBankImportRule({
          company,
          payload
        });
        break;
      }
      case "bank-imports": {
        const result = await prisma.$transaction((tx) =>
          importBankCsv({
            company,
            period,
            bankAccount,
            payload,
            db: tx
          })
        );
        record = result.batch;
        break;
      }
      case "taxes": {
        const taxType = textValue(payload.taxType) || "VAT";
        const outputTax = moneyValue(payload.outputTax);
        const inputTax = moneyValue(payload.inputTax);

        record = await prisma.taxRecord.upsert({
          where: {
            companyId_periodId_taxType: {
              companyId: company.id,
              periodId: period.id,
              taxType
            }
          },
          create: {
            companyId: company.id,
            periodId: period.id,
            taxType,
            salesAmount: moneyValue(payload.salesAmount),
            purchaseAmount: moneyValue(payload.purchaseAmount),
            outputTax,
            inputTax,
            payableTax: outputTax - inputTax,
            status: "DRAFT"
          },
          update: {
            salesAmount: moneyValue(payload.salesAmount),
            purchaseAmount: moneyValue(payload.purchaseAmount),
            outputTax,
            inputTax,
            payableTax: outputTax - inputTax,
            status: "DRAFT"
          }
        });
        break;
      }
      case "financials": {
        record = await prisma.financialStatementLine.create({
          data: {
            companyId: company.id,
            periodId: period.id,
            statementType: payload.statementType,
            lineCode: textValue(payload.lineCode) || null,
            lineName: textValue(payload.lineName),
            amountCurrent: moneyValue(payload.amountCurrent),
            amountPrior: moneyValue(payload.amountPrior)
          }
        });
        break;
      }
      case "attachments": {
        const fileName = textValue(payload.fileName);
        const storagePath = textValue(payload.storagePath);

        if (!fileName || !storagePath) {
          return badRequest("檔名與儲存路徑必填");
        }

        record = await prisma.attachment.create({
          data: {
            companyId: company.id,
            fileName,
            storagePath,
            linkedEntityType: textValue(payload.linkedEntityType) || null,
            linkedEntityId: textValue(payload.linkedEntityId) || null
          }
        });
        break;
      }
      case "permissions": {
        const email = textValue(payload.email).toLowerCase();
        const name = textValue(payload.name);

        if (!email || !name) {
          return badRequest("Email 與姓名必填");
        }

        const initialPassword = textValue(payload.password);
        if (!initialPassword) {
          return badRequest("初始密碼必填，首次登入後會強制變更");
        }
        validatePasswordStrength(initialPassword);

        const user = await prisma.user.upsert({
          where: { email },
          create: {
            email,
            name,
            passwordHash: hashPassword(initialPassword),
            mustChangePassword: true,
            isActive: true,
            lastPasswordChangedAt: null
          },
          update: {
            name,
            isActive: true,
            ...(initialPassword
              ? {
                  passwordHash: hashPassword(initialPassword),
                  mustChangePassword: true,
                  lastPasswordChangedAt: null
                }
              : {})
          }
        });

        record = await prisma.companyUser.upsert({
          where: {
            companyId_userId: {
              companyId: company.id,
              userId: user.id
            }
          },
          create: {
            companyId: company.id,
            userId: user.id,
            role: payload.role
          },
          update: {
            role: payload.role
          }
        });
        break;
      }
      case "assets": {
        const result = await prisma.$transaction(async (tx) => {
          const assetResult = await createFixedAsset({
            company,
            period,
            payload,
            db: tx
          });
          if (assetResult.journalEntry) {
            await writeAudit({
              companyId: company.id,
              userId: user.id,
              entityType: "journal",
              entityId: assetResult.journalEntry.id,
              action: "AUTO_CREATE",
              afterValue: assetResult.journalEntry,
              request,
              db: tx
            });
          }
          await writeAudit({
            companyId: company.id,
            userId: user.id,
            entityType: module,
            entityId: assetResult.asset.id,
            action: assetResult.created ? "CREATE" : "UPDATE",
            beforeValue: assetResult.beforeValue,
            afterValue: assetResult.asset,
            request,
            db: tx
          });
          return assetResult;
        });
        record = result.asset;
        skipFinalAudit = true;
        break;
      }
      case "inventory": {
        const result = await prisma.$transaction(async (tx) => {
          const inventoryResult = await recordInventoryTransaction({
            company,
            period,
            payload,
            db: tx
          });
          await writeAudit({
            companyId: company.id,
            userId: user.id,
            entityType: "journal",
            entityId: inventoryResult.journalEntry.id,
            action: "AUTO_CREATE",
            afterValue: inventoryResult.journalEntry,
            request,
            db: tx
          });
          await writeAudit({
            companyId: company.id,
            userId: user.id,
            entityType: module,
            entityId: inventoryResult.transaction.id,
            action: "CREATE",
            afterValue: inventoryResult.transaction,
            request,
            db: tx
          });
          return inventoryResult;
        });
        record = result.transaction;
        skipFinalAudit = true;
        break;
      }
      case "audit":
      case "batch":
        return badRequest("此模組由系統流程自動寫入，不能手動新增");
      case "approvals": {
        record = await prisma.approvalRequest.create({
          data: {
            companyId: company.id,
            title: textValue(payload.title),
            entityType: textValue(payload.entityType),
            requesterName: textValue(payload.requesterName) || null,
            approverName: textValue(payload.approverName) || null,
            status: "PENDING"
          }
        });
        break;
      }
      case "exports": {
        const exportType = textValue(payload.exportType);

        if (!exportType) {
          return badRequest("匯出類型必填");
        }

        record = await prisma.exportFile.create({
          data: {
            companyId: company.id,
            periodId: period.id,
            exportType,
            status: payload.status || "QUEUED",
            storagePath:
              payload.status === "GENERATED"
                ? `storage/exports/${exportType}-${Date.now()}.csv`
                : null
          }
        });
        break;
      }
      case "ledger":
        return badRequest("總帳由已過帳分錄自動產生，請先新增分錄");
      case "trial-balance":
        return badRequest("試算表由已過帳分錄自動產生，請先新增分錄");
      default:
        return NextResponse.json(
          { ok: false, message: "未知模組" },
          { status: 404 }
        );
    }

    if (!skipFinalAudit) {
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: module,
        entityId: record.id,
        action: "CREATE",
        afterValue: record,
        request
      });
    }
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return handleRouteError(error, "新增資料失敗");
  }
}
