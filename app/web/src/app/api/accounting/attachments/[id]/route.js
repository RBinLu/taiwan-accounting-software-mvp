import fs from "node:fs/promises";
import path from "node:path";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { assertInsideWorkspace, workspaceRoot } from "@/lib/project-paths";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { company } = await requireApiAccess(request, {
      roles: rolesForApi("attachments:read"),
      csrf: false
    });
    const attachment = await prisma.attachment.findFirst({
      where: { id, companyId: company.id }
    });

    if (!attachment) return jsonError("找不到附件", 404);

    const absolutePath = assertInsideWorkspace(
      path.join(/* turbopackIgnore: true */ workspaceRoot, attachment.storagePath),
      "attachment path"
    );
    const bytes = await fs.readFile(absolutePath);

    return new NextResponse(bytes, {
      headers: {
        "content-type": attachment.mimeType || "application/octet-stream",
        "content-disposition": `inline; filename="${encodeURIComponent(attachment.fileName)}"`
      }
    });
  } catch (error) {
    return handleRouteError(error, "附件預覽失敗");
  }
}
