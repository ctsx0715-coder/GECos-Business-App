-- The tenancy extension refuses an upsert whose unique key cannot be pinned to
-- one organisation. Leading the key with organisationId satisfies that guard.
DROP INDEX "leave_balances_employeeId_leaveTypeId_cycleStartsAt_key";

CREATE UNIQUE INDEX "leave_balances_organisationId_employeeId_leaveTypeId_cycleS_key" ON "leave_balances"("organisationId", "employeeId", "leaveTypeId", "cycleStartsAt");
