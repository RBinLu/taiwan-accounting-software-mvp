import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rolesForApi } from "@/lib/permissions";
import {
  assertSubmittedCsrfToken,
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
import { publicRedirectUrl } from "@/lib/request-url";
import { ensureStorageDirs } from "@/lib/storage";

export async function GET(request) {
  try {
    const { company } = await requireApiAccess(request, {
      roles: rolesForApi("documents:read"),
      csrf: false
    });
    const documents = await prisma.document.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        company: true,
        period: true,
        ocrJobs: {
          orderBy: { queuedAt: "desc" },
          take: 1
        },
        reviewTasks: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    return NextResponse.json({ documents });
  } catch (error) {
    return handleRouteError(error, "文件讀取失敗");
  }
}

export async function POST(request) {
  try {
    await ensureStorageDirs();

    const { company, period, user, session } = await requireApiAccess(request, {
      roles: rolesForApi("documents:upload"),
      rateLimit: { limit: 20, windowMs: 10 * 60_000 },
      csrf: false
    });
    const formData = await request.formData();
    assertSubmittedCsrfToken(formData.get("csrfToken"), session);
    const file = formData.get("file");
    const documentType = String(formData.get("documentType") || "OTHER");

    validateUploadFile(file);

    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const storedName = safeUploadName(file.name, hash);
    const absolutePath = assertInsideWorkspace(
      path.join(uploadsDir, storedName),
      "upload path"
    );
    const relativePath = path.relative(workspaceRoot, absolutePath);

    await fs.writeFile(absolutePath, bytes);

    const document = await prisma.document.create({
      data: {
        companyId: company.id,
        periodId: period.id,
        documentType,
        originalName: file.name || storedName,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: bytes.length,
        storagePath: relativePath,
        fileHash: hash,
        rawMetadata: {
          source: "manual-upload",
          currentPipelineStep: "queued-for-ocr"
        },
        ocrJobs: {
          create: {
            status: "QUEUED",
            engine: "pending-provider"
          }
        },
        reviewTasks: {
          create: {
            title: `複核 ${file.name || storedName}`,
            status: "OPEN"
          }
        },
        validationRows: {
          create: {
            companyId: company.id,
            periodId: period.id,
            ruleKey: "document_uploaded",
            ruleLabel: "文件已建立",
            status: "WARNING",
            message: "文件已入庫，等待 OCR 與人工複核。"
          }
        }
      },
      include: {
        ocrJobs: true,
        reviewTasks: true
      }
    });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "document",
      entityId: document.id,
      action: "UPLOAD",
      afterValue: document,
      request
    });

    if (request.headers.get("x-acctly-fetch") === "1") {
      return NextResponse.json({ ok: true, document }, { status: 201 });
    }

    return NextResponse.redirect(publicRedirectUrl(request, "/documents?uploaded=1"), 303);
  } catch (error) {
    return handleRouteError(error, "文件上傳失敗");
  }
}
