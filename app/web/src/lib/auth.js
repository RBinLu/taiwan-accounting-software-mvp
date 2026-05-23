import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { assertInsideWorkspace, workspaceRoot } from "./project-paths";

export const SESSION_COOKIE = "acctly_session";
export const CSRF_COOKIE = "acctly_csrf";
export const BOOTSTRAP_ADMIN_EMAIL =
  process.env.ACCOUNTING_BOOTSTRAP_ADMIN_EMAIL ||
  process.env.ACCOUNTING_DEFAULT_ADMIN_EMAIL ||
  "admin@example.local";
export const DEFAULT_ADMIN_EMAIL = BOOTSTRAP_ADMIN_EMAIL;

const SESSION_DAYS = 7;
const PASSWORD_MIN_LENGTH = 12;
const LEGACY_DEFAULT_PASSWORDS = ["admin@2026", "ChangeMe@2026"];
const bootstrapCredentialPath = assertInsideWorkspace(
  path.join(workspaceRoot, "storage", "security", "bootstrap-admin.json"),
  "bootstrap credential path"
);

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOneTimePassword() {
  return `${crypto.randomBytes(18).toString("base64url")}aA1!`;
}

async function readBootstrapCredentialFile() {
  try {
    const content = await fs.readFile(bootstrapCredentialPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeBootstrapCredentialFile(email, oneTimePassword) {
  await fs.mkdir(path.dirname(bootstrapCredentialPath), { recursive: true });
  await fs.writeFile(
    bootstrapCredentialPath,
    JSON.stringify(
      {
        email,
        oneTimePassword,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
        consumedAt: null
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
}

async function getBootstrapPassword(email) {
  if (process.env.ACCOUNTING_BOOTSTRAP_ADMIN_PASSWORD) {
    return process.env.ACCOUNTING_BOOTSTRAP_ADMIN_PASSWORD;
  }

  const existing = await readBootstrapCredentialFile();
  if (
    existing?.email === email &&
    existing.oneTimePassword &&
    !existing.consumedAt
  ) {
    return existing.oneTimePassword;
  }

  const oneTimePassword = generateOneTimePassword();
  await writeBootstrapCredentialFile(email, oneTimePassword);
  return oneTimePassword;
}

export async function markBootstrapCredentialConsumed(email) {
  const existing = await readBootstrapCredentialFile();
  if (!existing || existing.email !== email || existing.consumedAt) return;

  await fs.writeFile(
    bootstrapCredentialPath,
    JSON.stringify(
      { ...existing, oneTimePassword: null, consumedAt: new Date().toISOString() },
      null,
      2
    ),
    { mode: 0o600 }
  );
}

export function validatePasswordStrength(password) {
  const value = String(password || "");
  const checks = [
    value.length >= PASSWORD_MIN_LENGTH,
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
    !LEGACY_DEFAULT_PASSWORDS.includes(value)
  ];

  if (checks.every(Boolean)) return;

  throw new AuthError(
    `密碼至少 ${PASSWORD_MIN_LENGTH} 碼，並包含大小寫字母、數字與符號`,
    400
  );
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash?.startsWith("scrypt:")) return false;
  const [, salt, expectedHex] = storedHash.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

export async function ensureBootstrapAdmin(company, db = prisma) {
  const email = BOOTSTRAP_ADMIN_EMAIL;
  const password = await getBootstrapPassword(email);
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: "系統管理者",
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      isActive: true,
      lastPasswordChangedAt: null
    },
    update: {
      isActive: true
    }
  });

  const usesLegacyDefault =
    user.passwordHash &&
    LEGACY_DEFAULT_PASSWORDS.some((legacyPassword) =>
      verifyPassword(legacyPassword, user.passwordHash)
    );

  if (!user.passwordHash || usesLegacyDefault) {
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        lastPasswordChangedAt: null
      }
    });
  }

  await db.companyUser.upsert({
    where: {
      companyId_userId: {
        companyId: company.id,
        userId: user.id
      }
    },
    create: {
      companyId: company.id,
      userId: user.id,
      role: "OWNER"
    },
    update: {
      role: "OWNER"
    }
  });

  return db.user.findUnique({ where: { id: user.id } });
}

export async function createAuthSession(userId, options = {}, db = prisma) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrfToken),
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
      expiresAt
    }
  });

  return { token, csrfToken, expiresAt };
}

export function setSessionCookie(response, token, expiresAt) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export function setCsrfCookie(response, csrfToken, expiresAt) {
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentSession(db = prisma) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: { companies: true }
      }
    }
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !session.user?.isActive
  ) {
    return null;
  }

  await db.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return session;
}

export async function requireCurrentUser(db = prisma, options = {}) {
  const session = await getCurrentSession(db);
  if (!session) {
    throw new AuthError("請先登入", 401);
  }

  if (session.user.mustChangePassword && !options.allowPasswordChangeRequired) {
    throw new AuthError("請先完成首次密碼變更", 428);
  }

  return session.user;
}

export async function requireCompanyRole(
  companyId,
  allowedRoles,
  db = prisma,
  options = {}
) {
  const session = await getCurrentSession(db);
  if (!session) {
    throw new AuthError("請先登入", 401);
  }

  if (session.user.mustChangePassword && !options.allowPasswordChangeRequired) {
    throw new AuthError("請先完成首次密碼變更", 428);
  }

  const user = session.user;
  const membership = await db.companyUser.findUnique({
    where: {
      companyId_userId: {
        companyId,
        userId: user.id
      }
    }
  });

  if (!membership) {
    throw new AuthError("沒有此公司的存取權限", 403);
  }

  if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
    throw new AuthError("目前角色沒有此操作權限", 403);
  }

  return { user, role: membership.role, session };
}

export async function revokeCurrentSession(db = prisma) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;

  await db.authSession.updateMany({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
}
