import StatusBadge from "@/components/StatusBadge";
import { AuthError } from "@/lib/auth";
import { ensureMvpContext } from "@/lib/demo-context";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getVatReturns() {
  const { company } = await ensureMvpContext({
    roles: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER", "CLIENT_READONLY"]
  });

  try {
    const vatReturns = await prisma.vatReturn.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        company: true,
        period: true
      }
    });
    return { ok: true, vatReturns };
  } catch (error) {
    return { ok: false, message: error.message, vatReturns: [] };
  }
}

export default async function VatReturnsPage() {
  let data;
  try {
    data = await getVatReturns();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.status === 428 ? "/change-password" : "/login");
    }
    throw error;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">VAT Returns</div>
          <h1>401 報表資料</h1>
          <p className="page-copy">
            OCR 複核確認後，401 表欄位會寫入這裡。這張表會是後續產生申報草稿、檢核銷項/進項與匯出檔的核心。
          </p>
        </div>
      </header>

      {!data.ok ? (
        <div className="error-box">無法讀取 401 資料：{data.message}</div>
      ) : (
        <div className="table-panel">
          {data.vatReturns.length === 0 ? (
            <div className="empty-state">目前沒有 401 報表資料。先上傳 401 文件並完成 OCR 複核。</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>公司 / 期間</th>
                  <th>類型</th>
                  <th>銷售額</th>
                  <th>銷項稅額</th>
                  <th>進項稅額</th>
                  <th>應納稅額</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {data.vatReturns.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div>{row.company.name}</div>
                      <div className="muted">{row.period.taxPeriod}</div>
                    </td>
                    <td>{row.returnType}</td>
                    <td>{formatMoney(row.taxableSales)}</td>
                    <td>{formatMoney(row.outputTax)}</td>
                    <td>{formatMoney(row.inputTax)}</td>
                    <td>{formatMoney(row.payableTax)}</td>
                    <td><StatusBadge value={row.filingStatus} /></td>
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
