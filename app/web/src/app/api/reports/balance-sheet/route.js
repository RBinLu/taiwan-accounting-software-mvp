import { NextResponse } from "next/server";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";

export async function GET(request) {
  try {
    const { company } = await requireApiAccess(request, {
      roles: rolesForApi("reports:read"),
      csrf: false
    });
    const lines = await prisma.financialStatementLine.findMany({
      where: {
        companyId: company.id,
        statementType: "BALANCE_SHEET"
      },
      orderBy: [{ createdAt: "desc" }, { sortOrder: "asc" }],
      take: 200,
      include: {
        company: true,
        period: true
      }
    });

    return NextResponse.json({ lines });
  } catch (error) {
    return handleRouteError(error, "資產負債表讀取失敗");
  }
}
