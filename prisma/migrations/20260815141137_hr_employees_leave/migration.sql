-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'FIXED_TERM', 'TEMPORARY', 'CONTRACTOR', 'APPRENTICE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationalId" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "managerId" UUID,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "endedAt" TIMESTAMPTZ(6),
    "exitReason" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "daysPerCycle" DECIMAL(6,2),
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "carryOverMaxDays" DECIMAL(6,2),
    "documentRequiredAfterDays" INTEGER,
    "allowsBackdating" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "cycleStartsAt" TIMESTAMPTZ(6) NOT NULL,
    "cycleEndsAt" TIMESTAMPTZ(6) NOT NULL,
    "entitledDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "broughtForwardDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "takenDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "decisionComment" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_organisationId_idx" ON "employees"("organisationId");

-- CreateIndex
CREATE INDEX "employees_organisationId_status_idx" ON "employees"("organisationId", "status");

-- CreateIndex
CREATE INDEX "employees_managerId_idx" ON "employees"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organisationId_employeeNumber_key" ON "employees"("organisationId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "leave_types_organisationId_idx" ON "leave_types"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organisationId_code_key" ON "leave_types"("organisationId", "code");

-- CreateIndex
CREATE INDEX "leave_balances_organisationId_idx" ON "leave_balances"("organisationId");

-- CreateIndex
CREATE INDEX "leave_balances_organisationId_employeeId_idx" ON "leave_balances"("organisationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employeeId_leaveTypeId_cycleStartsAt_key" ON "leave_balances"("employeeId", "leaveTypeId", "cycleStartsAt");

-- CreateIndex
CREATE INDEX "leave_requests_organisationId_idx" ON "leave_requests"("organisationId");

-- CreateIndex
CREATE INDEX "leave_requests_organisationId_status_idx" ON "leave_requests"("organisationId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_startsAt_idx" ON "leave_requests"("employeeId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_organisationId_reference_key" ON "leave_requests"("organisationId", "reference");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
