function moneyText(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function closeChecks(periodState) {
  return [
    {
      label: "分錄過帳",
      complete: periodState.draftCount === 0,
      detail: `${periodState.draftCount} 筆草稿`
    },
    {
      label: "借貸平衡",
      complete: periodState.unbalancedCount === 0,
      detail: `${periodState.unbalancedCount} 筆不平衡`
    },
    {
      label: "試算平衡",
      complete: Number(periodState.difference || 0) === 0,
      detail: `差額 NT$ ${moneyText(periodState.difference)}`
    },
    {
      label: "銀行對帳",
      complete:
        periodState.bankTransactionCount === 0 ||
        (periodState.bankOpenCount === 0 && periodState.bankReconciliationLocked),
      detail: periodState.bankTransactionCount
        ? `${periodState.bankOpenCount} 筆未完成`
        : "無銀行交易"
    },
    {
      label: "稅務複核",
      complete: periodState.taxReady,
      detail: periodState.taxRecordCount ? `${periodState.taxDraftCount} 筆草稿` : "未重算"
    },
    {
      label: "財報產生",
      complete: periodState.financialReady,
      detail: periodState.financialReady ? `${periodState.financialLineCount} 列` : "未產生"
    }
  ];
}

export default function PeriodCloseSummary({ periodState }) {
  const checks = closeChecks(periodState);
  const completedCount = checks.filter((check) => check.complete).length;

  return (
    <section className="module-close-summary" aria-label="月結檢查清單">
      <div>
        <span>Month-end Close</span>
        <strong>月結檢查清單</strong>
        <small>
          {periodState.taxPeriod} / {completedCount}/{checks.length} 完成
        </small>
      </div>
      <div className="module-close-steps">
        {checks.map((check) => (
          <span className={check.complete ? "complete" : "pending"} key={check.label}>
            <strong>{check.label}</strong>
            <small>{check.complete ? "完成" : check.detail}</small>
          </span>
        ))}
      </div>
    </section>
  );
}
