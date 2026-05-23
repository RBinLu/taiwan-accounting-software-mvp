import { getCurrentSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ ok: false, message: "未登入" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      email: session.user.email,
      name: session.user.name,
      mustChangePassword: session.user.mustChangePassword,
      companies: session.user.companies
    }
  });
}
