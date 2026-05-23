import { textValue } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { runBatchDiagnostics } from "@/lib/commercial-workflows";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = textValue(payload.action) || "run";
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("batch:diagnostics")
    });

    const result = await runBatchDiagnostics({
      company,
      period,
      recover: action === "recover",
      db: prisma
    });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "batchJob",
      entityId: result.job.id,
      action: action === "recover" ? "RECOVER" : "RUN",
      afterValue: result,
      request
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "批次檢查失敗");
  }
}
