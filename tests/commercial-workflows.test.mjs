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
  test("updates existing asset metadata without creating another acquisition journal", async () => {
    const existingAsset = {
      id: "asset-1",
      companyId: "company-1",
      assetNo: "FA-001",
      name: "Old laptop",
      acquisitionDate: new Date("2026-05-23T00:00:00+08:00"),
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
        acquisitionCost: 30000,
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

  test("rejects changing an existing asset book basis without a journal adjustment", async () => {
    const existingAsset = {
      id: "asset-1",
      companyId: "company-1",
      assetNo: "FA-001",
      name: "Old laptop",
      acquisitionDate: new Date("2026-05-23T00:00:00+08:00"),
      acquisitionCost: 30000,
      salvageValue: 1000,
      usefulLifeMonths: 36,
      status: "ACTIVE"
    };
    let updateCount = 0;
    const db = {
      fixedAsset: {
        async findUnique() {
          return existingAsset;
        },
        async update() {
          updateCount += 1;
        }
      }
    };

    await assert.rejects(
      commercialWorkflows.createFixedAsset({
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
      }),
      /不能直接修改取得日、成本、殘值或耐用月數/
    );
    assert.equal(updateCount, 0);
  });

  test("handles duplicate asset creation races as safe existing-asset updates", async () => {
    const existingAsset = {
      id: "asset-1",
      companyId: "company-1",
      assetNo: "FA-001",
      name: "Concurrent laptop",
      acquisitionDate: new Date("2026-05-23T00:00:00+08:00"),
      acquisitionCost: 30000,
      salvageValue: 1000,
      usefulLifeMonths: 36,
      status: "ACTIVE"
    };
    let findCount = 0;
    let journalCreateCount = 0;
    const duplicateError = new Error("duplicate");
    duplicateError.code = "P2002";
    const db = {
      fixedAsset: {
        async findUnique() {
          findCount += 1;
          return findCount === 1 ? null : existingAsset;
        },
        async create() {
          throw duplicateError;
        },
        async update({ data }) {
          return { ...existingAsset, ...data };
        }
      },
      journalEntry: {
        async create() {
          journalCreateCount += 1;
          throw new Error("journal should not be created after duplicate race");
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
        acquisitionCost: 30000,
        salvageValue: 1000,
        usefulLifeMonths: 36
      },
      db
    });

    assert.equal(result.created, false);
    assert.equal(result.asset.name, "Updated laptop");
    assert.equal(journalCreateCount, 0);
  });
});
