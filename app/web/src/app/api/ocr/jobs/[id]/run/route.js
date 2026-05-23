import { writeAudit } from "@/lib/audit";
import { runOcrValidation } from "@/lib/ocr-validation";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const { company, user } = await requireApiAccess(request, {
      roles: rolesForApi("ocr:run"),
      rateLimit: { limit: 20, windowMs: 10 * 60_000 }
    });
    const { id } = await params;
    const job = await prisma.ocrJob.findFirst({
      where: { id, document: { companyId: company.id } },
      select: { id: true, documentId: true }
    });

    if (!job) {
      return NextResponse.json({ ok: false, message: "找不到 OCR 任務" }, { status: 404 });
    }

    const result = await runOcrValidation({ jobId: job.id });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "ocrJob",
      entityId: job.id,
      action: "RUN_VALIDATION",
      afterValue: result,
      request
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "OCR 驗證失敗");
  }
}
