"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function DocumentUploadForm() {
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("上傳中...");

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: csrfHeaders(),
        body: formData
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Upload failed");
      }

      setStatus("已建立 OCR 任務與複核工作。");
      event.currentTarget.reset();
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="upload-panel" onSubmit={onSubmit}>
      <div className="form-row">
        <label htmlFor="documentType">文件類型</label>
        <select id="documentType" name="documentType" defaultValue="VAT_401">
          <option value="VAT_401">401 營業稅申報書</option>
          <option value="BALANCE_SHEET">資產負債表</option>
          <option value="INCOME_STATEMENT">損益表</option>
          <option value="CASH_FLOW">現金流量表</option>
          <option value="INVOICE">發票 / 憑證</option>
          <option value="BANK_STATEMENT">銀行明細</option>
          <option value="OTHER">其他</option>
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="file">檔案</label>
        <input id="file" name="file" type="file" required />
      </div>
      <div className="form-actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "處理中" : "上傳並建立任務"}
        </button>
        <span className="form-status">{status}</span>
      </div>
    </form>
  );
}
