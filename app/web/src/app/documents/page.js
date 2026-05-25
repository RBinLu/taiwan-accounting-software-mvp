import DocumentUploadForm from "@/components/DocumentUploadForm";
import StatusBadge from "@/components/StatusBadge";
import { AuthError, CSRF_COOKIE } from "@/lib/auth";
import { authRedirectPath } from "@/lib/auth-redirect";
import { ensureMvpContext } from "@/lib/demo-context";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getDocuments() {
  const { company } = await ensureMvpContext({
    roles: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER", "CLIENT_READONLY"]
  });

  try {
    const documents = await prisma.document.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        company: true,
        period: true,
        ocrJobs: { orderBy: { queuedAt: "desc" }, take: 1 },
        reviewTasks: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    return { ok: true, documents };
  } catch (error) {
    return { ok: false, message: error.message, documents: [] };
  }
}

export default async function DocumentsPage() {
  let data;
  try {
    data = await getDocuments();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(authRedirectPath(error));
    }
    throw error;
  }
  const csrfToken = (await cookies()).get(CSRF_COOKIE)?.value || "";

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Documents</div>
          <h1>文件上傳</h1>
          <p className="page-copy">
            上傳後會立刻建立 document、ocr_job、review_task。OCR 引擎還沒接上前，
            任務會停在 QUEUED，方便先驗證資料庫鏈路。
          </p>
        </div>
      </header>

      <DocumentUploadForm csrfToken={csrfToken} />

      <h2 className="section-title">最近文件</h2>
      {!data.ok ? (
        <div className="error-box">無法讀取文件：{data.message}</div>
      ) : (
        <div className="table-panel">
          {data.documents.length === 0 ? (
            <div className="empty-state">尚未上傳任何文件。</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>檔名</th>
                  <th>類型</th>
                  <th>公司 / 期間</th>
                  <th>OCR</th>
                  <th>複核</th>
                  <th>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <div>{document.originalName}</div>
                      <div className="muted">
                        {document.mimeType || "application/octet-stream"} /{" "}
                        {Number(document.sizeBytes || 0).toLocaleString("zh-TW")} bytes
                      </div>
                    </td>
                    <td>{document.documentType}</td>
                    <td>
                      <div>{document.company.name}</div>
                      <div className="muted">{document.period?.taxPeriod || "-"}</div>
                    </td>
                    <td><StatusBadge value={document.ocrStatus} /></td>
                    <td><StatusBadge value={document.reviewStatus} /></td>
                    <td>{formatDateTime(document.createdAt)}</td>
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
