"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

export default function AttachmentUploadForm() {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("上傳中...");

    try {
      const response = await fetch("/api/accounting/attachments", {
        method: "POST",
        headers: csrfHeaders(),
        body: new FormData(event.currentTarget)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "上傳失敗");
      }

      setMessage("已上傳");
      event.currentTarget.reset();
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error.message);
      setIsSaving(false);
    }
  }

  return (
    <form className="module-form attachment-upload-form" onSubmit={handleSubmit}>
      <label className="module-field">
        <span>附件檔案</span>
        <input name="file" type="file" required />
      </label>
      <div className="module-form-grid">
        <label className="module-field">
          <span>關聯類型</span>
          <input name="linkedEntityType" placeholder="journal / invoice / tax" />
        </label>
        <label className="module-field">
          <span>關聯 ID</span>
          <input name="linkedEntityId" />
        </label>
        <label className="module-field">
          <span>上一版附件 ID</span>
          <input name="parentAttachmentId" />
        </label>
      </div>
      <div className="module-form-actions">
        <span>{message}</span>
        <button type="submit" disabled={isSaving}>
          {isSaving ? "上傳中" : "上傳附件"}
        </button>
      </div>
    </form>
  );
}
