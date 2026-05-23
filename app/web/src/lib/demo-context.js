import { prisma } from "./prisma";
import { ensureBootstrapAdmin, requireCompanyRole } from "./auth";

const DEFAULT_COMPANY_PROFILE = {
  taxId: process.env.ACCOUNTING_DEFAULT_COMPANY_TAX_ID || "00000000",
  taxRegistrationNumber:
    process.env.ACCOUNTING_DEFAULT_COMPANY_TAX_REGISTRATION_NUMBER || "00000000",
  name: process.env.ACCOUNTING_DEFAULT_COMPANY_NAME || "範例公司",
  representativeName:
    process.env.ACCOUNTING_DEFAULT_COMPANY_REPRESENTATIVE || "測試負責人",
  address: process.env.ACCOUNTING_DEFAULT_COMPANY_ADDRESS || "台北市信義區範例路 1 號",
  filingType: process.env.ACCOUNTING_DEFAULT_COMPANY_FILING_TYPE || "401"
};

async function upsertOrRead(model, upsertArgs, readArgs) {
  try {
    return await model.upsert(upsertArgs);
  } catch (error) {
    if (error.code === "P2002") {
      return model.findUnique(readArgs);
    }

    throw error;
  }
}

export async function ensureDemoContext() {
  const legacyCompany = await prisma.company.findUnique({
    where: { taxId: "00000000" }
  });

  if (legacyCompany && DEFAULT_COMPANY_PROFILE.taxId !== "00000000") {
    const duplicate = await prisma.company.findUnique({
      where: { taxId: DEFAULT_COMPANY_PROFILE.taxId }
    });

    if (!duplicate || duplicate.id === legacyCompany.id) {
      await prisma.company.update({
        where: { id: legacyCompany.id },
        data: DEFAULT_COMPANY_PROFILE
      });
    }
  }

  const company = await upsertOrRead(
    prisma.company,
    {
      where: { taxId: DEFAULT_COMPANY_PROFILE.taxId },
      create: DEFAULT_COMPANY_PROFILE,
      update: {}
    },
    { where: { taxId: DEFAULT_COMPANY_PROFILE.taxId } }
  );

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const period = await upsertOrRead(
    prisma.accountingPeriod,
    {
      where: {
        companyId_year_month: {
          companyId: company.id,
          year,
          month
        }
      },
      create: {
        companyId: company.id,
        year,
        month,
        taxPeriod: `${year}-${String(month).padStart(2, "0")}`
      },
      update: {}
    },
    {
      where: {
        companyId_year_month: {
          companyId: company.id,
          year,
          month
        }
      }
    }
  );

  return { company, period };
}

export async function ensureMvpContext(options = {}) {
  const {
    requireAuth = true,
    roles = [],
    allowPasswordChangeRequired = false
  } = options;
  const { company, period } = await ensureDemoContext();

  const accountSeeds = [
    ["1110", "現金", "ASSET", "DEBIT"],
    ["1120", "銀行存款", "ASSET", "DEBIT"],
    ["1130", "應收帳款", "ASSET", "DEBIT"],
    ["1140", "存貨", "ASSET", "DEBIT"],
    ["1150", "預付費用", "ASSET", "DEBIT"],
    ["1210", "進項稅額", "ASSET", "DEBIT"],
    ["1220", "固定資產", "ASSET", "DEBIT"],
    ["1230", "累計折舊", "ASSET", "CREDIT"],
    ["2110", "應付帳款", "LIABILITY", "CREDIT"],
    ["2120", "銷項稅額", "LIABILITY", "CREDIT"],
    ["2130", "其他應付款", "LIABILITY", "CREDIT"],
    ["3110", "業主資本", "EQUITY", "CREDIT"],
    ["3120", "保留盈餘", "EQUITY", "CREDIT"],
    ["4110", "銷貨收入", "REVENUE", "CREDIT"],
    ["4120", "服務收入", "REVENUE", "CREDIT"],
    ["4130", "其他收入", "REVENUE", "CREDIT"],
    ["5110", "進貨成本", "EXPENSE", "DEBIT"],
    ["6110", "營業費用", "EXPENSE", "DEBIT"],
    ["6120", "租金支出", "EXPENSE", "DEBIT"],
    ["6130", "薪資支出", "EXPENSE", "DEBIT"],
    ["6140", "交通費", "EXPENSE", "DEBIT"],
    ["6150", "廣告費", "EXPENSE", "DEBIT"],
    ["6160", "水電費", "EXPENSE", "DEBIT"],
    ["6170", "折舊費用", "EXPENSE", "DEBIT"]
  ];

  await Promise.all(
    accountSeeds.map(([code, name, type, normalBalance]) =>
      upsertOrRead(
        prisma.account,
        {
          where: {
            companyId_code: {
              companyId: company.id,
              code
            }
          },
          create: {
            companyId: company.id,
            code,
            name,
            type,
            normalBalance
          },
          update: {
            name,
            type,
            normalBalance,
            isActive: true
          }
        },
        {
          where: {
            companyId_code: {
              companyId: company.id,
              code
            }
          }
        }
      )
    )
  );

  const customer = await upsertOrRead(
    prisma.counterparty,
    {
      where: {
        companyId_name_type: {
          companyId: company.id,
          name: "範例客戶",
          type: "CUSTOMER"
        }
      },
      create: {
        companyId: company.id,
        type: "CUSTOMER",
        name: "範例客戶",
        taxId: "12345678"
      },
      update: {}
    },
    {
      where: {
        companyId_name_type: {
          companyId: company.id,
          name: "範例客戶",
          type: "CUSTOMER"
        }
      }
    }
  );

  const vendor = await upsertOrRead(
    prisma.counterparty,
    {
      where: {
        companyId_name_type: {
          companyId: company.id,
          name: "範例供應商",
          type: "VENDOR"
        }
      },
      create: {
        companyId: company.id,
        type: "VENDOR",
        name: "範例供應商",
        taxId: "87654321"
      },
      update: {}
    },
    {
      where: {
        companyId_name_type: {
          companyId: company.id,
          name: "範例供應商",
          type: "VENDOR"
        }
      }
    }
  );

  const bankAccount = await upsertOrRead(
    prisma.bankAccount,
    {
      where: {
        companyId_accountName: {
          companyId: company.id,
          accountName: "主要銀行帳戶"
        }
      },
      create: {
        companyId: company.id,
        bankName: "範例銀行",
        accountName: "主要銀行帳戶",
        accountNumber: "000-000-000000",
        openingBalance: 0,
        currentBalance: 0
      },
      update: {}
    },
    {
      where: {
        companyId_accountName: {
          companyId: company.id,
          accountName: "主要銀行帳戶"
        }
      }
    }
  );

  const bootstrapUser = await ensureBootstrapAdmin(company);
  let user = bootstrapUser;
  let role = "OWNER";

  if (requireAuth) {
    const auth = await requireCompanyRole(company.id, roles, prisma, {
      allowPasswordChangeRequired
    });
    user = auth.user;
    role = auth.role;
    return {
      company,
      period,
      customer,
      vendor,
      bankAccount,
      user,
      role,
      session: auth.session
    };
  }

  return { company, period, customer, vendor, bankAccount, user, role };
}
