-- CreateTable
CREATE TABLE "payroll_policies" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "ordinaryMinutesPerDayShortWeek" INTEGER NOT NULL DEFAULT 540,
    "ordinaryMinutesPerDayLongWeek" INTEGER NOT NULL DEFAULT 480,
    "ordinaryMinutesPerWeek" INTEGER NOT NULL DEFAULT 2700,
    "maxOvertimeMinutesPerDay" INTEGER NOT NULL DEFAULT 180,
    "maxOvertimeMinutesPerWeek" INTEGER NOT NULL DEFAULT 600,
    "overtimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
    "sundayMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    "holidayMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_policies_organisationId_key" ON "payroll_policies"("organisationId");

-- AddForeignKey
ALTER TABLE "payroll_policies" ADD CONSTRAINT "payroll_policies_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
