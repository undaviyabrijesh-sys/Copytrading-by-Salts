
-- Durable per-subscriber fan-out intents. This records routing work only;
-- no broker order is submitted by this migration or the intake endpoint.
CREATE TYPE "CopyIntentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'ELIGIBLE', 'SKIPPED', 'COMPLETED', 'FAILED');
CREATE TABLE "CopyIntent" (
  "id" TEXT NOT NULL,
  "signalId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "subscriberId" TEXT NOT NULL,
  "destinationConnectionId" TEXT,
  "status" "CopyIntentStatus" NOT NULL DEFAULT 'QUEUED',
  "decisionCode" TEXT,
  "decisionReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CopyIntent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CopyIntent_signalId_subscriptionId_key" ON "CopyIntent"("signalId", "subscriptionId");
CREATE INDEX "CopyIntent_status_availableAt_createdAt_idx" ON "CopyIntent"("status", "availableAt", "createdAt");
CREATE INDEX "CopyIntent_subscriberId_status_createdAt_idx" ON "CopyIntent"("subscriberId", "status", "createdAt");
CREATE INDEX "CopyIntent_subscriptionId_status_idx" ON "CopyIntent"("subscriptionId", "status");
ALTER TABLE "CopyIntent" ADD CONSTRAINT "CopyIntent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyIntent" ADD CONSTRAINT "CopyIntent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "HostSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
