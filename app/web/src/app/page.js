import StatusBadge from "@/components/StatusBadge";
import { AuthError } from "@/lib/auth";
import { ensureMvpContext } from "@/lib/demo-context";
import { formatDateTime } from "@/lib/format";
import { mvpModules } from "@/lib/mvp-module-config";
import { rolesForModule } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileSearch,
  FileText,
  Landmark,
  UploadCloud
} from "lucide-react";

export const dynamic = "force-dynamic";

function getCurrentTaxPeriod() {
  const taipeiNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" })
  );
  return `${taipeiNow.getFullYear()}-${String(taipeiNow.getMonth() + 1).padStart(2, "0")}`;
}

async function getDashboard() {
  const currentTaxPeriod = getCurrentTaxPeriod();
  let context;

  try {
    context = await ensureMvpContext({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT", "REVIEWER", "CLIENT_READONLY"]
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        authRequired: error.status !== 428,
        passwordChangeRequired: error.status === 428,
        currentTaxPeriod
      };
    }
    throw error;
  }

  const { company, role } = context;

  try {
    const [
      companyCount,
      documentCount,
      queuedOcrCount,
      processingOcrCount,
      failedOcrCount,
      openReviewCount,
      inProgressReviewCount,
      validationFailCount,
      validationWarningCount,
      vatDraftCount,
      vatReviewedCount,
      financialLineCount,
      generatedExportCount,
      recentDocuments,
      reviewTasks,
      validationResults
    ] = await Promise.all([
      prisma.company.count({ where: { id: company.id } }),
      prisma.document.count({ where: { companyId: company.id } }),
      prisma.ocrJob.count({ where: { status: "QUEUED", document: { companyId: company.id } } }),
      prisma.ocrJob.count({ where: { status: "PROCESSING", document: { companyId: company.id } } }),
      prisma.ocrJob.count({ where: { status: "FAILED", document: { companyId: company.id } } }),
      prisma.reviewTask.count({ where: { status: "OPEN", document: { companyId: company.id } } }),
      prisma.reviewTask.count({ where: { status: "IN_PROGRESS", document: { companyId: company.id } } }),
      prisma.validationResult.count({ where: { companyId: company.id, status: "FAIL" } }),
      prisma.validationResult.count({ where: { companyId: company.id, status: "WARNING" } }),
      prisma.vatReturn.count({ where: { companyId: company.id, filingStatus: "DRAFT" } }),
      prisma.vatReturn.count({ where: { companyId: company.id, filingStatus: "REVIEWED" } }),
      prisma.financialStatementLine.count({ where: { companyId: company.id } }),
      prisma.exportFile.count({ where: { companyId: company.id, status: "GENERATED" } }),
      prisma.document.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { company: true, period: true }
      }),
      prisma.reviewTask.findMany({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          document: { companyId: company.id }
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          document: {
            include: {
              company: true,
              period: true
            }
          }
        }
      }),
      prisma.validationResult.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          company: true,
          period: true
        }
      })
    ]);

    return {
      ok: true,
      role,
      currentTaxPeriod,
      companyCount,
      documentCount,
      queuedOcrCount,
      processingOcrCount,
      failedOcrCount,
      openReviewCount,
      inProgressReviewCount,
      validationFailCount,
      validationWarningCount,
      vatDraftCount,
      vatReviewedCount,
      financialLineCount,
      generatedExportCount,
      recentDocuments,
      reviewTasks,
      validationResults
    };
  } catch (error) {
    return { ok: false, message: error.message, currentTaxPeriod };
  }
}

export default async function DashboardPage() {
  const data = await getDashboard();

  if (data.authRequired) {
    redirect("/login");
  }

  if (data.passwordChangeRequired) {
    redirect("/change-password");
  }

  if (!data.ok) {
    return (
      <section className="mvp-error">
        <h1>會計 MVP 控制台</h1>
        <div className="error-box">
          資料庫尚未就緒：{data.message}
          <br />
          請先執行 `npm run db:up` 與 `npm run db:migrate`。
        </div>
      </section>
    );
  }

  const reviewQueueCount = data.openReviewCount + data.inProgressReviewCount;
  const ocrActiveCount = data.queuedOcrCount + data.processingOcrCount;
  const validationIssueCount = data.validationFailCount + data.validationWarningCount;
  const reportCount =
    data.vatDraftCount + data.vatReviewedCount + data.financialLineCount;

  const metrics = [
    ["帳套", data.companyCount, "公司 / 期別基礎資料"],
    ["待 OCR", ocrActiveCount, `${data.processingOcrCount} 件辨識中`],
    ["待複核", reviewQueueCount, `${data.openReviewCount} 件未開始`],
    ["異常", validationIssueCount, `${data.validationFailCount} 件失敗`]
  ];

  const closeSteps = [
    ["文件入庫", data.documentCount ? "已開始" : "待上傳", data.documentCount ? "PASS" : "PENDING"],
    [
      "OCR 轉資料",
      data.failedOcrCount ? `${data.failedOcrCount} 件失敗` : `${data.queuedOcrCount} 件排隊`,
      data.failedOcrCount ? "FAIL" : ocrActiveCount ? "WARNING" : data.documentCount ? "PASS" : "PENDING"
    ],
    [
      "人工複核",
      `${reviewQueueCount} 件`,
      reviewQueueCount ? "WARNING" : data.documentCount ? "PASS" : "PENDING"
    ],
    [
      "報表產出",
      `${data.vatDraftCount + data.vatReviewedCount} 份 401 / ${data.financialLineCount} 筆財報`,
      reportCount ? "PASS" : "PENDING"
    ]
  ];

  const modules = Object.values(mvpModules).filter((module) => {
    const key = module.path.replace(/^\//, "");
    if (["documents", "ocr"].includes(key) || key.startsWith("reports/")) return true;
    return rolesForModule(key, "read").includes(data.role);
  });

  return (
    <>
      <header className="mvp-header">
        <div>
          <div className="eyebrow">Accounting MVP</div>
          <h1>會計 MVP 控制台</h1>
          <p>先完成會計軟體骨架：帳套、分錄、總帳、應收應付、銀行、稅務、財報、附件與權限。</p>
        </div>
        <div className="period-toolbar" aria-label="目前期別與主要操作">
          <span className="period-chip">
            <CalendarDays size={16} />
            {data.currentTaxPeriod}
          </span>
          <a className="primary-action" href="/documents">
            <UploadCloud size={17} />
            上傳文件
          </a>
        </div>
      </header>

      <section className="mvp-shell">
        <section className="mvp-metrics" aria-label="MVP 指標">
          {metrics.map(([label, value, note]) => (
            <div className="mvp-metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          ))}
        </section>

        <section className="mvp-panel mvp-modules">
          <div className="mvp-panel-head">
            <div>
              <div className="card-kicker">
                <BookOpen size={18} strokeWidth={2.2} />
                功能骨架
              </div>
              <h2>MVP 模組</h2>
            </div>
          </div>
          <div className="mvp-module-grid">
            {modules.map((module) => (
              <a className="mvp-module" href={module.path} key={module.path}>
                <div>
                  <strong>{module.title}</strong>
                  <span>{module.description}</span>
                </div>
                <em>MVP</em>
              </a>
            ))}
          </div>
        </section>

        <section className="mvp-panel mvp-flow">
          <div className="mvp-panel-head">
            <div>
              <div className="card-kicker">
                <Landmark size={18} strokeWidth={2.2} />
                處理鏈路
              </div>
              <h2>本期關帳</h2>
            </div>
            <a href="/reports/vat-returns">401 <ArrowRight size={15} /></a>
          </div>
          <div className="mvp-step-list">
            {closeSteps.map(([label, description, status]) => (
              <div className="mvp-step" key={label}>
                <div className="step-status-icon">
                  {status === "PASS" ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
                </div>
                <div>
                  <strong>{label}</strong>
                  <span>{description}</span>
                </div>
                <StatusBadge value={status} />
              </div>
            ))}
          </div>
        </section>

        <section className="mvp-panel mvp-queue">
          <div className="mvp-panel-head">
            <div>
              <div className="card-kicker">
                <ClipboardCheck size={18} strokeWidth={2.2} />
                待辦
              </div>
              <h2>複核待辦</h2>
            </div>
            <a href="/ocr">OCR <ArrowRight size={15} /></a>
          </div>
          <div className="mvp-compact-list">
            {data.reviewTasks.length ? (
              data.reviewTasks.map((task) => (
                <div className="mvp-list-row" key={task.id}>
                  <FileSearch size={17} />
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.document.company.name} / {task.document.period?.taxPeriod || "未指定期間"}</span>
                  </div>
                  <StatusBadge value={task.status} />
                </div>
              ))
            ) : (
              <div className="mvp-empty">目前沒有複核待辦。上傳文件後會建立任務。</div>
            )}
          </div>
        </section>

        <section className="mvp-panel mvp-records">
          <div className="mvp-panel-head">
            <div>
              <div className="card-kicker">
                <FileText size={18} strokeWidth={2.2} />
                入庫紀錄
              </div>
              <h2>最近文件</h2>
            </div>
            <a href="/documents">文件庫 <ArrowRight size={15} /></a>
          </div>
          <div className="mvp-compact-list">
            {data.recentDocuments.length ? (
              data.recentDocuments.map((document) => (
                <div className="mvp-list-row" key={document.id}>
                  <FileCheck2 size={17} />
                  <div>
                    <strong>{document.originalName}</strong>
                    <span>{document.documentType} / {formatDateTime(document.createdAt)}</span>
                  </div>
                  <StatusBadge value={document.reviewStatus} />
                </div>
              ))
            ) : (
              <div className="mvp-empty">尚未上傳文件。MVP 第一個入口是文件入庫。</div>
            )}
          </div>
        </section>

        <section className="mvp-panel mvp-reports">
          <div className="mvp-panel-head">
            <div>
              <div className="card-kicker">
                <AlertTriangle size={18} strokeWidth={2.2} />
                報表與異常
              </div>
              <h2>輸出狀態</h2>
            </div>
          </div>
          <div className="mvp-report-grid">
            <div>
              <span>401 草稿</span>
              <strong>{data.vatDraftCount}</strong>
            </div>
            <div>
              <span>已複核</span>
              <strong>{data.vatReviewedCount}</strong>
            </div>
            <div>
              <span>財報列</span>
              <strong>{data.financialLineCount}</strong>
            </div>
            <div>
              <span>已匯出</span>
              <strong>{data.generatedExportCount}</strong>
            </div>
          </div>
          <div className="mvp-risk-line">
            <StatusBadge value={validationIssueCount ? "WARNING" : "PASS"} />
            <span>{validationIssueCount ? `${validationIssueCount} 件勾稽待處理` : "目前沒有勾稽異常"}</span>
          </div>
        </section>
      </section>
    </>
  );
}
