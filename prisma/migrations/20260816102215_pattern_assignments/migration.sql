-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "shiftId" UUID;

-- AlterTable
ALTER TABLE "work_patterns" ADD COLUMN     "maxConsecutiveTurns" INTEGER,
ADD COLUMN     "rotationWeeks" INTEGER;

-- CreateTable
CREATE TABLE "pattern_assignments" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workPatternId" UUID NOT NULL,
    "shiftId" UUID,
    "startsOn" TIMESTAMPTZ(6) NOT NULL,
    "endsOn" TIMESTAMPTZ(6),
    "appliedAt" TIMESTAMPTZ(6),
    "note" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "pattern_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pattern_assignments_organisationId_idx" ON "pattern_assignments"("organisationId");

-- CreateIndex
CREATE INDEX "pattern_assignments_organisationId_startsOn_idx" ON "pattern_assignments"("organisationId", "startsOn");

-- CreateIndex
CREATE INDEX "pattern_assignments_employeeId_startsOn_idx" ON "pattern_assignments"("employeeId", "startsOn");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_assignments" ADD CONSTRAINT "pattern_assignments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_assignments" ADD CONSTRAINT "pattern_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_assignments" ADD CONSTRAINT "pattern_assignments_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "work_patterns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_assignments" ADD CONSTRAINT "pattern_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
