"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function OcrJobActions({ jobId }) {
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  async function runValidation() {
    setIsRunning(true);
    setMessage("驗證中...");

    try {
      const response = await fetch(`/api/ocr/jobs/${jobId}/run`, {
        method: "POST",
        headers: csrfHeaders()
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "OCR 驗證失敗");
      }

      setMessage(body.status === "SKIPPED" ? "需要人工複核" : "驗證完成");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error.message);
      setIsRunning(false);
    }
  }

  return (
    <div className="inline-action">
      <button type="button" onClick={runValidation} disabled={isRunning}>
        {isRunning ? "處理中" : "執行驗證"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
