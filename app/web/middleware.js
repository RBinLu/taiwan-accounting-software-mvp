import { NextResponse } from "next/server";

const SESSION_COOKIE = "acctly_session";

const publicPaths = [
  "/login",
  "/api/auth/login",
  "/forgot-password",
  "/api/auth/password-reset-request",
  "/api/health"
];

function isPublicPath(pathname) {
  return (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/flowcharts/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, message: "請先登入" }, { status: 401 });
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
