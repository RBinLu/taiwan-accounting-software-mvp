import { writeAudit } from "@/lib/audit";
import { generateFinancialStatements } from "@/lib/commercial-accounting";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("financials:generate")
    });
    const result = await prisma.$transaction((tx) =>
      generateFinancialStatements({ company, period, db: tx })
    );

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "financialStatement",
      entityId: period.id,
      action: "GENERATE",
      afterValue: result.summary,
      request
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "財報產生失敗");
  }
}
