-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "workPatternId" UUID;

-- CreateTable
CREATE TABLE "work_patterns" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cycleDays" INTEGER NOT NULL DEFAULT 7,
    "workingDayIndexes" INTEGER[],
    "anchorOn" TIMESTAMPTZ(6) NOT NULL,
    "hoursPerDay" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "work_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_patterns_organisationId_idx" ON "work_patterns"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "work_patterns_organisationId_code_key" ON "work_patterns"("organisationId", "code");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "work_patterns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_patterns" ADD CONSTRAINT "work_patterns_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
