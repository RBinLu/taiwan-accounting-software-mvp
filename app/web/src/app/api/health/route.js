import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadsDir, workspaceRoot } from "@/lib/project-paths";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "connected",
      workspaceRoot,
      uploadsDir
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        message: error.message
      },
      { status: 503 }
    );
  }
}
