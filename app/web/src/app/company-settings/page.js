import CompanyProfileForm from "@/components/CompanyProfileForm";
import { AuthError } from "@/lib/auth";
import { authRedirectPath } from "@/lib/auth-redirect";
import { ensureMvpContext } from "@/lib/demo-context";
import { ROLE_SETS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const suggestionFields = new Set([
  "statement_company_name",
  "statement_tax_id",
  "filing_date",
  "statement_date"
]);

function serializeCompany(company) {
  return {
    id: company.id,
    name: company.name,
    taxId: company.taxId,
    taxRegistrationNumber: company.taxRegistrationNumber,
    representativeName: company.representativeName,
    address: company.address,
    filingType: company.filingType
  };
}

async function getLatestOcrSuggestion(companyId) {
  const rows = await prisma.ocrExtraction.findMany({
    where: {
      document: { companyId },
      fieldKey: { in: Array.from(suggestionFields) }
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { document: true }
  });

  if (!rows.length) return null;

  const latestByKey = new Map();
  for (const row of rows) {
    if (!latestByKey.has(row.fieldKey)) {
      latestByKey.set(row.fieldKey, row);
    }
  }

  const companyName = latestByKey.get("statement_company_name");
  const taxId = latestByKey.get("statement_tax_id");
  const filingDate = latestByKey.get("filing_date");
  const statementDate = latestByKey.get("statement_date");
  const source = companyName || taxId || filingDate || statementDate;

  return {
    companyName: companyName?.normalizedValue || companyName?.rawValue || "",
    taxId: taxId?.normalizedValue || taxId?.rawValue || "",
    filingDate: filingDate?.normalizedValue || filingDate?.rawValue || "",
    statementDate: statementDate?.normalizedValue || statementDate?.rawValue || "",
    documentName: source?.document?.originalName || ""
  };
}

async function getCompanySettingsData() {
  const { company } = await ensureMvpContext({
    roles: ROLE_SETS.ownerAdmin
  });

  const suggestion = await getLatestOcrSuggestion(company.id);
  return {
    company: serializeCompany(company),
    suggestion
  };
}

export default async function CompanySettingsPage() {
  let data;

  try {
    data = await getCompanySettingsData();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(authRedirectPath(error));
    }
    throw error;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Company Settings</div>
          <h1>公司主檔</h1>
          <p className="page-copy">
            管理系統用來掛文件、報表與 OCR 驗證的公司主檔。OCR 讀到的統編或公司名稱和主檔不同時，會在這裡顯示可套用的建議。
          </p>
        </div>
      </header>

      <CompanyProfileForm company={data.company} suggestion={data.suggestion} />
    </>
  );
}
