import {
  AccountingError,
  assertPeriodOpen,
  summarizeEntryLines,
  textValue
} from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const entryId = textValue(payload.entryId);
    const action = textValue(payload.action);
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("journal:status")
    });

    if (!entryId || !["post", "void"].includes(action)) {
      return jsonError("分錄狀態操作參數不完整");
    }

    assertPeriodOpen(period);

    const entry = await prisma.journalEntry.findFirst({
      where: {
        id: entryId,
        companyId: company.id,
        periodId: period.id
      },
      include: { lines: true }
    });

    if (!entry) {
      return jsonError("找不到本期分錄", 404);
    }

    if (action === "post") {
      if (entry.status !== "DRAFT") {
        return jsonError("只有草稿分錄可以過帳");
      }

      const summary = summarizeEntryLines(entry.lines);
      if (!summary.isBalanced) {
        throw new AccountingError(
          `分錄借貸不平衡，差額 ${summary.difference.toFixed(2)}`
        );
      }

      const posted = await prisma.journalEntry.update({
        where: { id: entry.id },
        data: { status: "POSTED" }
      });
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "journalEntry",
        entityId: entry.id,
        action: "POST",
        beforeValue: entry,
        afterValue: posted,
        request
      });
      return NextResponse.json({ ok: true, record: posted });
    }

    if (entry.status !== "POSTED") {
      return jsonError("只有已過帳分錄可以作廢");
    }

    const voided = await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { status: "VOID" }
    });
    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "journalEntry",
      entityId: entry.id,
      action: "VOID",
      beforeValue: entry,
      afterValue: voided,
      request
    });
    return NextResponse.json({ ok: true, record: voided });
  } catch (error) {
    return handleRouteError(error, "分錄狀態操作失敗");
  }
}
