-- Bind each subscriber subscription to one explicitly selected destination broker account.
ALTER TABLE "HostSubscription" ADD COLUMN "destinationConnectionId" TEXT;
CREATE INDEX "HostSubscription_destinationConnectionId_idx" ON "HostSubscription"("destinationConnectionId");
ALTER TABLE "HostSubscription" ADD CONSTRAINT "HostSubscription_destinationConnectionId_fkey"
  FOREIGN KEY ("destinationConnectionId") REFERENCES "BrokerConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
