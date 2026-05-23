"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

function amountText(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export default function InvoicePaymentActions({
  invoiceId,
  kind,
  status,
  remainingAmount,
  periodLocked
}) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isClosed = ["PAID", "VOID"].includes(status);
  const actionLabel = kind === "RECEIVABLE" ? "收款" : "付款";

  if (isClosed) {
    return <span className="module-muted-action">已結清</span>;
  }

  if (periodLocked) {
    return <span className="module-muted-action">已鎖帳</span>;
  }

  async function submitPayment(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const response = await fetch("/api/accounting/invoice-payment", {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          invoiceId,
          amount: amount || remainingAmount
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || `${actionLabel}失敗`);
      }

      setMessage("已入帳");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  return (
    <form className="invoice-payment-actions" onSubmit={submitPayment}>
      <input
        aria-label={`${actionLabel}金額`}
        inputMode="decimal"
        min="0"
        name="amount"
        onChange={(event) => setAmount(event.target.value)}
        placeholder={amountText(remainingAmount)}
        step="0.01"
        type="number"
        value={amount}
      />
      <button type="submit" disabled={isSaving}>
        {isSaving ? "處理中" : actionLabel}
      </button>
      {message ? <span>{message}</span> : null}
    </form>
  );
}
