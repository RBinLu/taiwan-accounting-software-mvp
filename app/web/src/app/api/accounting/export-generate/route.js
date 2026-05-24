import { textValue } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import {
  buildExportFile,
  createExportFileRecord,
  removeExportFile,
  writeExportFile
} from "@/lib/export-files";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const exportType = textValue(payload.exportType);
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("exports:generate")
    });

    if (!exportType) {
      return jsonError("請選擇匯出類型");
    }

    const preparedExport = await buildExportFile({
      company,
      period,
      payload: { exportType }
    });
    await writeExportFile(preparedExport);

    let exportFile;
    try {
      exportFile = await prisma.$transaction(async (tx) => {
        const generatedExport = await createExportFileRecord({
          company,
          period,
          preparedExport,
          db: tx
        });
        await writeAudit({
          companyId: company.id,
          userId: user.id,
          entityType: "exportFile",
          entityId: generatedExport.id,
          action: "GENERATE",
          afterValue: generatedExport,
          request,
          db: tx
        });
        return generatedExport;
      });
    } catch (error) {
      await removeExportFile(preparedExport);
      throw error;
    }

    return NextResponse.json({ ok: true, exportFile });
  } catch (error) {
    return handleRouteError(error, "匯出產檔失敗");
  }
}
