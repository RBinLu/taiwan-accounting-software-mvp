export const ACCOUNTING_UPLOAD_POLICY = {
  maxBytes: 25 * 1024 * 1024,
  allowedExtensions: new Set([
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".heic",
    ".heif",
    ".webp",
    ".csv",
    ".txt",
    ".tsv",
    ".xlsx",
    ".xls"
  ]),
  allowedMimeTypes: new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
    "image/webp",
    "text/csv",
    "text/plain",
    "text/tab-separated-values",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream"
  ])
};

export function getUploadValidationError(file, policy = ACCOUNTING_UPLOAD_POLICY) {
  const name = String(file?.name || "");
  const size = Number(file?.size || 0);
  const mimeType = String(file?.type || "application/octet-stream").toLowerCase();
  const extension = name.match(/(\.[a-zA-Z0-9]{1,12})$/)?.[1]?.toLowerCase() || "";

  if (!file || typeof file.arrayBuffer !== "function") {
    return { message: "請選擇要上傳的檔案", status: 400 };
  }

  if (size <= 0) {
    return { message: "上傳檔案不可為空", status: 400 };
  }

  if (size > policy.maxBytes) {
    return {
      message: `檔案大小不可超過 ${Math.floor(policy.maxBytes / 1024 / 1024)} MB`,
      status: 413
    };
  }

  if (!policy.allowedExtensions.has(extension)) {
    return { message: "不允許的檔案副檔名", status: 415 };
  }

  if (mimeType && !policy.allowedMimeTypes.has(mimeType)) {
    return { message: "不允許的檔案類型", status: 415 };
  }

  return null;
}
