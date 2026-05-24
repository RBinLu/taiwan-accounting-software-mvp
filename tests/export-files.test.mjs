import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { after, before, describe, test } from "node:test";

process.env.DATABASE_URL ||= "postgresql://accounting:accounting@127.0.0.1:55432/accounting_dev";
process.env.ACCOUNTING_WORKSPACE_ROOT ||= process.cwd();

let exportFiles;
let prismaModule;
const exportsDir = `${process.env.ACCOUNTING_WORKSPACE_ROOT}/storage/exports`;

before(async () => {
  exportFiles = await import("../app/web/src/lib/export-files.js");
  prismaModule = await import("../app/web/src/lib/prisma.js");
});

after(async () => {
  await prismaModule.prisma.$disconnect();
});

describe("export file helpers", () => {
  test("writes and removes prepared export files inside workspace storage", async () => {
    const db = {
      taxRecord: {
        async findMany() {
          return [
            {
              period: { taxPeriod: "202605" },
              taxType: "VAT",
              salesAmount: 100,
              purchaseAmount: 40,
              outputTax: 5,
              inputTax: 2,
              payableTax: 3,
              status: "DRAFT"
            }
          ];
        }
      }
    };

    const preparedExport = await exportFiles.buildExportFile({
      company: { id: "company-1" },
      period: { id: "period-1", taxPeriod: "202605" },
      payload: { exportType: "taxes" },
      db
    });

    assert.match(preparedExport.relativePath, /^storage\/exports\//);
    await exportFiles.writeExportFile(preparedExport);
    const written = await fs.readFile(preparedExport.absolutePath, "utf8");
    assert.match(written, /VAT/);

    await exportFiles.removeExportFile(preparedExport);
    await assert.rejects(
      fs.readFile(preparedExport.absolutePath, "utf8"),
      /ENOENT/
    );
  });

  test("cleans up generated files when creating the export record fails", async () => {
    const taxPeriod = "209912";
    async function matchingFiles() {
      try {
        const files = await fs.readdir(exportsDir);
        return files.filter((file) => file.startsWith(`${taxPeriod}-taxes-`));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    }

    const db = {
      taxRecord: {
        async findMany() {
          return [
            {
              period: { taxPeriod },
              taxType: "VAT",
              salesAmount: 100,
              purchaseAmount: 40,
              outputTax: 5,
              inputTax: 2,
              payableTax: 3,
              status: "DRAFT"
            }
          ];
        }
      },
      exportFile: {
        async create() {
          throw new Error("database unavailable");
        }
      }
    };

    const beforeFiles = await matchingFiles();
    await assert.rejects(
      exportFiles.generateExportFile({
        company: { id: "company-1" },
        period: { id: "period-1", taxPeriod },
        payload: { exportType: "taxes" },
        db
      }),
      /database unavailable/
    );

    assert.deepEqual(await matchingFiles(), beforeFiles);
  });
});
