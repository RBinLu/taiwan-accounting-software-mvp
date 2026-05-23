import {
  AuthError,
  getCurrentSession,
  hashPassword,
  markBootstrapCredentialConsumed,
  validatePasswordStrength,
  verifyPassword
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  assertCsrf,
  enforceRateLimit,
  handleRouteError,
  requestMeta
} from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const session = await getCurrentSession();

    if (!session) {
      throw new AuthError("請先登入", 401);
    }

    enforceRateLimit({
      request,
      key: `change-password:${session.user.id}:${requestMeta(request).ipAddress}`,
      limit: 8,
      windowMs: 15 * 60_000
    });
    assertCsrf(request, session);

    const payload = await request.json();
    const currentPassword = String(payload.currentPassword || "");
    const newPassword = String(payload.newPassword || "");
    const confirmPassword = String(payload.confirmPassword || "");

    if (!verifyPassword(currentPassword, session.user.passwordHash)) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          failedLoginCount: { increment: 1 }
        }
      });
      throw new AuthError("目前密碼不正確", 400);
    }

    if (newPassword !== confirmPassword) {
      throw new AuthError("新密碼與確認密碼不一致", 400);
    }

    if (verifyPassword(newPassword, session.user.passwordHash)) {
      throw new AuthError("新密碼不可與目前密碼相同", 400);
    }

    validatePasswordStrength(newPassword);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        lastPasswordChangedAt: new Date()
      }
    });

    await prisma.authSession.updateMany({
      where: {
        userId: session.user.id,
        id: { not: session.id },
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    await markBootstrapCredentialConsumed(updatedUser.email);
    await writeAudit({
      companyId: session.user.companies[0]?.companyId || null,
      userId: session.user.id,
      entityType: "user",
      entityId: session.user.id,
      action: "PASSWORD_CHANGE",
      beforeValue: { mustChangePassword: session.user.mustChangePassword },
      afterValue: { mustChangePassword: false },
      request
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error, "密碼更新失敗");
  }
}
