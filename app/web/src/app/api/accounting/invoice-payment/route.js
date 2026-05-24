import { settleInvoice } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const { company, period, bankAccount, user } = await requireApiAccess(request, {
      roles: rolesForApi("invoice:payment")
    });

    const result = await prisma.$transaction(async (tx) => {
      const paymentResult = await settleInvoice({
        company,
        period,
        bankAccount,
        payload,
        db: tx
      });

      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "invoice",
        entityId: paymentResult.invoice.id,
        action: "SETTLE",
        afterValue: paymentResult.invoice,
        request,
        db: tx
      });
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "journal",
        entityId: paymentResult.journalEntry.id,
        action: "AUTO_CREATE",
        afterValue: paymentResult.journalEntry,
        request,
        db: tx
      });
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "bankTransaction",
        entityId: paymentResult.bankTransaction.id,
        action: "MATCH",
        afterValue: paymentResult.bankTransaction,
        request,
        db: tx
      });
      return paymentResult;
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "收付款失敗");
  }
}
