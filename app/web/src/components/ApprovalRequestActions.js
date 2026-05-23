"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function ApprovalRequestActions({ approvalId, status }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (status !== "PENDING") {
    return <span className="module-muted-action">已結案</span>;
  }

  async function submitAction(action) {
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const response = await fetch("/api/accounting/approval-action", {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ approvalId, action })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "審核失敗");
      }

      setMessage("已更新");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="module-row-actions">
      <button type="button" disabled={isSaving} onClick={() => submitAction("approve")}>
        核准
      </button>
      <button type="button" disabled={isSaving} onClick={() => submitAction("reject")}>
        退回
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
