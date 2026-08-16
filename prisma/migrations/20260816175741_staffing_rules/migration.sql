-- CreateTable
CREATE TABLE "staffing_rules" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" UUID,
    "department" TEXT,
    "shiftId" UUID,
    "weekdays" INTEGER[],
    "minimumPeople" INTEGER NOT NULL,
    "maximumPeople" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "staffing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staffing_rules_organisationId_idx" ON "staffing_rules"("organisationId");

-- AddForeignKey
ALTER TABLE "staffing_rules" ADD CONSTRAINT "staffing_rules_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_rules" ADD CONSTRAINT "staffing_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffing_rules" ADD CONSTRAINT "staffing_rules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
