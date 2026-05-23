import { mvpModules } from "@/lib/mvp-module-config";
import { ROLE_SETS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";
import { NextResponse } from "next/server";

const staticEntries = [
  {
    type: "page",
    title: "總覽",
    subtitle: "Dashboard / Accounting MVP",
    href: "/",
    keywords: ["dashboard", "首頁", "總覽", "mvp"]
  },
  {
    type: "page",
    title: "文件上傳",
    subtitle: "Documents / 上傳憑證與報表",
    href: "/documents",
    keywords: ["文件", "上傳", "憑證", "報表", "documents"]
  },
  {
    type: "page",
    title: "OCR 任務",
    subtitle: "OCR Jobs / 辨識與複核",
    href: "/ocr",
    keywords: ["ocr", "辨識", "複核", "任務"]
  },
  {
    type: "report",
    title: "資產負債表資料",
    subtitle: "Balance Sheet",
    href: "/reports/balance-sheet",
    keywords: ["資產負債表", "balance", "sheet", "財報"]
  },
  {
    type: "report",
    title: "401 報表資料",
    subtitle: "VAT Returns",
    href: "/reports/vat-returns",
    keywords: ["401", "vat", "營業稅", "申報"]
  },
  {
    type: "setting",
    title: "更換密碼",
    subtitle: "Password Settings",
    href: "/change-password",
    keywords: ["密碼", "設定", "password"]
  },
  {
    type: "setting",
    title: "公司主檔",
    subtitle: "Company Profile / 統編與申報資料",
    href: "/company-settings",
    keywords: ["公司", "主檔", "統編", "設定", "company", "profile"]
  },
  {
    type: "setting",
    title: "忘記密碼",
    subtitle: "Account Recovery",
    href: "/forgot-password",
    keywords: ["忘記密碼", "重設密碼", "password", "reset"]
  }
];

const moduleEntries = Object.values(mvpModules).map((module) => ({
  type: "module",
  title: module.title,
  subtitle: `${module.eyebrow} / ${module.description}`,
  href: module.path,
  keywords: [module.title, module.eyebrow, module.description, module.path]
}));

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function includesQuery(entry, query) {
  const haystack = [
    entry.title,
    entry.subtitle,
    entry.href,
    ...(entry.keywords || [])
  ]
    .map(normalize)
    .join(" ");

  return haystack.includes(query);
}

export async function GET(request) {
  try {
    const query = normalize(new URL(request.url).searchParams.get("q"));
    const { company } = await requireApiAccess(request, {
      roles: ROLE_SETS.readAll,
      rateLimit: { limit: 90, windowMs: 60_000 }
    });

    if (!query) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const results = [];

    for (const entry of [...staticEntries, ...moduleEntries]) {
      if (includesQuery(entry, query)) {
        results.push(entry);
      }
    }

    const companyTokens = [
      company.name,
      company.taxId,
      company.taxRegistrationNumber,
      company.filingType,
      company.address
    ]
      .map(normalize)
      .join(" ");

    if (companyTokens.includes(query)) {
      results.push({
        type: "company",
        title: company.name,
        subtitle: `統編 ${company.taxId} / 申報 ${company.filingType}`,
        href: "/company-settings",
        keywords: []
      });
    }

    const documents = await prisma.document.findMany({
      where: {
        companyId: company.id,
        OR: [
          { originalName: { contains: query, mode: "insensitive" } },
          { storagePath: { contains: query, mode: "insensitive" } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { period: true }
    });

    for (const document of documents) {
      results.push({
        type: "document",
        title: document.originalName,
        subtitle: `${document.documentType} / ${document.period?.taxPeriod || "未指定期間"}`,
        href: "/documents",
        keywords: []
      });
    }

    return NextResponse.json({
      ok: true,
      results: results.slice(0, 10)
    });
  } catch (error) {
    return handleRouteError(error, "搜尋失敗");
  }
}
