import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { rolesForModule } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";

const allowedRoles = new Set([
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "REVIEWER",
  "CLIENT_READONLY"
]);

function badRequest(message) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export async function PATCH(request) {
  try {
    const payload = await request.json();
    const { company, user } = await requireApiAccess(request, {
      roles: rolesForModule("permissions", "write")
    });

    const membershipId = String(payload.membershipId || "");
    const nextRole = String(payload.role || "");
    const nextIsActive =
      typeof payload.isActive === "boolean" ? payload.isActive : null;

    if (!membershipId) {
      return badRequest("缺少使用者權限 ID");
    }

    if (nextRole && !allowedRoles.has(nextRole)) {
      return badRequest("不支援的角色");
    }

    const membership = await prisma.companyUser.findFirst({
      where: {
        id: membershipId,
        companyId: company.id
      },
      include: { user: true }
    });

    if (!membership) {
      return NextResponse.json(
        { ok: false, message: "找不到這筆使用者權限" },
        { status: 404 }
      );
    }

    if (membership.userId === user.id) {
      return badRequest("不能在此停用或調整目前登入者的角色");
    }

    const beforeValue = {
      membership: {
        id: membership.id,
        role: membership.role
      },
      user: {
        id: membership.user.id,
        email: membership.user.email,
        isActive: membership.user.isActive
      }
    };

    const [updatedMembership, updatedUser] = await prisma.$transaction([
      prisma.companyUser.update({
        where: { id: membership.id },
        data: { role: nextRole || membership.role }
      }),
      nextIsActive === null
        ? prisma.user.findUnique({ where: { id: membership.userId } })
        : prisma.user.update({
            where: { id: membership.userId },
            data: {
              isActive: nextIsActive,
              lockedUntil: nextIsActive ? null : membership.user.lockedUntil
            }
          })
    ]);

    const afterValue = {
      membership: {
        id: updatedMembership.id,
        role: updatedMembership.role
      },
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        isActive: updatedUser.isActive
      }
    };

    await writeAudit({
      companyId: company.id,
      userId: user.id,
      entityType: "companyUser",
      entityId: membership.id,
      action: "UPDATE_ACCESS",
      beforeValue,
      afterValue,
      request
    });

    return NextResponse.json({
      ok: true,
      record: {
        membership: updatedMembership,
        user: updatedUser
      }
    });
  } catch (error) {
    return handleRouteError(error, "權限更新失敗");
  }
}
