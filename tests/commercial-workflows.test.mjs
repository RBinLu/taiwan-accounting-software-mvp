import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.DATABASE_URL ||= "postgresql://accounting:accounting@127.0.0.1:55432/accounting_dev";
process.env.ACCOUNTING_WORKSPACE_ROOT ||= process.cwd();

let commercialWorkflows;
let prismaModule;

before(async () => {
  commercialWorkflows = await import("../app/web/src/lib/commercial-workflows.js");
  prismaModule = await import("../app/web/src/lib/prisma.js");
});

after(async () => {
  await prismaModule.prisma.$disconnect();
});

describe("createFixedAsset", () => {
  test("updates an existing asset without creating another acquisition journal", async () => {
    const existingAsset = {
      id: "asset-1",
      companyId: "company-1",
      assetNo: "FA-001",
      name: "Old laptop",
      acquisitionCost: 30000,
      salvageValue: 1000,
      usefulLifeMonths: 36,
      status: "ACTIVE"
    };
    let journalCreateCount = 0;
    const db = {
      fixedAsset: {
        async findUnique() {
          return existingAsset;
        },
        async update({ data }) {
          return { ...existingAsset, ...data };
        }
      },
      journalEntry: {
        async create() {
          journalCreateCount += 1;
          throw new Error("journal should not be created for existing assets");
        }
      }
    };

    const result = await commercialWorkflows.createFixedAsset({
      company: { id: "company-1" },
      period: { id: "period-1", isLocked: false },
      payload: {
        assetNo: "FA-001",
        name: "Updated laptop",
        acquisitionDate: "2026-05-23",
        acquisitionCost: 32000,
        salvageValue: 1000,
        usefulLifeMonths: 36
      },
      db
    });

    assert.equal(result.created, false);
    assert.equal(result.journalEntry, null);
    assert.equal(result.asset.name, "Updated laptop");
    assert.equal(journalCreateCount, 0);
  });
});
