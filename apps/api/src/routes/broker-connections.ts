import type { FastifyInstance } from "fastify";
import { prisma } from "@salts/database/client";
import { currentUser, assertTrustedOrigin } from "./auth.js";
import { credentialProviders } from "../providers/credential-providers.js";
import { decryptBrokerSecret, encryptBrokerSecret } from "../security/broker-vault.js";
import { verifyDeltaAccount } from "../providers/delta-auth.js";
import { verifyGrowwAccount } from "../providers/groww-auth.js";

export async function registerBrokerConnectionRoutes(app: FastifyInstance) {
  app.get("/api/v1/brokers/connections", async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    reply.header("cache-control", "no-store");
    const connections = await prisma.brokerConnection.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, market: true, provider: true, label: true, status: true, createdAt: true, lastHealthAt: true, tokenExpiresAt: true }
    });
    return { connections };
  });

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
        credentials: { type: "object", minProperties: 1, maxProperties: 5, additionalProperties: { type: "string", minLength: 1, maxLength: 8192 } }
      }
    } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (!actor.totpEnabled || !actor.mfaVerifiedAt || Date.now() - actor.mfaVerifiedAt.getTime() > 10 * 60 * 1000) return reply.code(403).send({ error: "Enable authenticator MFA and complete a recent MFA verification before saving broker credentials." });
    const body = request.body as { provider: string; label: string; credentials: Record<string, string> };
    const provider = credentialProviders.find(item => item.id === body.provider);
    if (!provider) return reply.code(400).send({ error: "Unknown broker provider." });
    if (!provider.connectEnabled || provider.fields.length === 0) return reply.code(409).send({ error: "Secure credential intake is not configured for this provider." });
    const supplied = Object.keys(body.credentials);
    const allowed = new Set(provider.fields.map(field => field.key));
    if (supplied.some(key => !allowed.has(key)) || supplied.length !== allowed.size || [...allowed].some(key => !Object.hasOwn(body.credentials, key))) {
      return reply.code(400).send({ error: "Submit every required credential field using this provider's exact field contract. Unknown or missing fields are rejected." });
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
    return reply.code(201).send({ connection, message: "Credentials encrypted and saved. This is credential intake only; connection remains PENDING until provider-specific authentication, account identity and permissions are verified." });
  });

  app.post("/api/v1/brokers/connections/:connectionId/verify", {
    config: { rateLimit: { max: 3, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (!actor.totpEnabled || !actor.mfaVerifiedAt || Date.now() - actor.mfaVerifiedAt.getTime() > 10 * 60 * 1000) {
      return reply.code(403).send({ error: "Recent authenticator MFA verification is required to verify a broker connection." });
    }
    const { connectionId } = request.params as { connectionId: string };
    const connection = await prisma.brokerConnection.findFirst({
      where: { id: connectionId, userId: actor.id },
      select: { id: true, provider: true, market: true, encryptedSecret: true }
    });
    if (!connection) return reply.code(404).send({ error: "Broker connection not found." });
    if (!((connection.provider === "DELTA_INDIA" && connection.market === "CRYPTO") || (connection.provider === "GROWW" && connection.market === "INDIA"))) {
      return reply.code(409).send({ error: "Provider-specific verification is not implemented for this broker yet. Credentials remain encrypted and the connection is not marked connected." });
    }

    try {
      const credentials = await decryptBrokerSecret(connection.encryptedSecret);
      let identity: Record<string, unknown>;
      let expiresAt: Date | null = null;
      if (connection.provider === "DELTA_INDIA") {
        await verifyDeltaAccount(credentials);
        identity = { authentication: "VERIFIED", accountIdentity: "AUTHENTICATED_BY_SIGNED_ACCOUNT_ENDPOINT" };
      } else {
        const profile = await verifyGrowwAccount(credentials.accessToken ?? "");
        identity = { authentication: "VERIFIED", accountIdentity: "VERIFIED", accountId: profile.accountId, ucc: profile.ucc, activeSegments: profile.segments };
        const now = new Date();
        const ist = new Date(now.getTime() + 330 * 60_000);
        const nextSix = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 0));
        if (nextSix <= ist) nextSix.setUTCDate(nextSix.getUTCDate() + 1);
        expiresAt = new Date(nextSix.getTime() - 330 * 60_000);
      }
      const now = new Date();
      await prisma.$transaction([
        prisma.brokerConnection.update({
          where: { id: connection.id },
          data: {
            status: "CONNECTED", lastHealthAt: now, tokenExpiresAt: expiresAt,
            permissions: { ...identity, tradingPermission: "UNKNOWN", withdrawalPermission: "NOT_VERIFIED", liveExecution: "DISABLED" }
          }
        }),
        prisma.auditEvent.create({
          data: {
            actorId: actor.id, tenantId: actor.id, action: "BROKER_CONNECTION_AUTHENTICATED",
            targetType: "BrokerConnection", targetId: connection.id, requestId: request.id,
            metadata: { provider: connection.provider, market: connection.market, verification: connection.provider === "DELTA_INDIA" ? "SIGNED_READ_ONLY_ACCOUNT_ENDPOINT" : "GROWW_READ_ONLY_USER_PROFILE" }
          }
        })
      ]);
      reply.header("cache-control", "no-store");
      return { ok: true, status: "CONNECTED", message: `${connection.provider} account authentication succeeded. Trading permissions remain unverified and live execution stays disabled.` };
    } catch (error) {
      const code = error instanceof Error ? error.message : "BROKER_PROVIDER_UNAVAILABLE";
      const safeErrors: Record<string, string> = {
        DELTA_CREDENTIALS_INCOMPLETE: "The saved Delta API key/secret pair is incomplete. Replace the credentials.",
        DELTA_AUTHENTICATION_FAILED: "Delta rejected the API key or signature. Check that these are Delta India production credentials.",
        DELTA_IP_OR_PERMISSION_CHECK_FAILED: "Delta rejected the request because the egress IP may not be allowlisted or the key lacks read permission.",
        DELTA_RATE_LIMITED: "Delta rate limit reached. Wait before retrying.",
        DELTA_PROVIDER_UNAVAILABLE: "Delta account verification is temporarily unavailable. Try again later.",
        GROWW_TOKEN_MISSING: "The saved Groww access token is missing. Generate a fresh token in Groww Trading APIs.",
        GROWW_AUTHENTICATION_FAILED: "Groww rejected the access token. Generate a fresh daily token.",
        GROWW_RATE_LIMITED: "Groww rate limit reached. Wait before retrying.",
        GROWW_PROVIDER_UNAVAILABLE: "Groww account verification is temporarily unavailable. Try again later."
      };
      await prisma.brokerConnection.update({
        where: { id: connection.id },
        data: { status: "ERROR", lastHealthAt: new Date(), permissions: { authentication: "FAILED", tradingPermission: "UNKNOWN", withdrawalPermission: "NOT_VERIFIED", liveExecution: "DISABLED" } }
      });
      await prisma.auditEvent.create({
        data: {
          actorId: actor.id, tenantId: actor.id, action: "BROKER_CONNECTION_AUTHENTICATION_FAILED",
          targetType: "BrokerConnection", targetId: connection.id, requestId: request.id,
          metadata: { provider: connection.provider, market: connection.market, failureCode: code }
        }
      });
      request.log.warn({ provider: connection.provider, failureCode: code, connectionId: connection.id }, "Broker account verification failed");
      return reply.code(422).send({ error: safeErrors[code] ?? "Broker verification failed. Credentials remain encrypted." });
    }
  });

  app.delete("/api/v1/brokers/connections/:connectionId", async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (!actor.totpEnabled || !actor.mfaVerifiedAt || Date.now() - actor.mfaVerifiedAt.getTime() > 10 * 60 * 1000) return reply.code(403).send({ error: "Recent authenticator MFA verification is required to disconnect a broker account." });
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
