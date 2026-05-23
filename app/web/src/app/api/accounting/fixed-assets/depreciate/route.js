import { writeAudit } from "@/lib/audit";
import { runFixedAssetDepreciation } from "@/lib/commercial-workflows";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("fixed-assets:depreciate")
    });

    const result = await prisma.$transaction((tx) =>
      runFixedAssetDepreciation({ company, period, db: tx })
    );

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "fixedAssetDepreciation",
      entityId: period.id,
      action: "RUN",
      afterValue: { count: result.count },
      request
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "折舊提列失敗");
  }
}
