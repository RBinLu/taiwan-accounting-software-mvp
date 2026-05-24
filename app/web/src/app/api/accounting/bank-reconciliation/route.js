import { lockBankReconciliation, textValue } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = textValue(payload.action);
    const { company, period, bankAccount, user } = await requireApiAccess(request, {
      roles: rolesForApi("bank:reconciliation")
    });

    if (action !== "lock") {
      return jsonError("未知的銀行對帳操作");
    }

    const result = await prisma.$transaction(async (tx) => {
      const reconciliationResult = await lockBankReconciliation({
        company,
        period,
        bankAccount,
        payload,
        db: tx
      });
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "bankReconciliation",
        entityId: reconciliationResult.reconciliation.id,
        action: "LOCK",
        afterValue: reconciliationResult.reconciliation,
        request,
        db: tx
      });
      return reconciliationResult;
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "銀行對帳鎖定失敗");
  }
}
