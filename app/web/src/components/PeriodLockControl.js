"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";
import StatusBadge from "./StatusBadge";

function moneyText(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export default function PeriodLockControl({ periodState }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const action = periodState.isLocked ? "unlock" : "lock";
  const canSubmit = periodState.isLocked || periodState.canLock;
  const closeChecks = [
    {
      label: "分錄皆已過帳",
      detail: `草稿分錄 ${periodState.draftCount} 筆`,
      complete: periodState.draftCount === 0
    },
    {
      label: "借貸平衡",
      detail: `不平衡分錄 ${periodState.unbalancedCount} 筆`,
      complete: periodState.unbalancedCount === 0
    },
    {
      label: "試算表平衡",
      detail: `差額 NT$ ${moneyText(periodState.difference)}`,
      complete: Number(periodState.difference || 0) === 0
    },
    {
      label: "銀行對帳完成",
      detail: periodState.bankTransactionCount
        ? periodState.bankReconciliationLocked
          ? "對帳已鎖定"
          : `${periodState.bankOpenCount} 筆未完成`
        : "本期無銀行交易",
      complete:
        periodState.bankTransactionCount === 0 ||
        (periodState.bankOpenCount === 0 && periodState.bankReconciliationLocked)
    },
    {
      label: "稅務已複核",
      detail: periodState.taxRecordCount
        ? periodState.taxReady
          ? "稅務已完成"
          : `${periodState.taxDraftCount} 筆草稿`
        : "尚未重算稅務",
      complete: periodState.taxReady
    },
    {
      label: "財報已產生",
      detail: periodState.financialReady
        ? `${periodState.financialLineCount} 列`
        : "尚未產生財報",
      complete: periodState.financialReady
    }
  ];
  const completedCount = closeChecks.filter((check) => check.complete).length;

  async function submitAction() {
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const response = await fetch("/api/accounting/period-lock", {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "操作失敗");
      }

      setMessage(action === "lock" ? "已鎖帳" : "已解鎖");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="period-lock-panel">
      <div className="module-section-head">
        <span>Period Control</span>
        <h2>期別鎖帳</h2>
      </div>
      <div className="period-lock-status">
        <div>
          <span>{periodState.taxPeriod}</span>
          <strong>{periodState.isLocked ? "已鎖帳" : "開放中"}</strong>
        </div>
        <StatusBadge value={periodState.isLocked ? "LOCKED" : "OPEN_PERIOD"} />
      </div>
      <div className="period-close-checks">
        <div className="close-checks-head">
          <strong>月結檢查清單</strong>
          <span>
            {completedCount}/{closeChecks.length} 完成
          </span>
        </div>
        {closeChecks.map((check) => (
          <div
            className={`close-check ${check.complete ? "complete" : "pending"}`}
            key={check.label}
          >
            <span>{check.complete ? "完成" : "待處理"}</span>
            <div>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="period-lock-button"
        disabled={isSaving || !canSubmit}
        onClick={submitAction}
      >
        {isSaving ? "處理中" : periodState.isLocked ? "解除鎖帳" : "鎖定本期"}
      </button>
      <p>{message || (canSubmit ? "本期符合鎖帳條件。" : "請先完成月結檢查。")}</p>
    </div>
  );
}
