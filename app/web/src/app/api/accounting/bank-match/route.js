import {
  matchBankTransaction,
  reconcileBankTransaction,
  textValue,
  unmatchBankTransaction
} from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = textValue(payload.action);
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("bank:match")
    });

    const handlers = {
      match: matchBankTransaction,
      unmatch: unmatchBankTransaction,
      reconcile: reconcileBankTransaction
    };

    const handler = handlers[action];
    if (!handler) {
      return jsonError("未知的銀行對帳操作");
    }

    const auditAction =
      action === "match" ? "MATCH" : action === "unmatch" ? "UNMATCH" : "RECONCILE";
    const transaction = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await handler({
        company,
        period,
        payload,
        db: tx
      });
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "bankTransaction",
        entityId: updatedTransaction.id,
        action: auditAction,
        afterValue: updatedTransaction,
        request,
        db: tx
      });
      return updatedTransaction;
    });

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return handleRouteError(error, "銀行對帳操作失敗");
  }
}
