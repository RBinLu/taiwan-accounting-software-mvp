import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { textValue } from "@/lib/accounting-core";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  handleRouteError,
  requireApiAccess,
  validateUploadFile
} from "@/lib/security";
import {
  assertInsideWorkspace,
  safeUploadName,
  uploadsDir,
  workspaceRoot
} from "@/lib/project-paths";
import { ensureStorageDirs } from "@/lib/storage";
import { NextResponse } from "next/server";

async function resolveVersion(companyId, payload) {
  const parentAttachmentId = textValue(payload.parentAttachmentId);
  const linkedEntityType = textValue(payload.linkedEntityType);
  const linkedEntityId = textValue(payload.linkedEntityId);
  const fileName = textValue(payload.fileName);

  if (parentAttachmentId) {
    const parent = await prisma.attachment.findFirst({
      where: { id: parentAttachmentId, companyId }
    });
    if (!parent) return { parentAttachmentId: null, version: 1 };
    const rootId = parent.parentAttachmentId || parent.id;
    const latest = await prisma.attachment.findFirst({
      where: {
        companyId,
        OR: [{ id: rootId }, { parentAttachmentId: rootId }]
      },
      orderBy: { version: "desc" }
    });
    return { parentAttachmentId: rootId, version: Number(latest?.version || 1) + 1 };
  }

  if (!linkedEntityType || !linkedEntityId || !fileName) {
    return { parentAttachmentId: null, version: 1 };
  }

  const latest = await prisma.attachment.findFirst({
    where: {
      companyId,
      linkedEntityType,
      linkedEntityId,
      fileName
    },
    orderBy: { version: "desc" }
  });

  if (!latest) return { parentAttachmentId: null, version: 1 };
  return {
    parentAttachmentId: latest.parentAttachmentId || latest.id,
    version: Number(latest.version || 1) + 1
  };
}

export async function POST(request) {
  try {
    await ensureStorageDirs();

    const { company, user } = await requireApiAccess(request, {
      roles: rolesForApi("attachments:upload"),
      rateLimit: { limit: 20, windowMs: 10 * 60_000 }
    });
    const formData = await request.formData();
    const file = formData.get("file");

    validateUploadFile(file);

    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const storedName = safeUploadName(file.name, hash);
    const absolutePath = assertInsideWorkspace(
      path.join(uploadsDir, "attachments", storedName),
      "attachment path"
    );
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, bytes);

    const linkedEntityType = textValue(formData.get("linkedEntityType"));
    const linkedEntityId = textValue(formData.get("linkedEntityId"));
    const fileName = file.name || storedName;
    const { parentAttachmentId, version } = await resolveVersion(company.id, {
      parentAttachmentId: formData.get("parentAttachmentId"),
      linkedEntityType,
      linkedEntityId,
      fileName
    });

    const attachment = await prisma.attachment.create({
      data: {
        companyId: company.id,
        uploadedByUserId: user.id,
        parentAttachmentId,
        linkedEntityType: linkedEntityType || null,
        linkedEntityId: linkedEntityId || null,
        fileName,
        storagePath: path.relative(workspaceRoot, absolutePath),
        previewPath: path.relative(workspaceRoot, absolutePath),
        fileHash: hash,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: bytes.length,
        version
      }
    });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "attachment",
      entityId: attachment.id,
      action: version > 1 ? "VERSION_UPLOAD" : "UPLOAD",
      afterValue: attachment,
      request
    });

    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "附件上傳失敗");
  }
}
