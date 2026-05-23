import { textValue } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const approvalId = textValue(payload.approvalId);
    const action = textValue(payload.action);
    const { company, user } = await requireApiAccess(request, {
      roles: rolesForApi("approval:action")
    });

    if (!approvalId || !["approve", "reject"].includes(action)) {
      return jsonError("審核操作參數不完整");
    }

    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, companyId: company.id }
    });

    if (!approval) {
      return jsonError("找不到審核單", 404);
    }

    if (approval.status !== "PENDING") {
      return jsonError("只有待審核項目可以操作");
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED"
      }
    });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "approvalRequest",
      entityId: updated.id,
      action: action === "approve" ? "APPROVE" : "REJECT",
      beforeValue: approval,
      afterValue: updated,
      request
    });
    return NextResponse.json({ ok: true, approval: updated });
  } catch (error) {
    return handleRouteError(error, "審核操作失敗");
  }
}
