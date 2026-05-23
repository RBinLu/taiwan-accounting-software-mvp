import { writeAudit } from "@/lib/audit";
import { reverseJournalEntry } from "@/lib/commercial-workflows";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const { company, period, user } = await requireApiAccess(request, {
      roles: rolesForApi("journal:reversal")
    });

    const result = await prisma.$transaction((tx) =>
      reverseJournalEntry({ company, period, payload, db: tx })
    );

    await Promise.all([
      writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "journalEntry",
        entityId: result.original.id,
        action: "MARK_REVERSED",
        afterValue: result.original,
        request
      }),
      writeAudit({
        companyId: company.id,
        userId: user.id,
        entityType: "journalEntry",
        entityId: result.reversal.id,
        action: "REVERSAL_CREATE",
        afterValue: result.reversal,
        request
      })
    ]);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error, "沖銷失敗");
  }
}
