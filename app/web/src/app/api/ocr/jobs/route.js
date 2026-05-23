import { NextResponse } from "next/server";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";

export async function GET(request) {
  try {
    const { company } = await requireApiAccess(request, {
      roles: rolesForApi("ocr:read"),
      csrf: false
    });
    const jobs = await prisma.ocrJob.findMany({
      where: { document: { companyId: company.id } },
      orderBy: { queuedAt: "desc" },
      take: 100,
      include: {
        document: {
          include: {
            company: true,
            period: true
          }
        }
      }
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    return handleRouteError(error, "OCR 任務讀取失敗");
  }
}
