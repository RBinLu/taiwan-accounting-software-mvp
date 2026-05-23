import { clearSessionCookie, getCurrentSession, revokeCurrentSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { publicRedirectUrl } from "@/lib/request-url";
import { assertCsrf, handleRouteError } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const session = await getCurrentSession();
    assertCsrf(request, session);

    if (session) {
      await writeAudit({
        companyId: session.user.companies[0]?.companyId || null,
        userId: session.user.id,
        entityType: "auth",
        entityId: session.user.id,
        action: "LOGOUT",
        request
      });
    }

    await revokeCurrentSession();
    const response = NextResponse.redirect(publicRedirectUrl(request, "/login"), 303);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error, "登出失敗");
  }
}
