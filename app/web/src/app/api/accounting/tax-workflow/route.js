import { textValue } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import {
  rebuildTaxSummary,
  updateTaxFilingStatus
} from "@/lib/commercial-accounting";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = textValue(payload.action);
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("tax:workflow")
    });

    let result;
    if (action === "rebuild") {
      result = await prisma.$transaction((tx) =>
        rebuildTaxSummary({ company, period, db: tx })
      );
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "taxRecord",
        entityId: result.taxRecord.id,
        action: "REBUILD",
        afterValue: result.taxRecord,
        request
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (["review", "file"].includes(action)) {
      result = await prisma.$transaction((tx) =>
        updateTaxFilingStatus({ company, period, action, db: tx })
      );
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "taxRecord",
        entityId: result.taxRecord.id,
        action: action === "review" ? "REVIEW" : "FILE",
        afterValue: result.taxRecord,
        request
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return jsonError("未知的稅務操作");
  } catch (error) {
    return handleRouteError(error, "稅務流程操作失敗");
  }
}
