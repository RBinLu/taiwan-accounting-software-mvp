export const mvpModules = {
  accounts: {
    title: "科目表",
    eyebrow: "Chart of Accounts",
    description: "管理會計科目、科目類型、借貸方向與啟用狀態。",
    path: "/accounts",
    createLabel: "新增科目",
    fields: [
      { name: "code", label: "科目代碼", required: true },
      { name: "name", label: "科目名稱", required: true },
      {
        name: "type",
        label: "科目類型",
        type: "select",
        options: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
        required: true
      },
      {
        name: "normalBalance",
        label: "正常餘額",
        type: "select",
        options: ["DEBIT", "CREDIT"],
        required: true
      }
    ]
  },
  journal: {
    title: "分錄 / 傳票",
    eyebrow: "Journal Entries",
    description: "建立借貸平衡的基本傳票，作為總帳與報表來源。",
    path: "/journal",
    createLabel: "新增分錄",
    fields: [
      { name: "entryDate", label: "分錄日期", type: "date", required: true },
      { name: "entryNo", label: "傳票號碼", placeholder: "系統可自動產生" },
      { name: "description", label: "摘要", required: true },
      { name: "debitAccountCode", label: "借方科目代碼", placeholder: "例如 6110", required: true },
      { name: "creditAccountCode", label: "貸方科目代碼", placeholder: "例如 1120", required: true },
      { name: "amount", label: "金額", type: "number", required: true },
      {
        name: "status",
        label: "建立狀態",
        type: "select",
        options: ["POSTED", "DRAFT"],
        required: true
      }
    ]
  },
  ledger: {
    title: "總帳",
    eyebrow: "General Ledger",
    description: "依分錄列彙整科目、借方、貸方與傳票來源。",
    path: "/ledger",
    createLabel: "",
    fields: []
  },
  "trial-balance": {
    title: "試算表",
    eyebrow: "Trial Balance",
    description: "依已過帳分錄彙總每個科目的借方、貸方與期末借貸餘額。",
    path: "/trial-balance",
    createLabel: "",
    fields: []
  },
  receivables: {
    title: "應收帳款",
    eyebrow: "Accounts Receivable",
    description: "管理客戶請款、收款狀態與應收餘額。",
    path: "/receivables",
    createLabel: "新增應收",
    fields: [
      { name: "documentNo", label: "單據號碼", required: true },
      { name: "counterpartyName", label: "客戶名稱", required: true },
      { name: "documentDate", label: "單據日期", type: "date", required: true },
      { name: "dueDate", label: "到期日", type: "date" },
      { name: "description", label: "摘要" },
      { name: "subtotal", label: "未稅金額", type: "number", required: true },
      { name: "taxAmount", label: "稅額", type: "number" },
      { name: "revenueAccountCode", label: "收入科目", placeholder: "空白預設 4110" }
    ]
  },
  payables: {
    title: "應付帳款",
    eyebrow: "Accounts Payable",
    description: "管理供應商請款、付款狀態與應付餘額。",
    path: "/payables",
    createLabel: "新增應付",
    fields: [
      { name: "documentNo", label: "單據號碼", required: true },
      { name: "counterpartyName", label: "供應商名稱", required: true },
      { name: "documentDate", label: "單據日期", type: "date", required: true },
      { name: "dueDate", label: "到期日", type: "date" },
      { name: "description", label: "摘要" },
      { name: "subtotal", label: "未稅金額", type: "number", required: true },
      { name: "taxAmount", label: "稅額", type: "number" },
      { name: "expenseAccountCode", label: "費用科目", placeholder: "空白預設 6110" }
    ]
  },
  banking: {
    title: "銀行對帳",
    eyebrow: "Bank Reconciliation",
    description: "管理銀行帳戶、銀行交易、交易匹配與對帳狀態。",
    path: "/banking",
    createLabel: "新增銀行交易",
    fields: [
      { name: "transactionDate", label: "交易日期", type: "date", required: true },
      { name: "description", label: "摘要", required: true },
      { name: "depositAmount", label: "收入金額", type: "number" },
      { name: "withdrawalAmount", label: "支出金額", type: "number" }
    ]
  },
  "bank-rules": {
    title: "銀行匯入規則",
    eyebrow: "Bank Import Rules",
    description: "用摘要關鍵字與收支方向自動產生銀行分錄並完成匹配。",
    path: "/bank-rules",
    createLabel: "新增規則",
    fields: [
      { name: "name", label: "規則名稱", required: true },
      { name: "keyword", label: "摘要關鍵字", required: true },
      {
        name: "direction",
        label: "收支方向",
        type: "select",
        options: ["ANY", "DEPOSIT", "WITHDRAWAL"],
        required: true
      },
      { name: "accountCode", label: "對應科目代碼", placeholder: "例如 4110 / 6110", required: true }
    ]
  },
  "bank-imports": {
    title: "銀行匯入",
    eyebrow: "Bank Imports",
    description: "貼上銀行 CSV，依規則建立銀行交易、分錄與匹配狀態。",
    path: "/bank-imports",
    createLabel: "匯入銀行 CSV",
    fields: [
      { name: "fileName", label: "匯入檔名", placeholder: "bank-statement.csv" },
      {
        name: "rawCsv",
        label: "CSV 內容",
        type: "textarea",
        placeholder: "2026-05-08,客戶匯款,12000,0",
        required: true
      }
    ]
  },
  taxes: {
    title: "稅務",
    eyebrow: "Tax",
    description: "管理銷售額、進貨額、銷項稅、進項稅與應納稅額。",
    path: "/taxes",
    createLabel: "新增稅務摘要",
    fields: [
      { name: "taxType", label: "稅別", placeholder: "VAT", required: true },
      { name: "salesAmount", label: "銷售額", type: "number" },
      { name: "purchaseAmount", label: "進貨費用", type: "number" },
      { name: "outputTax", label: "銷項稅額", type: "number" },
      { name: "inputTax", label: "進項稅額", type: "number" }
    ]
  },
  financials: {
    title: "財報",
    eyebrow: "Financial Statements",
    description: "管理標準化財報列資料，支援損益表、資產負債表與現金流量表。",
    path: "/financials",
    createLabel: "新增財報列",
    fields: [
      {
        name: "statementType",
        label: "報表類型",
        type: "select",
        options: ["BALANCE_SHEET", "INCOME_STATEMENT", "CASH_FLOW"],
        required: true
      },
      { name: "lineCode", label: "科目代碼" },
      { name: "lineName", label: "科目名稱", required: true },
      { name: "amountCurrent", label: "本期金額", type: "number" },
      { name: "amountPrior", label: "比較期金額", type: "number" }
    ]
  },
  attachments: {
    title: "附件",
    eyebrow: "Attachments",
    description: "管理憑證、附件與來源單據的關聯。",
    path: "/attachments",
    createLabel: "新增附件紀錄",
    fields: [
      { name: "fileName", label: "檔名", required: true },
      { name: "storagePath", label: "儲存路徑", required: true },
      { name: "linkedEntityType", label: "關聯類型", placeholder: "journal / invoice / tax" },
      { name: "linkedEntityId", label: "關聯 ID" }
    ]
  },
  assets: {
    title: "固定資產",
    eyebrow: "Fixed Assets",
    description: "管理資產取得、耐用月數、累計折舊與每月折舊分錄。",
    path: "/assets",
    createLabel: "新增固定資產",
    fields: [
      { name: "assetNo", label: "資產編號", required: true },
      { name: "name", label: "資產名稱", required: true },
      { name: "acquisitionDate", label: "取得日期", type: "date", required: true },
      { name: "acquisitionCost", label: "取得成本", type: "number", required: true },
      { name: "salvageValue", label: "殘值", type: "number" },
      { name: "usefulLifeMonths", label: "耐用月數", type: "number", required: true },
      { name: "creditAccountCode", label: "貸方科目", placeholder: "空白預設 2110" }
    ]
  },
  inventory: {
    title: "存貨明細帳",
    eyebrow: "Inventory Ledger",
    description: "管理 SKU、進貨、出庫、調整與平均成本分錄。",
    path: "/inventory",
    createLabel: "新增存貨異動",
    fields: [
      { name: "sku", label: "SKU", required: true },
      { name: "name", label: "品名", required: true },
      { name: "unit", label: "單位", placeholder: "件" },
      { name: "transactionDate", label: "異動日期", type: "date", required: true },
      {
        name: "transactionType",
        label: "異動類型",
        type: "select",
        options: ["PURCHASE", "ISSUE", "ADJUSTMENT"],
        required: true
      },
      { name: "quantity", label: "數量", type: "number", required: true },
      { name: "unitCost", label: "單價", type: "number" },
      {
        name: "adjustmentDirection",
        label: "調整方向",
        type: "select",
        options: ["INCREASE", "DECREASE"]
      }
    ]
  },
  permissions: {
    title: "權限",
    eyebrow: "Permissions",
    description: "管理使用者、公司角色與資料存取權限。",
    path: "/permissions",
    createLabel: "新增使用者權限",
    fields: [
      { name: "email", label: "Email", type: "email", required: true },
      { name: "name", label: "姓名", required: true },
      { name: "password", label: "初始密碼", type: "password", placeholder: "必填，首次登入後強制變更", required: true },
      {
        name: "role",
        label: "角色",
        type: "select",
        options: ["OWNER", "ACCOUNTANT", "REVIEWER", "CLIENT_READONLY", "ADMIN"],
        required: true
      }
    ]
  },
  approvals: {
    title: "審核",
    eyebrow: "Approvals",
    description: "管理分錄、報表、付款與匯出的審核流程。",
    path: "/approvals",
    createLabel: "新增審核",
    fields: [
      { name: "title", label: "審核標題", required: true },
      { name: "entityType", label: "審核類型", placeholder: "journal / payment / export", required: true },
      { name: "requesterName", label: "申請人" },
      { name: "approverName", label: "審核人" }
    ]
  },
  exports: {
    title: "匯出",
    eyebrow: "Exports",
    description: "管理財報、稅務、月結與資料交換檔案的匯出工作清單。",
    path: "/exports",
    createLabel: "建立匯出任務",
    fields: [
      { name: "exportType", label: "匯出類型", placeholder: "trial-balance / vat / ledger", required: true },
      {
        name: "status",
        label: "狀態",
        type: "select",
        options: ["QUEUED", "GENERATED", "FAILED"],
        required: true
      }
    ]
  },
  audit: {
    title: "稽核軌跡",
    eyebrow: "Audit Trail",
    description: "追蹤每次新增、修改、審核、匯入、作廢、沖銷與批次操作。",
    path: "/audit",
    createLabel: "",
    fields: []
  },
  batch: {
    title: "批次測試與錯誤復原",
    eyebrow: "Batch Diagnostics",
    description: "檢查借貸、銀行、稅務、財報與匯出狀態，必要時自動復原可重建項目。",
    path: "/batch",
    createLabel: "",
    fields: []
  }
};

export const mvpNavItems = [
  ["科目", "/accounts"],
  ["分錄", "/journal"],
  ["總帳", "/ledger"],
  ["試算", "/trial-balance"],
  ["應收", "/receivables"],
  ["應付", "/payables"],
  ["銀行", "/banking"],
  ["銀行規則", "/bank-rules"],
  ["銀行匯入", "/bank-imports"],
  ["稅務", "/taxes"],
  ["財報", "/financials"],
  ["附件", "/attachments"],
  ["資產", "/assets"],
  ["存貨", "/inventory"],
  ["權限", "/permissions"],
  ["審核", "/approvals"],
  ["匯出", "/exports"],
  ["稽核", "/audit"],
  ["批次", "/batch"]
];
