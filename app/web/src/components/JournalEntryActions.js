"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function JournalEntryActions({ entryId, status }) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canPost = status === "DRAFT";
  const canVoidOrReverse = status === "POSTED";

  if (!canPost && !canVoidOrReverse) {
    return <span className="module-muted-action">-</span>;
  }

  async function submitAction(action) {
    setIsSaving(true);
    setMessage("處理中...");

    try {
      const url =
        action === "reverse"
          ? "/api/accounting/journal-reversal"
          : "/api/accounting/journal-entry-status";
      const response = await fetch(url, {
        method: "POST",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          entryId,
          action,
          reason: action === "reverse" ? "使用者建立沖銷分錄" : undefined
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "操作失敗");
      }

      setMessage(
        action === "post" ? "已過帳" : action === "reverse" ? "已沖銷" : "已作廢"
      );
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="module-row-actions">
      {canPost ? (
        <button type="button" disabled={isSaving} onClick={() => submitAction("post")}>
          {isSaving ? "處理中" : "過帳"}
        </button>
      ) : null}
      {canVoidOrReverse ? (
        <>
          <button type="button" disabled={isSaving} onClick={() => submitAction("reverse")}>
            沖銷
          </button>
          <button type="button" disabled={isSaving} onClick={() => submitAction("void")}>
            作廢
          </button>
        </>
      ) : null}
      {message ? <span>{message}</span> : null}
    </div>
  );
}
