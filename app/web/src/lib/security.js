import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError, CSRF_COOKIE, hashToken } from "./auth.js";
import { AccountingError } from "./accounting-core.js";
import { ensureMvpContext } from "./demo-context.js";
import {
  ACCOUNTING_UPLOAD_POLICY,
  getUploadValidationError
} from "./upload-policy.js";

export { ACCOUNTING_UPLOAD_POLICY };

export class SecurityError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "SecurityError";
    this.status = status;
  }
}

const rateLimitBuckets = new Map();

export function jsonError(message, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export function requestMeta(request) {
  return {
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent") || null,
    requestId:
      request.headers.get("x-request-id") ||
      request.headers.get("x-vercel-id") ||
      crypto.randomUUID()
  };
}

export function enforceRateLimit({
  request,
  key,
  limit = 120,
  windowMs = 60_000,
  message = "操作太頻繁，請稍後再試"
}) {
  if (process.env.ACCOUNTING_DISABLE_RATE_LIMIT === "true") return;

  const now = Date.now();
  const bucketKey = key || `${clientIp(request)}:${request.nextUrl?.pathname || "api"}`;
  const bucket = rateLimitBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    throw new SecurityError(message, 429);
  }

  bucket.count += 1;

  if (rateLimitBuckets.size > 5000) {
    for (const [currentKey, currentBucket] of rateLimitBuckets.entries()) {
      if (currentBucket.resetAt <= now) {
        rateLimitBuckets.delete(currentKey);
      }
    }
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function assertCsrf(request, session = null) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;

  const headerToken = request.headers.get("x-csrf-token") || "";
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value || "";

  if (!headerToken || !cookieToken || !safeEqual(headerToken, cookieToken)) {
    throw new SecurityError("CSRF 驗證失敗，請重新整理後再操作", 403);
  }

  if (session?.csrfTokenHash && hashToken(headerToken) !== session.csrfTokenHash) {
    throw new SecurityError("CSRF token 已失效，請重新登入", 403);
  }
}

export function assertSubmittedCsrfToken(token, session = null) {
  const submittedToken = String(token || "");

  if (!submittedToken) {
    throw new SecurityError("CSRF 驗證失敗，請重新整理後再操作", 403);
  }

  if (session?.csrfTokenHash && hashToken(submittedToken) !== session.csrfTokenHash) {
    throw new SecurityError("CSRF token 已失效，請重新登入", 403);
  }
}

export async function requireApiAccess(
  request,
  { roles = [], rateLimit = {}, csrf = true, allowPasswordChangeRequired = false } = {}
) {
  enforceRateLimit({
    request,
    limit: rateLimit.limit || 120,
    windowMs: rateLimit.windowMs || 60_000,
    key: rateLimit.key
  });

  const context = await ensureMvpContext({
    roles,
    allowPasswordChangeRequired
  });

  if (csrf) {
    assertCsrf(request, context.session);
  }

  return context;
}

export function validateUploadFile(file, policy = ACCOUNTING_UPLOAD_POLICY) {
  const validationError = getUploadValidationError(file, policy);
  if (validationError) {
    throw new SecurityError(validationError.message, validationError.status);
  }
}

export function handleRouteError(error, fallbackMessage = "操作失敗") {
  if (
    error instanceof AuthError ||
    error instanceof SecurityError ||
    error instanceof AccountingError
  ) {
    return jsonError(error.message, error.status);
  }

  console.error(fallbackMessage, error);
  return jsonError(fallbackMessage, 500);
}
