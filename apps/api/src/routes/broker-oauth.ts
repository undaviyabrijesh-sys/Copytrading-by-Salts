import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@salts/database/client";
import { currentUser, assertTrustedOrigin } from "./auth.js";
import { decryptBrokerSecret, encryptBrokerSecret } from "../security/broker-vault.js";
import { buildBrokerCallbackUri } from "../providers/broker-callback.js";

const supported = new Set(["ZERODHA", "UPSTOX", "FYERS", "ANGEL_ONE", "FIVE_PAISA"]);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
function expiryIST(hour: number, minute = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  const target = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), hour, minute));
  if (target <= ist) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - 330 * 60_000);
}
async function payload(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

export async function registerBrokerOAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/brokers/connections/:connectionId/oauth/start", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (!actor.totpEnabled || !actor.mfaVerifiedAt || Date.now() - actor.mfaVerifiedAt.getTime() > 600_000) return reply.code(403).send({ error: "Recent Salts authenticator MFA verification is required." });
    const { connectionId } = request.params as { connectionId: string };
    const connection = await prisma.brokerConnection.findFirst({ where: { id: connectionId, userId: actor.id }, select: { id: true, provider: true, encryptedSecret: true } });
    if (!connection) return reply.code(404).send({ error: "Broker connection not found." });
    if (!supported.has(connection.provider)) return reply.code(409).send({ error: "This broker's secure callback and token exchange are not implemented yet." });
    const base = process.env.BROKER_OAUTH_CALLBACK_BASE;
    if (!base || !base.startsWith("https://")) return reply.code(503).send({ error: "BROKER_OAUTH_CALLBACK_BASE must be configured as a public HTTPS API base URL." });
    const redirectUri = buildBrokerCallbackUri(base, connection.provider);
    const credentials = await decryptBrokerSecret(connection.encryptedSecret);
    const state = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 600_000);
    await prisma.brokerOAuthAttempt.updateMany({ where: { userId: actor.id, provider: connection.provider, usedAt: null }, data: { usedAt: new Date() } });
    await prisma.brokerOAuthAttempt.create({ data: { userId: actor.id, connectionId, provider: connection.provider, stateHash: hash(state), redirectUri, expiresAt } });
    let url: URL;
    let authorizationMethod: "GET" | "POST" = "GET";
    let authorizationFields: Record<string, string> | undefined;
    if (connection.provider === "FIVE_PAISA") {
      if (!credentials.clientId || !credentials.clientSecret || !credentials.userId) return reply.code(422).send({ error: "5paisa AppKey, encryption key and user ID are required." });
      const loginEndpoint = process.env.FIVE_PAISA_OAUTH_URL;
      if (!loginEndpoint) return reply.code(503).send({ error: "FIVE_PAISA_OAUTH_URL must be configured to the official 5paisa login endpoint for the selected environment." });
      let loginUrl: URL;
      try { loginUrl = new URL(loginEndpoint); } catch { return reply.code(503).send({ error: "5paisa login endpoint configuration is invalid." }); }
      if (loginUrl.protocol !== "https:" || !["openapi.5paisa.com", "dev-openapi.5paisa.com"].includes(loginUrl.hostname)) return reply.code(503).send({ error: "5paisa login endpoint must use an official HTTPS 5paisa API host." });
      url = loginUrl;
      authorizationMethod = "POST";
      authorizationFields = { VendorKey: credentials.clientId, ResponseURL: redirectUri, State: state };
    } else if (connection.provider === "ANGEL_ONE") {
      if (!credentials.apiKey) return reply.code(422).send({ error: "Angel One SmartAPI app API key is required." });
      url = new URL("https://smartapi.angelone.in/publisher-login");
      url.search = new URLSearchParams({ api_key: credentials.apiKey, redirect_url: redirectUri, state }).toString();
    } else if (connection.provider === "UPSTOX") {
      if (!credentials.clientId || !credentials.clientSecret) return reply.code(422).send({ error: "Upstox client ID and secret are required." });
      url = new URL("https://api.upstox.com/v2/login/authorization/dialog");
      url.search = new URLSearchParams({ response_type: "code", client_id: credentials.clientId, redirect_uri: redirectUri, state }).toString();
    } else if (connection.provider === "FYERS") {
      if (!credentials.clientId || !credentials.clientSecret) return reply.code(422).send({ error: "FYERS app ID and secret are required." });
      url = new URL("https://api.fyers.in/api/v3/generate-authcode");
      url.search = new URLSearchParams({ client_id: credentials.clientId, redirect_uri: redirectUri, response_type: "code", state }).toString();
    } else {
      if (!credentials.apiKey || !credentials.apiSecret) return reply.code(422).send({ error: "Zerodha API key and secret are required." });
      url = new URL("https://kite.zerodha.com/connect/login");
      url.search = new URLSearchParams({ v: "3", api_key: credentials.apiKey, redirect_params: new URLSearchParams({ state }).toString() }).toString();
    }
    await prisma.auditEvent.create({ data: { actorId: actor.id, tenantId: actor.id, action: "BROKER_OAUTH_STARTED", targetType: "BrokerConnection", targetId: connection.id, requestId: request.id, metadata: { provider: connection.provider, expiresAt: expiresAt.toISOString() } } });
    reply.header("cache-control", "no-store");
    return { authorizationUrl: url.toString(), authorizationMethod, authorizationFields, expiresAt };
  });

  app.get("/api/v1/brokers/oauth/:provider/callback", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer").header("x-robots-tag", "noindex, nofollow");
    const { provider: raw } = request.params as { provider: string };
    const provider = raw.toUpperCase();
    if (!supported.has(provider)) return reply.code(404).send({ error: "Unsupported broker callback." });
    const q = request.query as Record<string, string | undefined>;
    const state = provider === "ZERODHA" ? new URLSearchParams(q.redirect_params ?? "").get("state") ?? undefined : provider === "FIVE_PAISA" ? q.state ?? q.State : q.state;
    const code = provider === "ZERODHA" ? q.request_token : provider === "FYERS" ? q.auth_code : provider === "ANGEL_ONE" ? q.auth_token : provider === "FIVE_PAISA" ? q.RequestToken ?? q.requestToken : q.code;
    const origin = process.env.APP_ORIGIN;
    if (!origin) return reply.code(503).send({ error: "APP_ORIGIN is not configured." });
    const done = (s: string) => reply.redirect(`${origin}/connections?broker=${provider}&oauth=${s}`);
    if (q.error || q.error_description) return done("denied");
    if (!state || !code) return done("invalid_callback");
    const attempt = await prisma.brokerOAuthAttempt.findFirst({ where: { provider, stateHash: hash(state), usedAt: null, expiresAt: { gt: new Date() } } });
    if (!attempt) return done("expired_or_replayed");
    const claimed = await prisma.brokerOAuthAttempt.updateMany({ where: { id: attempt.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return done("expired_or_replayed");
    const connection = await prisma.brokerConnection.findFirst({ where: { id: attempt.connectionId, userId: attempt.userId, provider }, select: { id: true, encryptedSecret: true } });
    if (!connection) return done("connection_missing");
    try {
      const creds = await decryptBrokerSecret(connection.encryptedSecret);
      let token = "", accountId = "", expires = new Date(Date.now() + 60 * 60_000);
      if (provider === "FIVE_PAISA") {
        const r = await fetch("https://Openapi.5paisa.com/VendorsAPI/Service1.svc/GetAccessToken", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ head: { Key: creds.clientId }, body: { RequestToken: code, EncryKey: creds.clientSecret, UserId: creds.userId } }),
          signal: AbortSignal.timeout(12_000), cache: "no-store"
        });
        const d = await payload(r);
        const body = d.body as Record<string, unknown> | undefined;
        const head = d.head as Record<string, unknown> | undefined;
        if (!r.ok || head?.Status !== 0 || typeof body?.AccessToken !== "string" || typeof body.ClientCode !== "string") throw new Error("FIVE_PAISA_TOKEN_EXCHANGE_FAILED");
        token = body.AccessToken; accountId = body.ClientCode; expires = expiryIST(23, 59);
        const encrypted = await encryptBrokerSecret({ ...creds, accessToken: token, accountId });
        await prisma.$transaction([
          prisma.brokerConnection.update({ where: { id: connection.id }, data: { encryptedSecret: encrypted.ciphertext, keyFingerprint: encrypted.fingerprint, status: "CONNECTED", lastHealthAt: new Date(), tokenExpiresAt: expires, permissions: { authentication: "VERIFIED", accountIdentity: "VERIFIED", accountId, tradingPermission: "UNKNOWN", withdrawalPermission: "NOT_VERIFIED", liveExecution: "DISABLED" } } }),
          prisma.auditEvent.create({ data: { actorId: attempt.userId, tenantId: attempt.userId, action: "BROKER_OAUTH_COMPLETED", targetType: "BrokerConnection", targetId: connection.id, requestId: request.id, metadata: { provider, accountId, tokenExpiresAt: expires.toISOString(), tradingPermission: "UNKNOWN" } } })
        ]);
        return done("connected");
      } else if (provider === "ANGEL_ONE") {
        const feedToken = q.feed_token;
        if (!feedToken) throw new Error("ANGEL_ONE_FEED_TOKEN_MISSING");
        const pr = await fetch("https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile", {
          headers: {
            Authorization: `Bearer ${code}`, "X-PrivateKey": creds.apiKey!,
            "X-UserType": "USER", "X-SourceID": "WEB", Accept: "application/json"
          },
          signal: AbortSignal.timeout(10_000), cache: "no-store"
        });
        const pd = await payload(pr);
        const data = pd.data as Record<string, unknown> | undefined;
        if (!pr.ok || pd.status !== true || typeof data?.clientcode !== "string") throw new Error("ANGEL_ONE_PROFILE_FAILED");
        token = code; accountId = data.clientcode; expires = expiryIST(0);
        const encrypted = await encryptBrokerSecret({ ...creds, accessToken: token, feedToken, accountId });
        await prisma.$transaction([
          prisma.brokerConnection.update({ where: { id: connection.id }, data: { encryptedSecret: encrypted.ciphertext, keyFingerprint: encrypted.fingerprint, status: "CONNECTED", lastHealthAt: new Date(), tokenExpiresAt: expires, permissions: { authentication: "VERIFIED", accountIdentity: "VERIFIED", accountId, tradingPermission: "UNKNOWN", withdrawalPermission: "NOT_VERIFIED", liveExecution: "DISABLED" } } }),
          prisma.auditEvent.create({ data: { actorId: attempt.userId, tenantId: attempt.userId, action: "BROKER_OAUTH_COMPLETED", targetType: "BrokerConnection", targetId: connection.id, requestId: request.id, metadata: { provider, accountId, tokenExpiresAt: expires.toISOString(), tradingPermission: "UNKNOWN" } } })
        ]);
        return done("connected");
      } else if (provider === "UPSTOX") {
        const form = new URLSearchParams({ code, client_id: creds.clientId!, client_secret: creds.clientSecret!, redirect_uri: attempt.redirectUri, grant_type: "authorization_code" });
        const r = await fetch("https://api.upstox.com/v2/login/authorization/token", { method: "POST", headers: { accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(12_000), cache: "no-store" });
        const d = await payload(r);
        if (!r.ok || typeof d.access_token !== "string") throw new Error("UPSTOX_TOKEN_EXCHANGE_FAILED");
        token = d.access_token;
        const pr = await fetch("https://api.upstox.com/v2/user/profile", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
        const pd = await payload(pr); const data = pd.data as Record<string, unknown> | undefined;
        if (!pr.ok || typeof data?.user_id !== "string") throw new Error("UPSTOX_PROFILE_FAILED");
        accountId = data.user_id; expires = expiryIST(3, 30);
      } else if (provider === "FYERS") {
        const appIdHash = hash(`${creds.clientId}:${creds.clientSecret}`);
        const r = await fetch("https://api-t1.fyers.in/api/v3/validate-authcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", appIdHash, code }), signal: AbortSignal.timeout(12_000), cache: "no-store" });
        const d = await payload(r);
        if (!r.ok || d.s !== "ok" || typeof d.access_token !== "string") throw new Error("FYERS_TOKEN_EXCHANGE_FAILED");
        token = d.access_token;
        const pr = await fetch("https://api-t1.fyers.in/api/v3/profile", { headers: { Authorization: `${creds.clientId}:${token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
        const pd = await payload(pr); const data = pd.data as Record<string, unknown> | undefined;
        if (!pr.ok || pd.s !== "ok" || typeof data?.fy_id !== "string") throw new Error("FYERS_PROFILE_FAILED");
        accountId = data.fy_id; expires = expiryIST(6, 30);
      } else {
        const checksum = hash(`${creds.apiKey}${code}${creds.apiSecret}`);
        const form = new URLSearchParams({ api_key: creds.apiKey!, request_token: code, checksum });
        const r = await fetch("https://api.kite.trade/session/token", { method: "POST", headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(12_000), cache: "no-store" });
        const d = await payload(r); const data = d.data as Record<string, unknown> | undefined;
        if (!r.ok || d.status !== "success" || typeof data?.access_token !== "string" || typeof data.user_id !== "string") throw new Error("ZERODHA_TOKEN_EXCHANGE_FAILED");
        token = data.access_token; accountId = data.user_id; expires = expiryIST(6);
      }
      const encrypted = await encryptBrokerSecret({ ...creds, accessToken: token, accountId });
      await prisma.$transaction([
        prisma.brokerConnection.update({ where: { id: connection.id }, data: { encryptedSecret: encrypted.ciphertext, keyFingerprint: encrypted.fingerprint, status: "CONNECTED", lastHealthAt: new Date(), tokenExpiresAt: expires, permissions: { authentication: "VERIFIED", accountIdentity: "VERIFIED", accountId, tradingPermission: "UNKNOWN", withdrawalPermission: "NOT_VERIFIED", liveExecution: "DISABLED" } } }),
        prisma.auditEvent.create({ data: { actorId: attempt.userId, tenantId: attempt.userId, action: "BROKER_OAUTH_COMPLETED", targetType: "BrokerConnection", targetId: connection.id, requestId: request.id, metadata: { provider, accountId, tokenExpiresAt: expires.toISOString(), tradingPermission: "UNKNOWN" } } })
      ]);
      return done("connected");
    } catch (e) {
      const code = e instanceof Error ? e.message : "BROKER_OAUTH_FAILED";
      await prisma.brokerConnection.update({ where: { id: connection.id }, data: { status: "ERROR", lastHealthAt: new Date(), permissions: { authentication: "FAILED", tradingPermission: "UNKNOWN", withdrawalPermission: "NOT_VERIFIED", liveExecution: "DISABLED" } } });
      await prisma.auditEvent.create({ data: { actorId: attempt.userId, tenantId: attempt.userId, action: "BROKER_OAUTH_FAILED", targetType: "BrokerConnection", targetId: connection.id, requestId: request.id, metadata: { provider, failureCode: code } } });
      request.log.warn({ provider, connectionId: connection.id, failureCode: code }, "Broker OAuth failed");
      return done("failed");
    }
  });
}
