import StatusBadge from "@/components/StatusBadge";
import OcrJobActions from "@/components/OcrJobActions";
import { AuthError } from "@/lib/auth";
import { ensureMvpContext } from "@/lib/demo-context";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getJobs() {
  const { company } = await ensureMvpContext({
    roles: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER"]
  });

  try {
    const [jobs, validations, extractions] = await Promise.all([
      prisma.ocrJob.findMany({
        where: { document: { companyId: company.id } },
        orderBy: { queuedAt: "desc" },
        take: 100,
        include: {
          document: {
            include: {
              company: true,
              period: true,
              _count: {
                select: {
                  extractions: true,
                  validationRows: true
                }
              }
            }
          }
        }
      }),
      prisma.validationResult.findMany({
        where: {
          companyId: company.id,
          ruleKey: { startsWith: "ocr_" }
        },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: {
          document: true,
          period: true
        }
      }),
      prisma.ocrExtraction.findMany({
        where: { document: { companyId: company.id } },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: {
          document: true
        }
      })
    ]);
    return { ok: true, jobs, validations, extractions };
  } catch (error) {
    return { ok: false, message: error.message, jobs: [], validations: [], extractions: [] };
  }
}

export default async function OcrPage() {
  let data;
  try {
    data = await getJobs();
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
          <div className="eyebrow">OCR Jobs</div>
          <h1>OCR 任務</h1>
          <p className="page-copy">
            OCR 只做驗證底稿，不直接改帳。401 會用 PDF 文字層抽欄位比對；年度申報影像 PDF 會用繁中 OCR 抽第 3 頁損益及稅額計算表與第 5 頁資產負債表。
          </p>
        </div>
      </header>

      {!data.ok ? (
        <div className="error-box">無法讀取 OCR 任務：{data.message}</div>
      ) : (
        <div className="table-panel">
          {data.jobs.length === 0 ? (
            <div className="empty-state">目前沒有 OCR 任務。</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>狀態</th>
                  <th>文件</th>
                  <th>類型</th>
                  <th>公司 / 期間</th>
                  <th>引擎</th>
                  <th>抽取 / 驗證</th>
                  <th>排入時間</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.id}>
                    <td><StatusBadge value={job.status} /></td>
                    <td>{job.document.originalName}</td>
                    <td>{job.document.documentType}</td>
                    <td>
                      <div>{job.document.company.name}</div>
                      <div className="muted">{job.document.period?.taxPeriod || "-"}</div>
                    </td>
                    <td>{job.engine}</td>
                    <td>
                      <div>{job.document._count.extractions} 欄位</div>
                      <div className="muted">{job.document._count.validationRows} 筆驗證</div>
                    </td>
                    <td>{formatDateTime(job.queuedAt)}</td>
                    <td><OcrJobActions jobId={job.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <h2 className="section-title">最近驗證結果</h2>
      {!data.ok ? null : (
        <div className="table-panel">
          {data.validations.length === 0 ? (
            <div className="empty-state">尚未產生 OCR 驗證結果。</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>狀態</th>
                  <th>規則</th>
                  <th>文件 / 期間</th>
                  <th>訊息</th>
                </tr>
              </thead>
              <tbody>
                {data.validations.map((row) => (
                  <tr key={row.id}>
                    <td><StatusBadge value={row.status} /></td>
                    <td>{row.ruleLabel}</td>
                    <td>
                      <div>{row.document?.originalName || "-"}</div>
                      <div className="muted">{row.period?.taxPeriod || "-"}</div>
                    </td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <h2 className="section-title">最近抽取欄位</h2>
      {!data.ok ? null : (
        <div className="table-panel">
          {data.extractions.length === 0 ? (
            <div className="empty-state">尚未抽取任何 OCR 欄位。</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>文件</th>
                  <th>欄位</th>
                  <th>值</th>
                  <th>信心</th>
                </tr>
              </thead>
              <tbody>
                {data.extractions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.document.originalName}</td>
                    <td>{row.fieldLabel}</td>
                    <td>{row.normalizedValue || row.rawValue || "-"}</td>
                    <td>{row.confidence ? Number(row.confidence).toFixed(2) : "-"}</td>
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
