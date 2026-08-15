-- CreateTable
CREATE TABLE "roster_assignments" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "projectId" UUID,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "roster_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roster_assignments_organisationId_idx" ON "roster_assignments"("organisationId");

-- CreateIndex
CREATE INDEX "roster_assignments_organisationId_startsAt_idx" ON "roster_assignments"("organisationId", "startsAt");

-- CreateIndex
CREATE INDEX "roster_assignments_employeeId_startsAt_idx" ON "roster_assignments"("employeeId", "startsAt");

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
