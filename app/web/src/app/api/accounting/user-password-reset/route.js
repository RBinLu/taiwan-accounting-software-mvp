import crypto from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { rolesForModule } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

function generateTemporaryPassword() {
  return `${crypto.randomBytes(18).toString("base64url")}aA1!`;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const membershipId = String(payload.membershipId || "");
    const { company, user } = await requireApiAccess(request, {
      roles: rolesForModule("permissions", "write")
    });

    if (!membershipId) {
      return jsonError("缺少使用者權限 ID");
    }

    const membership = await prisma.companyUser.findFirst({
      where: {
        id: membershipId,
        companyId: company.id
      },
      include: { user: true }
    });

    if (!membership) {
      return jsonError("找不到這筆使用者權限", 404);
    }

    if (membership.userId === user.id) {
      return jsonError("目前登入者請使用更換密碼功能");
    }

    const temporaryPassword = generateTemporaryPassword();
    const beforeValue = {
      userId: membership.user.id,
      email: membership.user.email,
      mustChangePassword: membership.user.mustChangePassword,
      lockedUntil: membership.user.lockedUntil
    };

    const updatedUser = await prisma.user.update({
      where: { id: membership.userId },
      data: {
        passwordHash: hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        lastPasswordChangedAt: null,
        isActive: true
      }
    });

    await prisma.authSession.updateMany({
      where: {
        userId: membership.userId,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "user",
      entityId: updatedUser.id,
      action: "PASSWORD_RESET",
      beforeValue,
      afterValue: {
        userId: updatedUser.id,
        email: updatedUser.email,
        mustChangePassword: updatedUser.mustChangePassword,
        isActive: updatedUser.isActive
      },
      request
    });

    return NextResponse.json({
      ok: true,
      temporaryPassword,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        mustChangePassword: updatedUser.mustChangePassword
      }
    });
  } catch (error) {
    return handleRouteError(error, "密碼重設失敗");
  }
}
