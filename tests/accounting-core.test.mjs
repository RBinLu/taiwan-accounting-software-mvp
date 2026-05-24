import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, test } from "node:test";

process.env.DATABASE_URL ||= "postgresql://accounting:accounting@127.0.0.1:55432/accounting_dev";
process.env.ACCOUNTING_WORKSPACE_ROOT ||= process.cwd();

let accountingCore;
let prismaModule;
let projectPaths;

before(async () => {
  accountingCore = await import("../app/web/src/lib/accounting-core.js");
  prismaModule = await import("../app/web/src/lib/prisma.js");
  projectPaths = await import("../app/web/src/lib/project-paths.js");
});

after(async () => {
  await prismaModule.prisma.$disconnect();
});

function account(code, overrides = {}) {
  return {
    id: `account-${code}`,
    companyId: "company-1",
    code,
    name: `Account ${code}`,
    type: "ASSET",
    normalBalance: "DEBIT",
    isActive: true,
    ...overrides
  };
}

function mockDb(accounts) {
  let createdJournalEntry = null;
  return {
    get createdJournalEntry() {
      return createdJournalEntry;
    },
    account: {
      async findMany({ where }) {
        return accounts.filter(
          (row) =>
            row.companyId === where.companyId &&
            where.code.in.includes(row.code) &&
            row.isActive === where.isActive
        );
      }
    },
    journalEntry: {
      async create(args) {
        createdJournalEntry = { id: "journal-1", ...args.data };
        return createdJournalEntry;
      }
    }
  };
}

describe("moneyValue", () => {
  test("rounds valid money values to cents", () => {
    assert.equal(accountingCore.moneyValue("10.236"), 10.24);
    assert.equal(accountingCore.moneyValue(""), 0);
  });

  test("rejects invalid money values", () => {
    assert.throws(() => accountingCore.moneyValue("not-a-number"), /金額格式不正確/);
  });
});

describe("resolveBalancedJournalLines", () => {
  test("resolves balanced lines against active company accounts", async () => {
    const db = mockDb([account("1110"), account("2110", { type: "LIABILITY" })]);
    const result = await accountingCore.resolveBalancedJournalLines(
      "company-1",
      {
        description: "payment",
        lines: [
          { accountCode: "1110", debit: 100, credit: 0 },
          { accountCode: "2110", debit: 0, credit: 100 }
        ]
      },
      db
    );

    assert.equal(result.totalDebit, 100);
    assert.equal(result.totalCredit, 100);
    assert.equal(result.lines.length, 2);
  });

  test("rejects unbalanced lines", async () => {
    const db = mockDb([account("1110"), account("2110", { type: "LIABILITY" })]);

    await assert.rejects(
      accountingCore.resolveBalancedJournalLines(
        "company-1",
        {
          lines: [
            { accountCode: "1110", debit: 100, credit: 0 },
            { accountCode: "2110", debit: 0, credit: 99 }
          ]
        },
        db
      ),
      /借貸不平衡/
    );
  });
});

describe("createBalancedJournalEntry", () => {
  test("generates collision-resistant entry numbers when none is provided", async () => {
    const db = mockDb([account("1110"), account("2110", { type: "LIABILITY" })]);
    const entry = await accountingCore.createBalancedJournalEntry({
      company: { id: "company-1" },
      period: { id: "period-1", isLocked: false },
      payload: {
        entryPrefix: "PAY",
        entryDate: "2026-05-23",
        description: "payment",
        amount: 100,
        debitAccountCode: "1110",
        creditAccountCode: "2110"
      },
      db
    });

    assert.match(entry.entryNo, /^PAY-[A-Z0-9]+-[A-F0-9]{6}$/);
    assert.equal(entry.status, "POSTED");
    assert.equal(entry.lines.create.length, 2);
  });
});

describe("assertInsideWorkspace", () => {
  test("rejects resolved path traversal outside the workspace", () => {
    assert.throws(
      () =>
        projectPaths.assertInsideWorkspace(
          path.join(projectPaths.workspaceRoot, "..", "outside.csv"),
          "export path"
        ),
      /must stay inside the project folder/
    );
  });
});
