import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

process.env.DATABASE_URL ||= "postgresql://accounting:accounting@127.0.0.1:55432/accounting_dev";
process.env.ACCOUNTING_WORKSPACE_ROOT ||= process.cwd();

let uploadPolicy;

before(async () => {
  uploadPolicy = await import("../app/web/src/lib/upload-policy.js");
});

function uploadFile(name, type, size = 1024) {
  return {
    name,
    type,
    size,
    async arrayBuffer() {
      return new ArrayBuffer(size);
    }
  };
}

describe("validateUploadFile", () => {
  test("allows common invoice image formats from phones and browsers", () => {
    assert.equal(
      uploadPolicy.getUploadValidationError(uploadFile("invoice.jpg", "image/jpg")),
      null
    );
    assert.equal(
      uploadPolicy.getUploadValidationError(uploadFile("invoice.HEIC", "image/heic")),
      null
    );
    assert.equal(
      uploadPolicy.getUploadValidationError(uploadFile("invoice.webp", "image/webp")),
      null
    );
  });

  test("keeps the accounting upload size limit bounded", () => {
    assert.deepEqual(
      uploadPolicy.getUploadValidationError(
        uploadFile("large-invoice.pdf", "application/pdf", 26 * 1024 * 1024)
      ),
      { message: "檔案大小不可超過 25 MB", status: 413 }
    );
  });
});
