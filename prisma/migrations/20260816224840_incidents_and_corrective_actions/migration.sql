-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('NEAR_MISS', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'PERMANENT_DISABILITY', 'FATALITY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('ELIMINATION', 'SUBSTITUTION', 'ENGINEERING', 'ADMINISTRATIVE', 'PPE');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'INCIDENT';

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "IncidentKind" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "reportedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" UUID,
    "place" TEXT,
    "injuredEmployeeId" UUID,
    "injuredPersonName" TEXT,
    "description" TEXT NOT NULL,
    "immediateAction" TEXT,
    "daysUnableToWork" INTEGER,
    "dangerousOccurrence" BOOLEAN NOT NULL DEFAULT false,
    "reportedToDepartmentAt" TIMESTAMPTZ(6),
    "reportedToFundAt" TIMESTAMPTZ(6),
    "externalReference" TEXT,
    "investigatedById" UUID,
    "rootCause" TEXT,
    "closedAt" TIMESTAMPTZ(6),
    "closedById" UUID,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_actions" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "control" "ControlType" NOT NULL,
    "assignedToEmployeeId" UUID,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "completedById" UUID,
    "completedNote" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "incident_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_organisationId_idx" ON "incidents"("organisationId");

-- CreateIndex
CREATE INDEX "incidents_organisationId_status_idx" ON "incidents"("organisationId", "status");

-- CreateIndex
CREATE INDEX "incidents_organisationId_occurredAt_idx" ON "incidents"("organisationId", "occurredAt");

-- CreateIndex
CREATE INDEX "incidents_projectId_occurredAt_idx" ON "incidents"("projectId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_organisationId_reference_key" ON "incidents"("organisationId", "reference");

-- CreateIndex
CREATE INDEX "incident_actions_organisationId_idx" ON "incident_actions"("organisationId");

-- CreateIndex
CREATE INDEX "incident_actions_incidentId_idx" ON "incident_actions"("incidentId");

-- CreateIndex
CREATE INDEX "incident_actions_organisationId_dueAt_idx" ON "incident_actions"("organisationId", "dueAt");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_injuredEmployeeId_fkey" FOREIGN KEY ("injuredEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_investigatedById_fkey" FOREIGN KEY ("investigatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_assignedToEmployeeId_fkey" FOREIGN KEY ("assignedToEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
