import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { requestMeta } from "./security.js";

function jsonSafe(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function checksumFor(payload) {
  return crypto.createHash("sha256").update(stableJson(payload)).digest("hex");
}

export async function writeAudit({
  companyId,
  userId,
  entityType,
  entityId,
  action,
  beforeValue,
  afterValue,
  request,
  db = prisma
}) {
  const before = jsonSafe(beforeValue);
  const after = jsonSafe(afterValue);
  const meta = request ? requestMeta(request) : {};

  return db.auditLog.create({
    data: {
      companyId,
      userId,
      entityType,
      entityId,
      action,
      beforeValue: before,
      afterValue: after,
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
      requestId: meta.requestId || null,
      checksum: checksumFor({
        companyId,
        userId,
        entityType,
        entityId,
        action,
        beforeValue: before,
        afterValue: after,
        requestId: meta.requestId || null
      })
    }
  });
}
