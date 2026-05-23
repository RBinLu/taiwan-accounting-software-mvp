-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ACCOUNTANT', 'REVIEWER', 'CLIENT_READONLY', 'ADMIN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('VAT_401', 'VAT_403', 'VAT_404', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'INVOICE', 'BANK_STATEMENT', 'FIXED_ASSET', 'INVENTORY', 'OTHER');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PASS', 'WARNING', 'FAIL');

-- CreateEnum
CREATE TYPE "StatementType" AS ENUM ('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'EQUITY_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "VatReturnType" AS ENUM ('FORM_401', 'FORM_403', 'FORM_404');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('DRAFT', 'REVIEWED', 'FILED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'GENERATED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "taxRegistrationNumber" TEXT,
    "name" TEXT NOT NULL,
    "representativeName" TEXT,
    "address" TEXT,
    "industryCode" TEXT,
    "filingType" TEXT NOT NULL DEFAULT '401',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUser" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ACCOUNTANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "taxPeriod" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storagePath" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'QUEUED',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "OcrStatus" NOT NULL DEFAULT 'QUEUED',
    "engine" TEXT NOT NULL DEFAULT 'pending',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "rawPayload" JSONB,

    CONSTRAINT "OcrJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "rawValue" TEXT,
    "normalizedValue" TEXT,
    "confidence" DECIMAL(5,4),
    "pageNumber" INTEGER,
    "boundingBox" JSONB,
    "validationStatus" "ValidationStatus",
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "returnType" "VatReturnType" NOT NULL DEFAULT 'FORM_401',
    "taxableSales" DECIMAL(18,2),
    "zeroTaxSales" DECIMAL(18,2),
    "outputTax" DECIMAL(18,2),
    "purchaseExpenseAmount" DECIMAL(18,2),
    "fixedAssetAmount" DECIMAL(18,2),
    "inputTax" DECIMAL(18,2),
    "nonDeductibleInputTax" DECIMAL(18,2),
    "payableTax" DECIMAL(18,2),
    "retainedTaxCredit" DECIMAL(18,2),
    "refundTax" DECIMAL(18,2),
    "filingStatus" "FilingStatus" NOT NULL DEFAULT 'DRAFT',
    "filingDate" TIMESTAMP(3),
    "rawFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatementLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "statementType" "StatementType" NOT NULL,
    "lineCode" TEXT,
    "lineName" TEXT NOT NULL,
    "amountCurrent" DECIMAL(18,2),
    "amountPrior" DECIMAL(18,2),
    "parentLineCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rawFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT,
    "documentId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "ruleLabel" TEXT NOT NULL,
    "status" "ValidationStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT,
    "documentId" TEXT,
    "exportType" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "storagePath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_taxId_key" ON "Company"("taxId");

-- CreateIndex
CREATE INDEX "CompanyUser_userId_idx" ON "CompanyUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyUser_companyId_userId_key" ON "CompanyUser"("companyId", "userId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_companyId_taxPeriod_idx" ON "AccountingPeriod"("companyId", "taxPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_companyId_year_month_key" ON "AccountingPeriod"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "Document_companyId_documentType_idx" ON "Document"("companyId", "documentType");

-- CreateIndex
CREATE INDEX "Document_periodId_idx" ON "Document"("periodId");

-- CreateIndex
CREATE INDEX "Document_fileHash_idx" ON "Document"("fileHash");

-- CreateIndex
CREATE INDEX "OcrJob_status_queuedAt_idx" ON "OcrJob"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "OcrJob_documentId_idx" ON "OcrJob"("documentId");

-- CreateIndex
CREATE INDEX "OcrExtraction_documentId_fieldKey_idx" ON "OcrExtraction"("documentId", "fieldKey");

-- CreateIndex
CREATE INDEX "ReviewTask_status_createdAt_idx" ON "ReviewTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VatReturn_filingStatus_idx" ON "VatReturn"("filingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturn_companyId_periodId_returnType_key" ON "VatReturn"("companyId", "periodId", "returnType");

-- CreateIndex
CREATE INDEX "FinancialStatementLine_companyId_periodId_statementType_idx" ON "FinancialStatementLine"("companyId", "periodId", "statementType");

-- CreateIndex
CREATE INDEX "FinancialStatementLine_lineCode_idx" ON "FinancialStatementLine"("lineCode");

-- CreateIndex
CREATE INDEX "ValidationResult_companyId_status_idx" ON "ValidationResult"("companyId", "status");

-- CreateIndex
CREATE INDEX "ValidationResult_documentId_idx" ON "ValidationResult"("documentId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportFile_companyId_exportType_idx" ON "ExportFile"("companyId", "exportType");

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrJob" ADD CONSTRAINT "OcrJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrExtraction" ADD CONSTRAINT "OcrExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatReturn" ADD CONSTRAINT "VatReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatReturn" ADD CONSTRAINT "VatReturn_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatementLine" ADD CONSTRAINT "FinancialStatementLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatementLine" ADD CONSTRAINT "FinancialStatementLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportFile" ADD CONSTRAINT "ExportFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportFile" ADD CONSTRAINT "ExportFile_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportFile" ADD CONSTRAINT "ExportFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
