import { getPeriodCloseStatus } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = String(payload.action || "").trim();
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("period:lock")
    });

    if (!["lock", "unlock"].includes(action)) {
      return jsonError("未知的期別操作");
    }

    if (action === "lock") {
      const closeStatus = await getPeriodCloseStatus(company.id, period.id);

      if (!closeStatus.canLock) {
        return jsonError(
          `不能鎖帳：草稿分錄 ${closeStatus.draftCount} 筆，不平衡分錄 ${closeStatus.unbalancedCount} 筆，試算差額 ${closeStatus.totals.difference.toFixed(2)}，銀行未完成 ${closeStatus.bankOpenCount} 筆，稅務狀態 ${closeStatus.taxReady ? "完成" : "未完成"}，財報狀態 ${closeStatus.financialReady ? "完成" : "未完成"}`
        );
      }

      const lockedPeriod = await prisma.accountingPeriod.update({
        where: { id: period.id },
        data: {
          isLocked: true,
          lockedAt: new Date(),
          lockedByUserId: user.id
        }
      });

      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "accountingPeriod",
        entityId: period.id,
        action: "LOCK",
        beforeValue: period,
        afterValue: lockedPeriod,
        request
      });
      return NextResponse.json({ ok: true, period: lockedPeriod });
    }

    const unlockedPeriod = await prisma.accountingPeriod.update({
      where: { id: period.id },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedByUserId: null
      }
    });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "accountingPeriod",
      entityId: period.id,
      action: "UNLOCK",
      beforeValue: period,
      afterValue: unlockedPeriod,
      request
    });
    return NextResponse.json({ ok: true, period: unlockedPeriod });
  } catch (error) {
    return handleRouteError(error, "期別操作失敗");
  }
}
