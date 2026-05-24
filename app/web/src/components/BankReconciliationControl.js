"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";
import StatusBadge from "./StatusBadge.js";

function moneyText(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export default function BankReconciliationControl({ bankState, periodState }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isAlreadyLocked = bankState.latestStatus === "LOCKED";
  const hasDifference = Math.abs(Number(bankState.difference || 0)) >= 0.005;
  const canLock =
    !periodState.isLocked &&
    !isAlreadyLocked &&
    bankState.unmatchedCount === 0 &&
    !hasDifference;

  async function lockReconciliation() {
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const response = await fetch("/api/accounting/bank-reconciliation", {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "lock",
          bankBalance: bankState.bankBalance
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "鎖定銀行對帳失敗");
      }

      setMessage("已鎖定銀行對帳");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  const hint = isAlreadyLocked
    ? "本期銀行對帳已鎖定。"
    : periodState.isLocked
      ? "本期已鎖帳，不能再修改銀行對帳。"
      : bankState.unmatchedCount > 0
        ? "請先完成所有銀行交易匹配。"
        : hasDifference
          ? "銀行餘額與總帳銀行科目仍有差額。"
          : "本期銀行交易可鎖定對帳。";

  return (
    <div className="bank-reconciliation-panel">
      <div className="module-section-head">
        <span>Bank Reconciliation</span>
        <h2>銀行對帳</h2>
      </div>
      <div className="period-lock-status">
        <div>
          <span>{bankState.accountName}</span>
          <strong>{isAlreadyLocked ? "已鎖定" : "待對帳"}</strong>
        </div>
        <StatusBadge value={isAlreadyLocked ? "LOCKED" : "IN_PROGRESS"} />
      </div>
      <div className="bank-reconciliation-summary">
        <div>
          <span>銀行餘額</span>
          <strong>NT$ {moneyText(bankState.bankBalance)}</strong>
        </div>
        <div>
          <span>總帳餘額</span>
          <strong>NT$ {moneyText(bankState.bookBalance)}</strong>
        </div>
        <div>
          <span>未匹配</span>
          <strong>{bankState.unmatchedCount}</strong>
        </div>
        <div>
          <span>差額</span>
          <strong>NT$ {moneyText(bankState.difference)}</strong>
        </div>
      </div>
      <button
        type="button"
        className="bank-reconciliation-button"
        disabled={isSaving || !canLock}
        onClick={lockReconciliation}
      >
        {isSaving ? "處理中" : "鎖定銀行對帳"}
      </button>
      <p>{message || hint}</p>
    </div>
  );
}
