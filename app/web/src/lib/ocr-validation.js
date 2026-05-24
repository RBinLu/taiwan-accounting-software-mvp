import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "./prisma.js";
import { assertInsideWorkspace, workspaceRoot } from "./project-paths.js";

const execFileAsync = promisify(execFile);
const OCR_PYTHON =
  process.env.ACCOUNTING_OCR_PYTHON ||
  "/Users/rbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const TESSERACT_BIN =
  process.env.ACCOUNTING_TESSERACT_BIN || "/opt/homebrew/bin/tesseract";
const TESSERACT_LANG =
  process.env.ACCOUNTING_TESSERACT_LANG || "chi_tra+eng+snum";
const OCR_STORAGE_DIR = path.join(workspaceRoot, "storage", "ocr");
const STATEMENT_OCR_PAGES = [
  { key: "incomeStatement", pageNumber: 3, label: "損益及稅額計算表" },
  { key: "balanceSheet", pageNumber: 5, label: "資產負債表" }
];
const TEXT_EXTRACTOR_SCRIPT = `
import json
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
pages = []
for index, page in enumerate(reader.pages, 1):
    try:
        text = page.extract_text() or ""
    except Exception:
        text = ""
    image_count = 0
    try:
        resources = page.get("/Resources") or {}
        xobj = resources.get("/XObject")
        if xobj:
            for obj in xobj.get_object().values():
                try:
                    if obj.get_object().get("/Subtype") == "/Image":
                        image_count += 1
                except Exception:
                    pass
    except Exception:
        pass
    pages.append({"pageNumber": index, "text": text, "imageCount": image_count})

print(json.dumps({"pageCount": len(reader.pages), "pages": pages}, ensure_ascii=False))
`;
const IMAGE_PAGE_EXTRACTOR_SCRIPT = `
import json
import sys
from pathlib import Path
from pypdf import PdfReader

pdf_path = sys.argv[1]
out_dir = Path(sys.argv[2])
page_numbers = [int(value) for value in sys.argv[3:]]
out_dir.mkdir(parents=True, exist_ok=True)

reader = PdfReader(pdf_path)
outputs = []

for page_number in page_numbers:
    if page_number < 1 or page_number > len(reader.pages):
        continue

    page = reader.pages[page_number - 1]
    images = list(getattr(page, "images", []) or [])
    if not images:
        continue

    image = max(images, key=lambda item: len(getattr(item, "data", b"") or b""))
    pil_image = image.image
    if pil_image.mode not in ("RGB", "L"):
        pil_image = pil_image.convert("RGB")

    rotated = pil_image.rotate(90, expand=True)
    if rotated.mode not in ("RGB", "L"):
        rotated = rotated.convert("RGB")

    out_path = out_dir / f"page-{page_number}-rot90.png"
    rotated.save(out_path, format="PNG")
    outputs.append({
        "pageNumber": page_number,
        "path": str(out_path),
        "rotation": 90,
        "width": rotated.width,
        "height": rotated.height
    })

print(json.dumps(outputs, ensure_ascii=False))
`;

function normalizeText(text) {
  let value = String(text || "").replace(/\r/g, "\n");

  for (let index = 0; index < 4; index += 1) {
    value = value.replace(/(\d{1,3}(?:,\d{3})+)\1+/g, "$1");
  }

  value = value.replace(/\b0{2}\b(?:\s+\b0{2}\b)+/g, "0");
  value = value.replace(/[ \t]+/g, " ");
  return value;
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function moneyValue(value) {
  const number = numberValue(value);
  return number === null ? null : Math.round(number);
}

function normalizeOcrDigit(value) {
  return String(value || "")
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[，]/g, ",")
    .replace(/[Oo〇]/g, "0")
    .replace(/[Il｜]/g, "1")
    .replace(/[S]/g, "5")
    .replace(/[B]/g, "8")
    .replace(/[昌]/g, "5");
}

function ocrMoneyValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeOcrDigit(value)
    .replace(/[()（）]/g, "")
    .replace(/[^\d,.\-]/g, "");
  return moneyValue(normalized);
}

function extractMoneyCandidates(text) {
  const source = normalizeOcrDigit(text)
    .replace(/([0-9])\s*[,，]\s*([0-9]{3})/g, "$1,$2")
    .replace(/[ \t]+/g, "");
  const matches = source.match(/[(（-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?[)）]?/g) || [];

  return matches
    .map((match) => ocrMoneyValue(match))
    .filter((value) => value !== null && Math.abs(value) >= 10);
}

function rocToGregorian(year) {
  const number = Number(year);
  return Number.isFinite(number) ? number + 1911 : null;
}

function parseVat401(text) {
  const normalized = normalizeText(text);
  const periodMatch = normalized.match(
    /(\d{3})\s*年\s*(\d{2})\s*[－-]\s*(\d{2})\s*月/
  );
  const taxIdMatch = normalized.match(/\n\s*(\d{8})\s*\n\s*([^\n]{2,40})/);
  const receiptMatch = normalized.match(/\b(F\d{8,}[A-Z0-9]*)\b/);
  const salesMatch = normalized.match(
    /([\d,]+)\s*\n([\d,]+)\s*\n0\s*\n0\s*\n0\s*\n([\d,]+)\s*\n([\d,]+)\s*\n([\d,]+)\s*\n0\s*\n0\s*\n0\s*\n([\d,]+)\s*\n0\s*\n0\s*\n0\s*\n0\s*\n([\d,]+)\s*\n元/
  );
  const taxSummaryMatch = normalized.match(
    /49\s*\n([\d,]+)\s*\n([\d,]+)\s*\n([\d,]+)\s*\n([\d,]+)\s*\n([\d,]+)/
  );
  const receiptNo = receiptMatch?.[1] || null;
  const receiptDateMatch = receiptNo
    ? normalized.slice(normalized.indexOf(receiptNo)).match(/(\d{3}年\d{2}月\d{2}日)/)
    : null;
  const filingDateMatch =
    receiptDateMatch || normalized.match(/製表日期：\s*(\d{3}年\d{2}月\d{2}日)/);

  const rocYear = periodMatch?.[1] || null;
  const startMonth = periodMatch?.[2] || null;
  const endMonth = periodMatch?.[3] || null;
  const gregorianYear = rocYear ? rocToGregorian(rocYear) : null;

  return {
    documentKind: "VAT_401",
    taxId: taxIdMatch?.[1] || null,
    companyName: taxIdMatch?.[2]?.trim() || null,
    receiptNo,
    filingDate: filingDateMatch?.[1] || null,
    taxPeriod: periodMatch
      ? {
          rocYear: Number(rocYear),
          gregorianYear,
          startMonth: Number(startMonth),
          endMonth: Number(endMonth),
          label: `${rocYear}.${startMonth}-${endMonth}`,
          systemTaxPeriod: `${gregorianYear}-${endMonth}`
        }
      : null,
    taxableSales: moneyValue(salesMatch?.[3]),
    outputTax: moneyValue(taxSummaryMatch?.[1] || salesMatch?.[6]),
    inputTax: moneyValue(taxSummaryMatch?.[2]),
    priorRetainedTaxCredit: moneyValue(taxSummaryMatch?.[3]),
    deductibleTaxTotal: moneyValue(taxSummaryMatch?.[4]),
    payableTax: moneyValue(taxSummaryMatch?.[5])
  };
}

function parseFinancialStatementImageOnly(text, documentType) {
  return {
    documentKind: documentType,
    note: "影像型 PDF 目前需要繁中 OCR 語言包與報表模板校正後才能可靠抽欄位。"
  };
}

function compactOcrText(text) {
  return normalizeOcrDigit(String(text || ""))
    .replace(/[ \t]+/g, "")
    .replace(/，/g, ",");
}

function ocrLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function compactLine(line) {
  return compactOcrText(line).replace(/\s+/g, "");
}

function isOcrCodeLine(line) {
  const normalized = compactLine(line);
  return /^\d{1,4}$/.test(normalized) && Number(normalized) <= 9999;
}

function findAmountsAfter(compactText, pattern, span = 280) {
  const match = compactText.match(pattern);
  if (!match || match.index === undefined) return [];
  const segment = compactText.slice(match.index, match.index + span);
  return extractMoneyCandidates(segment);
}

function firstAmountAfter(compactText, pattern, span = 280) {
  return findAmountsAfter(compactText, pattern, span)[0] ?? null;
}

function findAmountAfterLine(lines, matcher, span = 10) {
  const startIndex = lines.findIndex((line) => matcher(compactLine(line)));
  if (startIndex < 0) return null;

  for (
    let index = startIndex + 1;
    index <= Math.min(lines.length - 1, startIndex + span);
    index += 1
  ) {
    if (isOcrCodeLine(lines[index])) continue;
    const [amount] = extractMoneyCandidates(lines[index]);
    if (amount !== undefined) return amount;
  }

  return null;
}

function findAmountAfterCode(lines, code, span = 8) {
  return findAmountAfterLine(lines, (line) => line === code, span);
}

function findTaxId(text) {
  const matches = compactOcrText(text).match(/\b\d{8}\b/g) || [];
  return matches.find((value) => value !== "30764191") || matches[0] || null;
}

function findCompanyName(text) {
  const compact = compactOcrText(text);
  const match = compact.match(/營利事業名稱[:：]?([^\n]{2,40})/);
  return match?.[1]?.replace(/[，,。].*$/, "") || null;
}

function findFilingDate(text) {
  return (
    compactOcrText(text)
      .replace(/\s+/g, "")
      .match(/申報日期[:：]?(\d{3}年\d{2}月\d{2}日)/)?.[1] || null
  );
}

function findStatementDate(text) {
  return compactOcrText(text).replace(/\s+/g, "").match(/(\d{3}年\d{1,2}月\d{1,2}日)/)?.[1] || null;
}

function parseIncomeStatementText(text) {
  const compact = compactOcrText(text);
  const annualIncomeAmounts = findAmountsAfter(compact, /全年所得額/, 220);
  const revenue =
    firstAmountAfter(compact, /本年度結算申報.{0,30}收入總額/, 120) ||
    firstAmountAfter(compact, /營業收入總額/, 140);
  const grossProfit = firstAmountAfter(compact, /營業毛利/, 100);
  const operatingExpenses = firstAmountAfter(compact, /營業費用及損失總額/, 120);
  const operatingIncome = firstAmountAfter(compact, /營業淨利/, 100);
  const taxableIncome =
    firstAmountAfter(compact, /59如|59[-－]/, 260) ||
    annualIncomeAmounts[1] ||
    annualIncomeAmounts[0] ||
    null;

  return {
    statementDate: findStatementDate(text),
    companyName: findCompanyName(text),
    taxId: findTaxId(text),
    filingDate: findFilingDate(text),
    revenue,
    costOfRevenue:
      revenue !== null && grossProfit !== null ? Math.round(revenue - grossProfit) : null,
    grossProfit,
    operatingExpenses,
    operatingIncome,
    annualIncomeBook: annualIncomeAmounts[0] || null,
    annualIncomeAdjusted: annualIncomeAmounts[1] || annualIncomeAmounts[0] || null,
    taxableIncome
  };
}

function parseBalanceSheetText(text) {
  const lines = ocrLines(text);
  const cash = findAmountAfterLine(lines, (line) => line === "現金" || line.endsWith("現金"));
  const bankDeposits = findAmountAfterLine(lines, (line) => line.includes("銀行存款"));
  const totalAssetsFromLabel = findAmountAfterLine(
    lines,
    (line) => line === "資產總額" || line === "產總額"
  );
  const currentLiabilitiesCandidate = findAmountAfterLine(lines, (line) => line.includes("流動負債"));
  const otherPayables = findAmountAfterLine(lines, (line) => line.includes("其他應付款"));
  const totalLiabilities = findAmountAfterLine(lines, (line) => line === "負債總額");
  const currentLiabilities = totalLiabilities || currentLiabilitiesCandidate;
  const capitalStock =
    findAmountAfterLine(lines, (line) => line.includes("資本") || line.includes("股本")) ||
    findAmountAfterCode(lines, "3100");
  const retainedEarnings =
    findAmountAfterLine(lines, (line) => line.includes("保留盈餘")) ||
    findAmountAfterCode(lines, "3400");
  const currentYearIncome = findAmountAfterLine(lines, (line) => line.includes("本期損益"));
  const totalEquity = findAmountAfterLine(lines, (line) => line === "權益總額");
  const totalLiabilitiesAndEquity = findAmountAfterLine(
    lines,
    (line) => line.includes("負債及權益總額")
  );
  const computedCurrentAssets =
    cash !== null && bankDeposits !== null ? Math.round(cash + bankDeposits) : null;

  return {
    statementDate: findStatementDate(text),
    companyName: findCompanyName(text),
    taxId: findTaxId(text),
    filingDate: findFilingDate(text),
    cash,
    bankDeposits,
    currentAssets: totalAssetsFromLabel || computedCurrentAssets,
    totalAssets: totalAssetsFromLabel || computedCurrentAssets,
    currentLiabilities,
    otherPayables,
    totalLiabilities,
    capitalStock,
    retainedEarnings,
    currentYearIncome,
    totalEquity,
    totalLiabilitiesAndEquity
  };
}

function isFinancialStatementDocument(documentType) {
  return ["BALANCE_SHEET", "INCOME_STATEMENT", "CASH_FLOW", "OTHER"].includes(documentType);
}

async function extractStatementPageImages(absolutePath, documentId) {
  const outputDir = assertInsideWorkspace(
    path.join(OCR_STORAGE_DIR, documentId),
    "OCR image output path"
  );
  await fs.mkdir(outputDir, { recursive: true });

  const { stdout } = await execFileAsync(
    OCR_PYTHON,
    [
      "-c",
      IMAGE_PAGE_EXTRACTOR_SCRIPT,
      absolutePath,
      outputDir,
      ...STATEMENT_OCR_PAGES.map((page) => String(page.pageNumber))
    ],
    { maxBuffer: 4 * 1024 * 1024, timeout: 45_000 }
  );

  return JSON.parse(stdout).map((image) => ({
    ...image,
    path: assertInsideWorkspace(image.path, "OCR image path")
  }));
}

async function runTesseract(imagePath) {
  const { stdout } = await execFileAsync(
    TESSERACT_BIN,
    [imagePath, "stdout", "-l", TESSERACT_LANG, "--psm", "11"],
    { maxBuffer: 24 * 1024 * 1024, timeout: 90_000 }
  );
  return normalizeText(stdout);
}

async function parseFinancialStatementWithOcr({ absolutePath, document, meta }) {
  if (!isFinancialStatementDocument(document.documentType) || meta.pageCount < 5) {
    return {
      ...parseFinancialStatementImageOnly(meta.text, document.documentType),
      status: "SKIPPED",
      engine: "pypdf-text-validation"
    };
  }

  try {
    const images = await extractStatementPageImages(absolutePath, document.id);
    const imageByPage = new Map(images.map((image) => [image.pageNumber, image]));
    const incomeImage = imageByPage.get(3);
    const balanceImage = imageByPage.get(5);

    if (!incomeImage || !balanceImage) {
      return {
        documentKind: "ANNUAL_FINANCIAL_STATEMENT",
        status: "SKIPPED",
        engine: "tesseract-chi-tra-validation",
        note: "年度申報書缺少可辨識的第 3 頁或第 5 頁影像，需人工確認頁碼。"
      };
    }

    const [incomeText, balanceText] = await Promise.all([
      runTesseract(incomeImage.path),
      runTesseract(balanceImage.path)
    ]);
    const incomeStatement = parseIncomeStatementText(incomeText);
    const balanceSheet = parseBalanceSheetText(balanceText);

    return {
      documentKind: "ANNUAL_FINANCIAL_STATEMENT",
      status: "COMPLETED",
      engine: "tesseract-chi-tra-validation",
      ocrLanguage: TESSERACT_LANG,
      pages: [
        { ...incomeImage, label: "損益及稅額計算表" },
        { ...balanceImage, label: "資產負債表" }
      ],
      statementDate: balanceSheet.statementDate || incomeStatement.statementDate,
      filingDate: balanceSheet.filingDate || incomeStatement.filingDate,
      taxId: balanceSheet.taxId || incomeStatement.taxId,
      companyName: balanceSheet.companyName || incomeStatement.companyName,
      incomeStatement,
      balanceSheet,
      rawTextSamples: {
        incomeStatement: incomeText.slice(0, 6000),
        balanceSheet: balanceText.slice(0, 6000)
      }
    };
  } catch (error) {
    return {
      documentKind: "ANNUAL_FINANCIAL_STATEMENT",
      status: "SKIPPED",
      engine: "tesseract-chi-tra-validation",
      note: `影像型 PDF OCR 尚未完成：${error.message}`
    };
  }
}

async function extractPdfText(absolutePath) {
  const { stdout } = await execFileAsync(
    OCR_PYTHON,
    ["-c", TEXT_EXTRACTOR_SCRIPT, absolutePath],
    { maxBuffer: 12 * 1024 * 1024, timeout: 30_000 }
  );
  const result = JSON.parse(stdout);
  const text = result.pages.map((page) => page.text || "").join("\n");
  const textChars = text.replace(/\s/g, "").length;
  const imageOnlyPages = result.pages.filter(
    (page) => !(page.text || "").trim() && page.imageCount > 0
  ).length;

  return {
    ...result,
    text,
    textChars,
    imageOnlyPages
  };
}

function extractionRows(documentId, extracted, meta) {
  const rows = [
    {
      documentId,
      fieldKey: "source_text_chars",
      fieldLabel: "可抽取文字數",
      rawValue: String(meta.textChars),
      normalizedValue: String(meta.textChars),
      confidence: 1
    },
    {
      documentId,
      fieldKey: "page_count",
      fieldLabel: "PDF 頁數",
      rawValue: String(meta.pageCount),
      normalizedValue: String(meta.pageCount),
      confidence: 1
    }
  ];

  const labels = {
    taxId: "統一編號",
    companyName: "營業人名稱",
    receiptNo: "收件編號",
    filingDate: "申報日期",
    taxableSales: "401 銷售額",
    outputTax: "401 銷項稅額",
    inputTax: "401 進項稅額",
    priorRetainedTaxCredit: "上期留抵稅額",
    deductibleTaxTotal: "得扣抵進項稅額合計",
    payableTax: "本期應實繳稅額"
  };

  if (extracted.taxPeriod) {
    rows.push({
      documentId,
      fieldKey: "taxPeriod",
      fieldLabel: "所屬年月",
      rawValue: extracted.taxPeriod.label,
      normalizedValue: extracted.taxPeriod.systemTaxPeriod,
      confidence: 1
    });
  }

  for (const [key, label] of Object.entries(labels)) {
    const value = extracted[key];
    if (value === null || value === undefined || value === "") continue;
    rows.push({
      documentId,
      fieldKey: key,
      fieldLabel: label,
      rawValue: String(value),
      normalizedValue: String(value),
      confidence: 0.95
    });
  }

  return rows;
}

function baseExtractionRows(documentId, meta) {
  return [
    {
      documentId,
      fieldKey: "source_text_chars",
      fieldLabel: "可抽取文字數",
      rawValue: String(meta.textChars),
      normalizedValue: String(meta.textChars),
      confidence: 1
    },
    {
      documentId,
      fieldKey: "page_count",
      fieldLabel: "PDF 頁數",
      rawValue: String(meta.pageCount),
      normalizedValue: String(meta.pageCount),
      confidence: 1
    }
  ];
}

function addExtraction(rows, { documentId, fieldKey, fieldLabel, value, confidence, pageNumber }) {
  if (value === null || value === undefined || value === "") return;
  rows.push({
    documentId,
    fieldKey,
    fieldLabel,
    rawValue: String(value),
    normalizedValue: String(value),
    confidence,
    pageNumber
  });
}

function financialExtractionRows(documentId, extracted, meta) {
  const rows = baseExtractionRows(documentId, meta);
  const income = extracted.incomeStatement || {};
  const balance = extracted.balanceSheet || {};

  const sharedFields = [
    ["statement_tax_id", "統一編號", extracted.taxId, 0.9],
    ["statement_company_name", "公司名稱", extracted.companyName, 0.82],
    ["statement_date", "報表日期", extracted.statementDate, 0.9],
    ["filing_date", "申報日期", extracted.filingDate, 0.9]
  ];
  for (const [fieldKey, fieldLabel, value, confidence] of sharedFields) {
    addExtraction(rows, { documentId, fieldKey, fieldLabel, value, confidence });
  }

  const incomeFields = [
    ["income_revenue", "損益表營業收入", income.revenue],
    ["income_cost_of_revenue", "損益表營業成本", income.costOfRevenue],
    ["income_gross_profit", "損益表營業毛利", income.grossProfit],
    ["income_operating_expenses", "損益表營業費用", income.operatingExpenses],
    ["income_operating_income", "損益表營業淨利", income.operatingIncome],
    ["income_annual_income_book", "全年所得額（帳載）", income.annualIncomeBook],
    ["income_annual_income_adjusted", "全年所得額（調整後）", income.annualIncomeAdjusted],
    ["income_taxable_income", "課稅所得額", income.taxableIncome]
  ];
  for (const [fieldKey, fieldLabel, value] of incomeFields) {
    addExtraction(rows, {
      documentId,
      fieldKey,
      fieldLabel,
      value,
      confidence: 0.78,
      pageNumber: 3
    });
  }

  const balanceFields = [
    ["balance_cash", "資產負債表現金", balance.cash],
    ["balance_bank_deposits", "資產負債表銀行存款", balance.bankDeposits],
    ["balance_current_assets", "流動資產", balance.currentAssets],
    ["balance_total_assets", "資產總額", balance.totalAssets],
    ["balance_current_liabilities", "流動負債", balance.currentLiabilities],
    ["balance_other_payables", "其他應付款", balance.otherPayables],
    ["balance_total_liabilities", "負債總額", balance.totalLiabilities],
    ["balance_capital_stock", "資本或股本", balance.capitalStock],
    ["balance_retained_earnings", "保留盈餘", balance.retainedEarnings],
    ["balance_current_year_income", "本期損益（稅後）", balance.currentYearIncome],
    ["balance_total_equity", "權益總額", balance.totalEquity],
    ["balance_total_liabilities_and_equity", "負債及權益總額", balance.totalLiabilitiesAndEquity]
  ];
  for (const [fieldKey, fieldLabel, value] of balanceFields) {
    addExtraction(rows, {
      documentId,
      fieldKey,
      fieldLabel,
      value,
      confidence: 0.82,
      pageNumber: 5
    });
  }

  for (const page of extracted.pages || []) {
    addExtraction(rows, {
      documentId,
      fieldKey: `${page.pageNumber === 3 ? "income" : "balance"}_statement_page`,
      fieldLabel: `${page.label}頁碼`,
      value: page.pageNumber,
      confidence: 1,
      pageNumber: page.pageNumber
    });
  }

  return rows;
}

function validationRow({ companyId, periodId, documentId, ruleKey, ruleLabel, status, message, details }) {
  return {
    companyId,
    periodId,
    documentId,
    ruleKey,
    ruleLabel,
    status,
    message,
    details: details || undefined
  };
}

function compareMoney({ companyId, periodId, documentId, key, label, ocrValue, systemValue }) {
  if (ocrValue === null || ocrValue === undefined) {
    return validationRow({
      companyId,
      periodId,
      documentId,
      ruleKey: `ocr_${key}`,
      ruleLabel: label,
      status: "WARNING",
      message: "OCR 未抽到此欄位。",
      details: { ocrValue, systemValue }
    });
  }

  if (systemValue === null || systemValue === undefined) {
    return validationRow({
      companyId,
      periodId,
      documentId,
      ruleKey: `ocr_${key}`,
      ruleLabel: label,
      status: "WARNING",
      message: `OCR 值為 ${ocrValue.toLocaleString("zh-TW")}，但系統尚無可比對資料。`,
      details: { ocrValue, systemValue }
    });
  }

  const difference = Math.round(Number(systemValue) - Number(ocrValue));
  return validationRow({
    companyId,
    periodId,
    documentId,
    ruleKey: `ocr_${key}`,
    ruleLabel: label,
    status: difference === 0 ? "PASS" : "FAIL",
    message:
      difference === 0
        ? `${label} 與系統一致。`
        : `${label} 差異 ${difference.toLocaleString("zh-TW")}；OCR ${ocrValue.toLocaleString("zh-TW")}，系統 ${Number(systemValue).toLocaleString("zh-TW")}。`,
    details: { ocrValue, systemValue, difference }
  });
}

async function findPeriod(companyId, extractedPeriod, db) {
  if (extractedPeriod?.gregorianYear && extractedPeriod?.endMonth) {
    return db.accountingPeriod.findFirst({
      where: {
        companyId,
        year: extractedPeriod.gregorianYear,
        month: extractedPeriod.endMonth
      }
    });
  }

  return null;
}

async function buildVatValidations({ document, extracted, db }) {
  const matchedPeriod = await findPeriod(document.companyId, extracted.taxPeriod, db);
  const documentPeriod = document.period || null;
  const comparisonPeriod = matchedPeriod || documentPeriod;
  const periodId = comparisonPeriod?.id || document.periodId || null;
  const rows = [];

  rows.push(
    validationRow({
      companyId: document.companyId,
      periodId,
      documentId: document.id,
      ruleKey: "ocr_vat_identity",
      ruleLabel: "401 基本資料",
      status:
        extracted.taxId === document.company.taxId &&
        (!extracted.companyName || extracted.companyName.includes(document.company.name))
          ? "PASS"
          : "WARNING",
      message: `OCR 統編 ${extracted.taxId || "-"}，公司 ${extracted.companyName || "-"}。`,
      details: {
        ocrTaxId: extracted.taxId,
        systemTaxId: document.company.taxId,
        ocrCompanyName: extracted.companyName,
        systemCompanyName: document.company.name
      }
    })
  );

  rows.push(
    validationRow({
      companyId: document.companyId,
      periodId,
      documentId: document.id,
      ruleKey: "ocr_vat_period",
      ruleLabel: "401 所屬年月",
      status: matchedPeriod ? "PASS" : "WARNING",
      message: matchedPeriod
        ? `OCR 期間 ${extracted.taxPeriod?.label || "-"} 已對應系統期別 ${matchedPeriod.taxPeriod}。`
        : `OCR 期間 ${extracted.taxPeriod?.label || "-"} 尚未找到對應系統期別，暫以文件期別 ${documentPeriod?.taxPeriod || "-"} 做後續比對。`,
      details: {
        ocrPeriod: extracted.taxPeriod,
        matchedPeriod: matchedPeriod?.taxPeriod || null,
        documentPeriod: documentPeriod?.taxPeriod || null
      }
    })
  );

  const [vatReturn, taxRecord] = comparisonPeriod
    ? await Promise.all([
        db.vatReturn.findUnique({
          where: {
            companyId_periodId_returnType: {
              companyId: document.companyId,
              periodId: comparisonPeriod.id,
              returnType: "FORM_401"
            }
          }
        }),
        db.taxRecord.findUnique({
          where: {
            companyId_periodId_taxType: {
              companyId: document.companyId,
              periodId: comparisonPeriod.id,
              taxType: "VAT"
            }
          }
        })
      ])
    : [null, null];

  const system = {
    taxableSales: vatReturn?.taxableSales ?? taxRecord?.salesAmount,
    outputTax: vatReturn?.outputTax ?? taxRecord?.outputTax,
    inputTax: vatReturn?.inputTax ?? taxRecord?.inputTax,
    payableTax: vatReturn?.payableTax ?? taxRecord?.payableTax
  };

  rows.push(
    compareMoney({
      companyId: document.companyId,
      periodId,
      documentId: document.id,
      key: "vat_taxable_sales",
      label: "401 銷售額",
      ocrValue: extracted.taxableSales,
      systemValue: system.taxableSales
    }),
    compareMoney({
      companyId: document.companyId,
      periodId,
      documentId: document.id,
      key: "vat_output_tax",
      label: "401 銷項稅額",
      ocrValue: extracted.outputTax,
      systemValue: system.outputTax
    }),
    compareMoney({
      companyId: document.companyId,
      periodId,
      documentId: document.id,
      key: "vat_input_tax",
      label: "401 進項稅額",
      ocrValue: extracted.inputTax,
      systemValue: system.inputTax
    }),
    compareMoney({
      companyId: document.companyId,
      periodId,
      documentId: document.id,
      key: "vat_payable_tax",
      label: "401 應納稅額",
      ocrValue: extracted.payableTax,
      systemValue: system.payableTax
    })
  );

  return rows;
}

async function buildImageOnlyValidations({ document, extracted, meta }) {
  return [
    validationRow({
      companyId: document.companyId,
      periodId: document.periodId,
      documentId: document.id,
      ruleKey: "ocr_image_pdf_ready",
      ruleLabel: "影像型 PDF OCR",
      status: "WARNING",
      message: extracted.note,
      details: {
        pageCount: meta.pageCount,
        imageOnlyPages: meta.imageOnlyPages,
        textChars: meta.textChars,
        required: ["繁中 OCR 語言包", "申報書頁面模板", "人工複核"]
      }
    })
  ];
}

async function buildStatementValidations({ document, extracted }) {
  const balance = extracted.balanceSheet || {};
  const income = extracted.incomeStatement || {};
  const rows = [];

  rows.push(
    validationRow({
      companyId: document.companyId,
      periodId: document.periodId,
      documentId: document.id,
      ruleKey: "ocr_statement_identity",
      ruleLabel: "年度報表基本資料",
      status: extracted.taxId === document.company.taxId ? "PASS" : "WARNING",
      message: `OCR 統編 ${extracted.taxId || "-"}，公司 ${extracted.companyName || "-"}。`,
      details: {
        ocrTaxId: extracted.taxId,
        systemTaxId: document.company.taxId,
        ocrCompanyName: extracted.companyName,
        systemCompanyName: document.company.name,
        filingDate: extracted.filingDate,
        statementDate: extracted.statementDate
      }
    }),
    validationRow({
      companyId: document.companyId,
      periodId: document.periodId,
      documentId: document.id,
      ruleKey: "ocr_statement_template_pages",
      ruleLabel: "年度報表頁面模板",
      status:
        income.revenue !== null &&
        income.revenue !== undefined &&
        balance.totalAssets !== null &&
        balance.totalAssets !== undefined
          ? "PASS"
          : "WARNING",
      message: "已以第 3 頁損益及稅額計算表、第 5 頁資產負債表建立 OCR 驗證底稿。",
      details: {
        pages: extracted.pages,
        incomeFields: income,
        balanceFields: balance
      }
    })
  );

  if (
    balance.totalAssets !== null &&
    balance.totalAssets !== undefined &&
    balance.totalLiabilitiesAndEquity !== null &&
    balance.totalLiabilitiesAndEquity !== undefined
  ) {
    const difference = Math.round(
      Number(balance.totalLiabilitiesAndEquity) - Number(balance.totalAssets)
    );
    rows.push(
      validationRow({
        companyId: document.companyId,
        periodId: document.periodId,
        documentId: document.id,
        ruleKey: "ocr_balance_equation",
        ruleLabel: "資產負債表平衡",
        status: difference === 0 ? "PASS" : "FAIL",
        message:
          difference === 0
            ? `資產總額 ${balance.totalAssets.toLocaleString("zh-TW")} 與負債及權益總額一致。`
            : `資產負債表不平衡，差異 ${difference.toLocaleString("zh-TW")}。`,
        details: {
          totalAssets: balance.totalAssets,
          totalLiabilitiesAndEquity: balance.totalLiabilitiesAndEquity,
          difference
        }
      })
    );
  } else {
    rows.push(
      validationRow({
        companyId: document.companyId,
        periodId: document.periodId,
        documentId: document.id,
        ruleKey: "ocr_balance_equation",
        ruleLabel: "資產負債表平衡",
        status: "WARNING",
        message: "OCR 尚未完整抽到資產總額或負債及權益總額，需人工複核。",
        details: {
          totalAssets: balance.totalAssets,
          totalLiabilitiesAndEquity: balance.totalLiabilitiesAndEquity
        }
      })
    );
  }

  rows.push(
    validationRow({
      companyId: document.companyId,
      periodId: document.periodId,
      documentId: document.id,
      ruleKey: "ocr_statement_system_compare",
      ruleLabel: "系統帳務比對",
      status: "WARNING",
      message: "目前系統尚無完整年度總帳/結帳報表可比對；此 OCR 結果僅作驗證底稿與人工複核索引。",
      details: {
        revenue: income.revenue,
        taxableIncome: income.taxableIncome,
        totalAssets: balance.totalAssets,
        totalLiabilities: balance.totalLiabilities,
        totalEquity: balance.totalEquity
      }
    })
  );

  return rows;
}

export async function runOcrValidation({ jobId, db = prisma }) {
  const job = await db.ocrJob.findUnique({
    where: { id: jobId },
    include: {
      document: {
        include: {
          company: true,
          period: true
        }
      }
    }
  });

  if (!job) {
    const error = new Error("找不到 OCR 任務");
    error.status = 404;
    throw error;
  }

  const document = job.document;
  const absolutePath = assertInsideWorkspace(
    path.join(/* turbopackIgnore: true */ workspaceRoot, document.storagePath),
    "document storage path"
  );
  const startedAt = new Date();

  await db.ocrJob.update({
    where: { id: job.id },
    data: {
      status: "PROCESSING",
      engine: "pypdf-text-validation",
      startedAt,
      errorMessage: null
    }
  });

  try {
    const meta = await extractPdfText(absolutePath);
    const isImageOnly = meta.textChars < 40 && meta.imageOnlyPages > 0;
    let extracted;
    let extractionData;
    let validationData;
    let finalStatus;
    let engine;

    if (document.documentType === "VAT_401" && !isImageOnly) {
      extracted = parseVat401(meta.text);
      extractionData = extractionRows(document.id, extracted, meta);
      validationData = await buildVatValidations({ document, extracted, db });
      finalStatus = "COMPLETED";
      engine = "pypdf-text-validation";
    } else if (isImageOnly) {
      extracted = await parseFinancialStatementWithOcr({ absolutePath, document, meta });
      finalStatus = extracted.status || "SKIPPED";
      engine = extracted.engine || "tesseract-chi-tra-validation";
      extractionData =
        finalStatus === "COMPLETED"
          ? financialExtractionRows(document.id, extracted, meta)
          : extractionRows(document.id, {}, meta);
      validationData =
        finalStatus === "COMPLETED"
          ? await buildStatementValidations({ document, extracted })
          : await buildImageOnlyValidations({ document, extracted, meta });
    } else {
      extracted = parseFinancialStatementImageOnly(meta.text, document.documentType);
      extractionData = extractionRows(document.id, {}, meta);
      validationData = await buildImageOnlyValidations({ document, extracted, meta });
      finalStatus = "SKIPPED";
      engine = "pypdf-text-validation";
    }

    await db.$transaction(async (tx) => {
      await tx.ocrExtraction.deleteMany({ where: { documentId: document.id } });
      await tx.validationResult.deleteMany({
        where: {
          documentId: document.id,
          ruleKey: { startsWith: "ocr_" }
        }
      });

      if (extractionData.length) {
        await tx.ocrExtraction.createMany({ data: extractionData });
      }

      if (validationData.length) {
        await tx.validationResult.createMany({ data: validationData });
      }

      await tx.document.update({
        where: { id: document.id },
        data: {
          ocrStatus: finalStatus,
          reviewStatus: "IN_REVIEW",
          rawMetadata: {
            ...(document.rawMetadata || {}),
            currentPipelineStep: finalStatus === "COMPLETED" ? "validation-ready" : "ocr-template-required",
            validationEngine: engine,
            validationRanAt: new Date().toISOString(),
            extractedKind: extracted.documentKind || document.documentType,
            textChars: meta.textChars,
            imageOnlyPages: meta.imageOnlyPages
          }
        }
      });

      await tx.ocrJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          engine,
          finishedAt: new Date(),
          rawPayload: {
            extracted,
            pageCount: meta.pageCount,
            textChars: meta.textChars,
            imageOnlyPages: meta.imageOnlyPages
          }
        }
      });
    });

    return {
      ok: true,
      status: finalStatus,
      documentId: document.id,
      extracted,
      validationCount: validationData.length,
      extractionCount: extractionData.length
    };
  } catch (error) {
    await db.ocrJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error.message
      }
    });
    await db.document.update({
      where: { id: document.id },
      data: { ocrStatus: "FAILED" }
    });
    throw error;
  }
}
