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
    const vatReturns = await prisma.vatReturn.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        company: true,
        period: true
      }
    });

    return NextResponse.json({ vatReturns });
  } catch (error) {
    return handleRouteError(error, "401 報表讀取失敗");
  }
}
