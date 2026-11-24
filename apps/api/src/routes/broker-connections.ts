import type { FastifyInstance } from "fastify";
import { prisma } from "@salts/database/client";
import { currentUser, assertTrustedOrigin } from "./auth.js";
import { credentialProviders } from "../providers/credential-providers.js";
import { encryptBrokerSecret } from "../security/broker-vault.js";

export async function registerBrokerConnectionRoutes(app: FastifyInstance) {
  app.get("/api/v1/brokers/providers", async () => ({
    providers: credentialProviders.map(({ id, label, market, auth, fields, docsUrl, connectEnabled, note }) => ({
      id, label, market, auth, fields: fields.map(({ key, label }) => ({ key, label, type: "password" })),
      docsUrl, connectEnabled, note
    }))
  }));

  app.post("/api/v1/brokers/connections", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: { body: {
      type: "object", additionalProperties: false, required: ["provider", "label", "credentials"],
      properties: {
        provider: { type: "string", minLength: 2, maxLength: 40 },
        label: { type: "string", minLength: 2, maxLength: 60 },
        credentials: { type: "object", minProperties: 1, maxProperties: 4, additionalProperties: { type: "string", minLength: 1, maxLength: 8192 } }
      }
    } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const body = request.body as { provider: string; label: string; credentials: Record<string, string> };
    const provider = credentialProviders.find(item => item.id === body.provider);
    if (!provider) return reply.code(400).send({ error: "Unknown broker provider." });
    if (!provider.connectEnabled) return reply.code(409).send({ error: "This provider requires an OAuth or broker-approved connection flow that is not enabled yet." });
    const supplied = Object.keys(body.credentials).sort();
    const required = provider.fields.map(field => field.key).sort();
    if (supplied.length !== required.length || supplied.some((key, index) => key !== required[index])) {
      return reply.code(400).send({ error: "Credential fields do not match this provider's required fields." });
    }
    if (Object.values(body.credentials).some(value => !value.trim())) return reply.code(400).send({ error: "Credential values cannot be empty." });
    let encrypted;
    try { encrypted = await encryptBrokerSecret(body.credentials); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "BROKER_VAULT_NOT_CONFIGURED") return reply.code(503).send({ error: "Secure broker vault is not configured. No credentials were stored." });
      request.log.error({ err: error }, "Broker credential encryption failed");
      return reply.code(503).send({ error: "Secure credential storage is temporarily unavailable. No credentials were stored." });
    }
    const connection = await prisma.brokerConnection.create({
      data: {
        userId: actor.id, market: provider.market, provider: provider.id, label: body.label.trim(),
        encryptedSecret: encrypted.ciphertext, keyFingerprint: encrypted.fingerprint,
        permissions: { scopeStatus: "UNKNOWN", verified: false, withdrawals: "NOT_VERIFIED" },
        status: "PENDING"
      },
      select: { id: true, market: true, provider: true, label: true, status: true, createdAt: true }
    });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, tenantId: actor.id, action: "BROKER_CONNECTION_CREDENTIALS_SAVED", targetType: "BrokerConnection", targetId: connection.id, requestId: request.id, metadata: { provider: provider.id, market: provider.market, vault: "AWS_KMS_ENVELOPE" } }
    });
    reply.header("cache-control", "no-store");
    return reply.code(201).send({ connection, message: "Credentials encrypted and saved. Connection remains pending until account identity and provider permissions are verified." });
  });

  app.delete("/api/v1/brokers/connections/:connectionId", async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const { connectionId } = request.params as { connectionId: string };
    const existing = await prisma.brokerConnection.findFirst({ where: { id: connectionId, userId: actor.id }, select: { id: true, provider: true, market: true } });
    if (!existing) return reply.code(404).send({ error: "Broker connection not found." });
    await prisma.$transaction([
      prisma.hostSubscription.updateMany({ where: { subscriberId: actor.id, destinationConnectionId: existing.id }, data: { destinationConnectionId: null, status: "PAUSED" } }),
      prisma.brokerConnection.delete({ where: { id: existing.id } }),
      prisma.auditEvent.create({ data: { actorId: actor.id, tenantId: actor.id, action: "BROKER_CONNECTION_DELETED", targetType: "BrokerConnection", targetId: existing.id, requestId: request.id, metadata: { provider: existing.provider, market: existing.market } } })
    ]);
    return { ok: true };
  });
}
