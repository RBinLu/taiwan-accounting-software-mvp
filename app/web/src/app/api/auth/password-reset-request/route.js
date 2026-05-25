import { ensureDemoContext } from "@/lib/demo-context";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicRedirectUrl } from "@/lib/request-url";
import { enforceRateLimit, handleRouteError, requestMeta } from "@/lib/security";
import { NextResponse } from "next/server";

function isJsonRequest(request) {
  return request.headers.get("content-type")?.includes("application/json");
}

async function readPayload(request) {
  if (isJsonRequest(request)) {
    return request.json();
  }

  return Object.fromEntries(await request.formData());
}

export async function POST(request) {
  try {
    const meta = requestMeta(request);
    enforceRateLimit({
      request,
      key: `password-reset-request:${meta.ipAddress}`,
      limit: 6,
      windowMs: 15 * 60_000,
      message: "重設請求太頻繁，請稍後再試"
    });

    const payload = await readPayload(request);
    const email = String(payload.email || "").trim().toLowerCase();

    if (!email) {
      return isJsonRequest(request) || request.headers.get("x-acctly-fetch") === "1"
        ? NextResponse.json({ ok: true })
        : NextResponse.redirect(publicRedirectUrl(request, "/forgot-password?requested=1"), 303);
    }

    const { company } = await ensureDemoContext();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { companies: true }
    });
    const hasCompanyAccess = user?.companies.some(
      (membership) => membership.companyId === company.id
    );

    if (user && hasCompanyAccess) {
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "user",
        entityId: user.id,
        action: "PASSWORD_RESET_REQUEST",
        afterValue: { email: user.email },
        request
      });
    }

    return isJsonRequest(request) || request.headers.get("x-acctly-fetch") === "1"
      ? NextResponse.json({ ok: true })
      : NextResponse.redirect(publicRedirectUrl(request, "/forgot-password?requested=1"), 303);
  } catch (error) {
    return handleRouteError(error, "密碼重設請求失敗");
  }
}
