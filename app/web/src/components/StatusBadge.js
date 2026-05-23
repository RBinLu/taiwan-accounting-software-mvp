const classMap = {
  QUEUED: "badge neutral",
  RUNNING: "badge info",
  PROCESSING: "badge info",
  COMPLETED: "badge success",
  FAILED: "badge danger",
  RECOVERED: "badge success",
  SKIPPED: "badge neutral",
  PENDING: "badge neutral",
  IN_REVIEW: "badge info",
  APPROVED: "badge success",
  REJECTED: "badge danger",
  NEEDS_INFO: "badge warning",
  OPEN: "badge neutral",
  OPEN_PERIOD: "badge success",
  IN_PROGRESS: "badge info",
  POSTED: "badge success",
  VOID: "badge danger",
  PARTIAL: "badge warning",
  PAID: "badge success",
  UNMATCHED: "badge warning",
  MATCHED: "badge info",
  RECONCILED: "badge success",
  PASS: "badge success",
  WARNING: "badge warning",
  FAIL: "badge danger",
  DRAFT: "badge neutral",
  REVIEWED: "badge info",
  FILED: "badge success",
  LOCKED: "badge danger",
  GENERATED: "badge success",
  ACTIVE: "badge success",
  INACTIVE: "badge danger"
};

const labelMap = {
  QUEUED: "排隊中",
  RUNNING: "執行中",
  PROCESSING: "辨識中",
  COMPLETED: "已完成",
  FAILED: "失敗",
  RECOVERED: "已復原",
  SKIPPED: "略過",
  PENDING: "待處理",
  IN_REVIEW: "複核中",
  APPROVED: "已核准",
  REJECTED: "已退回",
  NEEDS_INFO: "需補件",
  OPEN: "未開始",
  OPEN_PERIOD: "開放",
  IN_PROGRESS: "處理中",
  POSTED: "已過帳",
  VOID: "作廢",
  PARTIAL: "部分結清",
  PAID: "已收付",
  UNMATCHED: "未匹配",
  MATCHED: "已匹配",
  RECONCILED: "已對帳",
  PASS: "通過",
  WARNING: "注意",
  FAIL: "異常",
  DRAFT: "草稿",
  REVIEWED: "已複核",
  FILED: "已申報",
  LOCKED: "已鎖定",
  GENERATED: "已產生",
  ACTIVE: "啟用",
  INACTIVE: "停用"
};

export default function StatusBadge({ value }) {
  return (
    <span className={classMap[value] || "badge neutral"}>
      {labelMap[value] || value || "-"}
    </span>
  );
}
