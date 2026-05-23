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

    const result = await prisma.$transaction((tx) =>
      settleInvoice({
        company,
        period,
        bankAccount,
        payload,
        db: tx
      })
    );

    await Promise.all([
      writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "invoice",
        entityId: result.invoice.id,
        action: "SETTLE",
        afterValue: result.invoice,
        request
      }),
      writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "journal",
        entityId: result.journalEntry.id,
        action: "AUTO_CREATE",
        afterValue: result.journalEntry,
        request
      }),
      writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "bankTransaction",
        entityId: result.bankTransaction.id,
        action: "MATCH",
        afterValue: result.bankTransaction,
        request
      })
    ]);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "收付款失敗");
  }
}
