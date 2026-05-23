"use client";

import { useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/client-security";

function initialState(company) {
  return {
    name: company.name || "",
    taxId: company.taxId || "",
    taxRegistrationNumber: company.taxRegistrationNumber || "",
    representativeName: company.representativeName || "",
    address: company.address || "",
    filingType: company.filingType || "401"
  };
}

export default function CompanyProfileForm({ company, suggestion }) {
  const [values, setValues] = useState(() => initialState(company));
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasSuggestion = Boolean(suggestion?.taxId || suggestion?.companyName);
  const hasMismatch = useMemo(() => {
    if (!hasSuggestion) return false;
    return (
      (suggestion.taxId && suggestion.taxId !== company.taxId) ||
      (suggestion.companyName && suggestion.companyName !== company.name)
    );
  }, [company.name, company.taxId, hasSuggestion, suggestion]);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function applySuggestion() {
    setValues((current) => ({
      ...current,
      name: suggestion.companyName || current.name,
      taxId: suggestion.taxId || current.taxId,
      taxRegistrationNumber: suggestion.taxId || current.taxRegistrationNumber
    }));
    setStatus("已套用 OCR 建議，請確認後儲存");
  }

  async function submit(event) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("儲存中...");

    try {
      const response = await fetch("/api/accounting/company-profile", {
        method: "PATCH",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(values)
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message || "公司主檔更新失敗");
      }

      setStatus("公司主檔已更新");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setStatus(error.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="company-settings-grid">
      <section className="company-settings-panel">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Current Master</div>
            <h2>目前公司主檔</h2>
          </div>
          <span className={hasMismatch ? "status-pill warning" : "status-pill pass"}>
            {hasMismatch ? "需確認" : "一致"}
          </span>
        </div>

        <div className="company-master-summary">
          <div>
            <span>公司名稱</span>
            <strong>{company.name}</strong>
          </div>
          <div>
            <span>統一編號</span>
            <strong>{company.taxId}</strong>
          </div>
          <div>
            <span>申報別</span>
            <strong>{company.filingType}</strong>
          </div>
          <div>
            <span>稅籍編號</span>
            <strong>{company.taxRegistrationNumber || "-"}</strong>
          </div>
        </div>

        {hasSuggestion ? (
          <div className="ocr-suggestion">
            <div>
              <span>最近 OCR 讀到</span>
              <strong>{suggestion.companyName || "-"} / {suggestion.taxId || "-"}</strong>
              <small>
                來源：{suggestion.documentName || "OCR 任務"}
                {suggestion.filingDate ? ` / 申報 ${suggestion.filingDate}` : ""}
              </small>
            </div>
            <button type="button" onClick={applySuggestion} disabled={isSaving}>
              套用 OCR 建議
            </button>
          </div>
        ) : (
          <div className="empty-state">目前沒有可套用的 OCR 公司資料。</div>
        )}
      </section>

      <form className="company-settings-panel company-profile-form" onSubmit={submit}>
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Editable Profile</div>
            <h2>編輯主檔</h2>
          </div>
        </div>

        <label>
          公司名稱
          <input
            required
            value={values.name}
            onChange={(event) => updateValue("name", event.target.value)}
          />
        </label>
        <label>
          統一編號
          <input
            inputMode="numeric"
            maxLength={8}
            pattern="[0-9]{8}"
            required
            value={values.taxId}
            onChange={(event) => updateValue("taxId", event.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label>
          稅籍編號
          <input
            value={values.taxRegistrationNumber}
            onChange={(event) => updateValue("taxRegistrationNumber", event.target.value)}
          />
        </label>
        <label>
          申報別
          <select
            value={values.filingType}
            onChange={(event) => updateValue("filingType", event.target.value)}
          >
            <option value="401">401</option>
            <option value="403">403</option>
            <option value="404">404</option>
          </select>
        </label>
        <label>
          負責人
          <input
            value={values.representativeName}
            onChange={(event) => updateValue("representativeName", event.target.value)}
          />
        </label>
        <label className="span-2">
          地址
          <input
            value={values.address}
            onChange={(event) => updateValue("address", event.target.value)}
          />
        </label>

        <div className="company-form-actions">
          <button type="submit" disabled={isSaving}>
            {isSaving ? "儲存中" : "儲存主檔"}
          </button>
          {status ? <span>{status}</span> : null}
        </div>
      </form>
    </div>
  );
}
