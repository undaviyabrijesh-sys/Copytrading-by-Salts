CREATE TABLE "BrokerOAuthAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "BrokerOAuthAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BrokerOAuthAttempt_stateHash_key" ON "BrokerOAuthAttempt"("stateHash");
CREATE INDEX "BrokerOAuthAttempt_userId_provider_createdAt_idx" ON "BrokerOAuthAttempt"("userId", "provider", "createdAt");
CREATE INDEX "BrokerOAuthAttempt_connectionId_expiresAt_idx" ON "BrokerOAuthAttempt"("connectionId", "expiresAt");
CREATE INDEX "BrokerOAuthAttempt_expiresAt_usedAt_idx" ON "BrokerOAuthAttempt"("expiresAt", "usedAt");
