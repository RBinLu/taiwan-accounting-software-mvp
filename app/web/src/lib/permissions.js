export const ALL_ROLES = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "REVIEWER",
  "CLIENT_READONLY"
];

export const ROLE_SETS = {
  ownerAdmin: ["OWNER", "ADMIN"],
  accountingWrite: ["OWNER", "ADMIN", "ACCOUNTANT"],
  reviewerWrite: ["OWNER", "ADMIN", "REVIEWER"],
  reviewerRead: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER"],
  readAll: ALL_ROLES
};

export const permissionMatrix = {
  modules: {
    accounts: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    journal: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    ledger: { read: ROLE_SETS.readAll, write: [] },
    "trial-balance": { read: ROLE_SETS.readAll, write: [] },
    receivables: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    payables: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    banking: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    "bank-rules": { read: ROLE_SETS.reviewerRead, write: ROLE_SETS.accountingWrite },
    "bank-imports": { read: ROLE_SETS.reviewerRead, write: ROLE_SETS.accountingWrite },
    taxes: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    financials: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    attachments: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    assets: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    inventory: { read: ROLE_SETS.readAll, write: ROLE_SETS.accountingWrite },
    permissions: { read: ROLE_SETS.ownerAdmin, write: ROLE_SETS.ownerAdmin },
    approvals: {
      read: ROLE_SETS.reviewerRead,
      write: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER"]
    },
    "company-settings": { read: ROLE_SETS.ownerAdmin, write: ROLE_SETS.ownerAdmin },
    exports: { read: ROLE_SETS.reviewerRead, write: ROLE_SETS.accountingWrite },
    audit: { read: ["OWNER", "ADMIN", "REVIEWER"], write: [] },
    batch: { read: ROLE_SETS.reviewerRead, write: ROLE_SETS.accountingWrite }
  },
  api: {
    "auth:logout": ROLE_SETS.readAll,
    "auth:change-password": ROLE_SETS.readAll,
    "documents:read": ROLE_SETS.readAll,
    "documents:upload": ROLE_SETS.accountingWrite,
    "attachments:read": ROLE_SETS.readAll,
    "attachments:upload": ROLE_SETS.accountingWrite,
    "approval:action": ROLE_SETS.reviewerWrite,
    "bank:match": ROLE_SETS.accountingWrite,
    "bank:reconciliation": ROLE_SETS.accountingWrite,
    "batch:diagnostics": ROLE_SETS.accountingWrite,
    "exports:generate": ROLE_SETS.accountingWrite,
    "financials:generate": ROLE_SETS.accountingWrite,
    "fixed-assets:depreciate": ROLE_SETS.accountingWrite,
    "invoice:payment": ROLE_SETS.accountingWrite,
    "journal:status": ROLE_SETS.accountingWrite,
    "journal:reversal": ROLE_SETS.accountingWrite,
    "period:lock": ROLE_SETS.accountingWrite,
    "company:update": ROLE_SETS.ownerAdmin,
    "tax:workflow": ROLE_SETS.accountingWrite,
    "reports:read": ROLE_SETS.readAll,
    "ocr:read": ROLE_SETS.readAll,
    "ocr:run": ROLE_SETS.accountingWrite
  }
};

export function rolesForModule(module, action = "write") {
  return permissionMatrix.modules[module]?.[action] || ROLE_SETS.ownerAdmin;
}

export function rolesForApi(key) {
  return permissionMatrix.api[key] || ROLE_SETS.ownerAdmin;
}
