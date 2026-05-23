import { ensureDemoContext } from "@/lib/demo-context";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, handleRouteError, requestMeta } from "@/lib/security";
import { NextResponse } from "next/server";

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

    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ ok: true });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "密碼重設請求失敗");
  }
}
