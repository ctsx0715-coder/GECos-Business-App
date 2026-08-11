/*
  Warnings:

  - Changed the type of `entityType` on the `audit_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "entityType",
ADD COLUMN     "entityType" TEXT NOT NULL,
ALTER COLUMN "entityId" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_organisationId_entityType_entityId_idx" ON "audit_logs"("organisationId", "entityType", "entityId");
