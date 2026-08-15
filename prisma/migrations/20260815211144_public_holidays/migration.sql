-- CreateTable
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "observedOn" TIMESTAMPTZ(6) NOT NULL,
    "name" TEXT NOT NULL,
    "isStatutory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_holidays_organisationId_idx" ON "public_holidays"("organisationId");

-- CreateIndex
CREATE INDEX "public_holidays_organisationId_observedOn_idx" ON "public_holidays"("organisationId", "observedOn");

-- CreateIndex
CREATE UNIQUE INDEX "public_holidays_organisationId_observedOn_key" ON "public_holidays"("organisationId", "observedOn");

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
