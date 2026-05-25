import { AuthError } from "@/lib/auth";
import { authRedirectPath } from "@/lib/auth-redirect";
import { ensureMvpContext } from "@/lib/demo-context";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getLines() {
  const { company } = await ensureMvpContext({
    roles: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER", "CLIENT_READONLY"]
  });

  try {
    const lines = await prisma.financialStatementLine.findMany({
      where: { companyId: company.id, statementType: "BALANCE_SHEET" },
      orderBy: [{ createdAt: "desc" }, { sortOrder: "asc" }],
      take: 200,
      include: {
        company: true,
        period: true
      }
    });
    return { ok: true, lines };
  } catch (error) {
    return { ok: false, message: error.message, lines: [] };
  }
}

export default async function BalanceSheetPage() {
  let data;
  try {
    data = await getLines();
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
          <div className="eyebrow">Balance Sheet</div>
          <h1>資產負債表資料</h1>
          <p className="page-copy">
            OCR 會把報表科目、金額與比較期寫成標準列資料，後續再做資產等於負債加權益的勾稽。
          </p>
        </div>
      </header>

      {!data.ok ? (
        <div className="error-box">無法讀取資產負債表：{data.message}</div>
      ) : (
        <div className="table-panel">
          {data.lines.length === 0 ? (
            <div className="empty-state">目前沒有資產負債表資料。先上傳資產負債表並完成 OCR 複核。</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>公司 / 期間</th>
                  <th>科目代碼</th>
                  <th>科目名稱</th>
                  <th>本期金額</th>
                  <th>比較期金額</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <div>{line.company.name}</div>
                      <div className="muted">{line.period.taxPeriod}</div>
                    </td>
                    <td>{line.lineCode || "-"}</td>
                    <td>{line.lineName}</td>
                    <td>{formatMoney(line.amountCurrent)}</td>
                    <td>{formatMoney(line.amountPrior)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
