-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "workedOn" TIMESTAMPTZ(6) NOT NULL,
    "clockedInAt" TIMESTAMPTZ(6) NOT NULL,
    "clockedOutAt" TIMESTAMPTZ(6),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "projectId" UUID,
    "shiftId" UUID,
    "note" TEXT,
    "approvedAt" TIMESTAMPTZ(6),
    "approvedById" UUID,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_organisationId_idx" ON "time_entries"("organisationId");

-- CreateIndex
CREATE INDEX "time_entries_organisationId_workedOn_idx" ON "time_entries"("organisationId", "workedOn");

-- CreateIndex
CREATE INDEX "time_entries_employeeId_workedOn_idx" ON "time_entries"("employeeId", "workedOn");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
