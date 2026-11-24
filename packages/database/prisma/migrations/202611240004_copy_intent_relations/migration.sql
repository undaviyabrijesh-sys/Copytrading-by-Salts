-- Enforce tenant ownership and preserve intent history if a destination account is removed.
ALTER TABLE "CopyIntent" ADD CONSTRAINT "CopyIntent_subscriberId_fkey"
  FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CopyIntent" ADD CONSTRAINT "CopyIntent_destinationConnectionId_fkey"
  FOREIGN KEY ("destinationConnectionId") REFERENCES "BrokerConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
