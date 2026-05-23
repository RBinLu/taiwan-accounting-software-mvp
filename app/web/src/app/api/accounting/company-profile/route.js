import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { rolesForApi } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { handleRouteError, requireApiAccess } from "@/lib/security";

function textValue(value) {
  return String(value || "").trim();
}

function badRequest(message) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

function companySnapshot(company) {
  return {
    id: company.id,
    name: company.name,
    taxId: company.taxId,
    taxRegistrationNumber: company.taxRegistrationNumber,
    representativeName: company.representativeName,
    address: company.address,
    filingType: company.filingType
  };
}

export async function PATCH(request) {
  try {
    const payload = await request.json();
    const { company, user } = await requireApiAccess(request, {
      roles: rolesForApi("company:update")
    });

    const nextData = {
      name: textValue(payload.name),
      taxId: textValue(payload.taxId),
      taxRegistrationNumber: textValue(payload.taxRegistrationNumber) || null,
      representativeName: textValue(payload.representativeName) || null,
      address: textValue(payload.address) || null,
      filingType: textValue(payload.filingType) || "401"
    };

    if (!nextData.name) {
      return badRequest("公司名稱不可空白");
    }

    if (!/^\d{8}$/.test(nextData.taxId)) {
      return badRequest("統一編號必須是 8 碼數字");
    }

    if (!/^\d{3,4}$/.test(nextData.filingType)) {
      return badRequest("申報別需為 401、403、404 等代碼");
    }

    const duplicate = await prisma.company.findUnique({
      where: { taxId: nextData.taxId }
    });

    if (duplicate && duplicate.id !== company.id) {
      return badRequest("此統一編號已被另一個公司主檔使用");
    }

    const beforeValue = companySnapshot(company);
    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: nextData
    });
    const afterValue = companySnapshot(updatedCompany);

    await writeAudit({
      companyId: updatedCompany.id,
      userId: user.id,
      entityType: "company",
      entityId: updatedCompany.id,
      action: "UPDATE_COMPANY_PROFILE",
      beforeValue,
      afterValue,
      request
    });

    return NextResponse.json({ ok: true, company: afterValue });
  } catch (error) {
    return handleRouteError(error, "公司主檔更新失敗");
  }
}
