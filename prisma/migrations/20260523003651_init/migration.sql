-- CreateEnum
CREATE TYPE "BatchJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RECOVERED');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "parentAttachmentId" TEXT,
ADD COLUMN     "previewPath" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "importBatchId" TEXT;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "reversalOfId" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT,
    "assetNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" DECIMAL(18,2) NOT NULL,
    "salvageValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationAccountCode" TEXT NOT NULL DEFAULT '6170',
    "accumulatedDepreciationAccountCode" TEXT NOT NULL DEFAULT '1230',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssetDepreciation" (
    "id" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "depreciationAmount" DECIMAL(18,2) NOT NULL,
    "accumulatedAmount" DECIMAL(18,2) NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '件',
    "inventoryAccountCode" TEXT NOT NULL DEFAULT '1140',
    "cogsAccountCode" TEXT NOT NULL DEFAULT '5110',
    "quantityOnHand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT,
    "itemId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "transactionType" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "periodId" TEXT,
    "fileName" TEXT NOT NULL,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'COMPLETED',
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "matchedRows" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "rawPreview" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImportRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ANY',
    "accountCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankImportRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "periodId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'QUEUED',
    "message" TEXT,
    "rawResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "FixedAsset_companyId_status_idx" ON "FixedAsset"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_companyId_assetNo_key" ON "FixedAsset"("companyId", "assetNo");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_periodId_idx" ON "FixedAssetDepreciation"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetDepreciation_fixedAssetId_periodId_key" ON "FixedAssetDepreciation"("fixedAssetId", "periodId");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_isActive_idx" ON "InventoryItem"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_companyId_sku_key" ON "InventoryItem"("companyId", "sku");

-- CreateIndex
CREATE INDEX "InventoryTransaction_companyId_transactionDate_idx" ON "InventoryTransaction"("companyId", "transactionDate");

-- CreateIndex
CREATE INDEX "InventoryTransaction_itemId_idx" ON "InventoryTransaction"("itemId");

-- CreateIndex
CREATE INDEX "BankImportBatch_companyId_createdAt_idx" ON "BankImportBatch"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "BankImportBatch_bankAccountId_idx" ON "BankImportBatch"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankImportRule_companyId_isActive_idx" ON "BankImportRule"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BankImportRule_companyId_name_key" ON "BankImportRule"("companyId", "name");

-- CreateIndex
CREATE INDEX "BatchJob_companyId_createdAt_idx" ON "BatchJob"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "BatchJob_status_idx" ON "BatchJob"("status");

-- CreateIndex
CREATE INDEX "Attachment_parentAttachmentId_idx" ON "Attachment"("parentAttachmentId");

-- CreateIndex
CREATE INDEX "BankTransaction_importBatchId_idx" ON "BankTransaction"("importBatchId");

-- CreateIndex
CREATE INDEX "JournalEntry_reversalOfId_idx" ON "JournalEntry"("reversalOfId");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "BankImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_parentAttachmentId_fkey" FOREIGN KEY ("parentAttachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportRule" ADD CONSTRAINT "BankImportRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchJob" ADD CONSTRAINT "BatchJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchJob" ADD CONSTRAINT "BatchJob_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
