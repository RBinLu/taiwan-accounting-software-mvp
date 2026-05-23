"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function BankTransactionActions({
  transactionId,
  status,
  matchedEntryNo,
  periodLocked
}) {
  const [entryNo, setEntryNo] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submitAction(action, extraPayload = {}) {
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const response = await fetch("/api/accounting/bank-match", {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action,
          transactionId,
          ...extraPayload
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "操作失敗");
      }

      setMessage("已更新");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  async function submitMatch(event) {
    event.preventDefault();
    await submitAction("match", { entryNo });
  }

  if (status === "RECONCILED") {
    return <span className="module-muted-action">已對帳</span>;
  }

  if (periodLocked) {
    return <span className="module-muted-action">已鎖帳</span>;
  }

  if (status === "MATCHED") {
    return (
      <div className="bank-match-actions bank-match-actions-row">
        <button
          type="button"
          className="bank-match-secondary"
          disabled={isSaving}
          onClick={() => submitAction("unmatch")}
        >
          解除
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => submitAction("reconcile")}
        >
          對帳
        </button>
        {message ? (
          <span>
            {matchedEntryNo ? `${matchedEntryNo}：` : ""}
            {message}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form className="bank-match-actions" onSubmit={submitMatch}>
      <input
        aria-label="匹配傳票號碼"
        name="entryNo"
        onChange={(event) => setEntryNo(event.target.value)}
        placeholder="傳票號碼"
        required
        type="text"
        value={entryNo}
      />
      <button type="submit" disabled={isSaving}>
        {isSaving ? "處理中" : "匹配"}
      </button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}
