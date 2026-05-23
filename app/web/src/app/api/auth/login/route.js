import { ensureDemoContext } from "@/lib/demo-context";
import {
  createAuthSession,
  ensureBootstrapAdmin,
  setCsrfCookie,
  setSessionCookie,
  verifyPassword
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicRedirectUrl } from "@/lib/request-url";
import { enforceRateLimit, requestMeta } from "@/lib/security";
import { NextResponse } from "next/server";

function redirectTo(request, path) {
  return NextResponse.redirect(publicRedirectUrl(request, path), 303);
}

export async function POST(request) {
  const meta = requestMeta(request);

  try {
    enforceRateLimit({
      request,
      key: `login:${meta.ipAddress}`,
      limit: 10,
      windowMs: 15 * 60_000,
      message: "登入嘗試太頻繁，請稍後再試"
    });

    const formData = await request.formData();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const nextPath = String(formData.get("next") || "/");
    const { company } = await ensureDemoContext();

    await ensureBootstrapAdmin(company);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { companies: true }
    });

    const hasCompanyAccess = user?.companies.some(
      (membership) => membership.companyId === company.id
    );
    const isLocked = user?.lockedUntil && user.lockedUntil > new Date();
    const isPasswordValid =
      Boolean(user?.passwordHash) && verifyPassword(password, user.passwordHash);

    if (isLocked) {
      await writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "auth",
        entityId: user.email,
        action: "LOGIN_LOCKED",
        afterValue: { lockedUntil: user.lockedUntil },
        request
      });
      return redirectTo(request, "/login?error=locked");
    }

    if (!user || !user.isActive || !hasCompanyAccess || !isPasswordValid) {
      if (user) {
        const failedLoginCount = Number(user.failedLoginCount || 0) + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            lockedUntil:
              failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60_000) : null
          }
        });
      }

      await writeAudit({
        companyId: company.id,
        userId: user?.id || null,
        entityType: "auth",
        entityId: email || "unknown",
        action: "LOGIN_FAILED",
        afterValue: { hasCompanyAccess: Boolean(hasCompanyAccess) },
        request
      });
      return redirectTo(request, "/login?error=1");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null
      }
    });

    const session = await createAuthSession(user.id, meta);
    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "auth",
      entityId: user.id,
      action: "LOGIN_SUCCESS",
      afterValue: { mustChangePassword: user.mustChangePassword },
      request
    });

    const safeNextPath =
      nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
    const response = redirectTo(
      request,
      user.mustChangePassword ? "/change-password" : safeNextPath
    );
    setSessionCookie(response, session.token, session.expiresAt);
    setCsrfCookie(response, session.csrfToken, session.expiresAt);
    return response;
  } catch (error) {
    if (error.status === 429) {
      return redirectTo(request, "/login?error=rate");
    }

    return redirectTo(request, "/login?error=1");
  }
}
