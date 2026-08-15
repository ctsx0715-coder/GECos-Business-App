-- CreateEnum
CREATE TYPE "LeaveAccrualMethod" AS ENUM ('MANUAL', 'ANNUAL_GRANT', 'MONTHLY_ACCRUAL');

-- AlterTable
ALTER TABLE "leave_balances" ADD COLUMN     "accruedThroughAt" TIMESTAMPTZ(6),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "accrualDaysPerPeriod" DECIMAL(6,2),
ADD COLUMN     "accrualMethod" "LeaveAccrualMethod" NOT NULL DEFAULT 'MANUAL';
