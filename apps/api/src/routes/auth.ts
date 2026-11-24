import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "@salts/database/client";
import { hashOpaqueToken, issueOpaqueToken } from "../security/opaque-tokens.js";
import { decryptTotpSecret, newTotpSecret, totpProvisioningUri, verifyTotp } from "../security/totp.js";

const SESSION_COOKIE = "salts_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type SafeUser = { id: string; email: string; displayName: string; status: "ACTIVE"; roles: string[]; totpEnabled: boolean; sessionId: string; mfaVerifiedAt: Date | null };

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(value.join("=")); } catch { return null; }
    }
  }
  return null;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(reply: FastifyReply) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", `${SESSION_COOKIE}=; Path=/api/v1; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function assertTrustedOrigin(request: FastifyRequest) {
  const expected = process.env.APP_ORIGIN;
  const origin = request.headers.origin;
  if (!expected || !origin || origin !== expected) {
    throw Object.assign(new Error("Request origin is not allowed."), { statusCode: 403 });
  }
}

export async function currentUser(request: FastifyRequest): Promise<SafeUser | null> {
  const token = cookieValue(request.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  let tokenHash: string;
  try { tokenHash = hashOpaqueToken(token); } catch { return null; }
  const session = await prisma.session.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: "ACTIVE" } },
    select: { id: true, mfaVerifiedAt: true, user: { select: { id: true, email: true, displayName: true, status: true, roles: true, totpEnabled: true } } }
  });
  if (!session) return null;
  void prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return { ...session.user, sessionId: session.id, mfaVerifiedAt: session.mfaVerifiedAt };
}

async function createSession(userId: string, reply: FastifyReply, mfaVerifiedAt: Date | null = null) {
  const issued = issueOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, tokenHash: issued.tokenHash, expiresAt, mfaVerifiedAt } });
  setSessionCookie(reply, issued.token, expiresAt);
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
    schema: { body: {
      type: "object", additionalProperties: false,
      required: ["email", "password"],
      properties: { email: { type: "string", maxLength: 254 }, password: { type: "string", minLength: 1, maxLength: 1024 }, totpCode: { type: "string", pattern: "^[0-9]{6}$" } }
    } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const body = request.body as { email: string; password: string; totpCode?: string };
    const email = body.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "ACTIVE" || !(await argon2.verify(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }
    let mfaVerifiedAt: Date | null = null;
    if (user.totpEnabled) {
      if (!body.totpCode || !user.totpSecretEncrypted || !verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), body.totpCode)) {
        return reply.code(401).send({ error: "A valid authenticator code is required." });
      }
      mfaVerifiedAt = new Date();
    }
    await createSession(user.id, reply, mfaVerifiedAt);
    return { user: { id: user.id, email: user.email, displayName: user.displayName, roles: user.roles, totpEnabled: user.totpEnabled } };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    assertTrustedOrigin(request);
    const token = cookieValue(request.headers.cookie, SESSION_COOKIE);
    if (token) {
      try {
        await prisma.session.updateMany({ where: { tokenHash: hashOpaqueToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
      } catch { /* Invalid cookie is treated as already logged out. */ }
    }
    clearSessionCookie(reply);
    return { ok: true };
  });


  app.post("/api/v1/auth/mfa/enroll", { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (actor.totpEnabled) return reply.code(409).send({ error: "MFA is already enabled." });
    const generated = newTotpSecret();
    reply.header("cache-control", "no-store");
    await prisma.user.update({ where: { id: actor.id }, data: { totpSecretEncrypted: generated.encrypted } });
    return {
      setupRequired: true,
      secret: generated.secret,
      provisioningUri: totpProvisioningUri(generated.secret, actor.email),
      instruction: "Add this account to an authenticator app, then confirm with the current six-digit code. This secret is shown only once."
    };
  });

  app.post("/api/v1/auth/mfa/verify-enrollment", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: { body: { type: "object", additionalProperties: false, required: ["code"], properties: { code: { type: "string", pattern: "^[0-9]{6}$" } } } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const body = request.body as { code: string };
    const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { totpSecretEncrypted: true, totpEnabled: true } });
    if (!user?.totpSecretEncrypted || user.totpEnabled || !verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), body.code)) {
      return reply.code(400).send({ error: "Authenticator code is invalid or enrollment is not pending." });
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: actor.id }, data: { totpEnabled: true } }),
      prisma.session.update({ where: { id: actor.sessionId }, data: { mfaVerifiedAt: now } })
    ]);
    return { ok: true, mfaEnabled: true };
  });

  app.post("/api/v1/auth/mfa/verify-session", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: { body: { type: "object", additionalProperties: false, required: ["code"], properties: { code: { type: "string", pattern: "^[0-9]{6}$" } } } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const body = request.body as { code: string };
    const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { totpSecretEncrypted: true, totpEnabled: true } });
    if (!user?.totpEnabled || !user.totpSecretEncrypted || !verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), body.code)) {
      return reply.code(401).send({ error: "Authenticator code is invalid." });
    }
    const verifiedAt = new Date();
    await prisma.session.update({ where: { id: actor.sessionId }, data: { mfaVerifiedAt: verifiedAt } });
    return { ok: true, mfaVerifiedAt: verifiedAt };
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required." });
    return { user: { id: user.id, email: user.email, displayName: user.displayName, roles: user.roles, totpEnabled: user.totpEnabled } };
  });

  app.post("/api/v1/admin/invites", {
    config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    schema: { body: {
      type: "object", additionalProperties: false,
      properties: { expiresInDays: { type: "integer", minimum: 1, maximum: 14, default: 7 } }
    } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (!actor.roles.includes("ADMIN")) return reply.code(403).send({ error: "Administrator permission required." });
    if (!actor.totpEnabled || !actor.mfaVerifiedAt || Date.now() - actor.mfaVerifiedAt.getTime() > 10 * 60 * 1000) return reply.code(403).send({ error: "Recent MFA verification is required for administrator actions." });
    const body = (request.body ?? {}) as { expiresInDays?: number };
    const expiresInDays = body.expiresInDays ?? 7;
    const issued = issueOpaqueToken();
    const invite = await prisma.invite.create({
      data: { tokenHash: issued.tokenHash, createdById: actor.id, expiresAt: new Date(Date.now() + expiresInDays * 86400000) },
      select: { id: true, expiresAt: true, createdAt: true }
    });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, action: "INVITE_CREATED", targetType: "Invite", targetId: invite.id, requestId: randomBytes(12).toString("hex") }
    });
    reply.header("cache-control", "no-store");
    return reply.code(201).send({ invite: { ...invite, token: issued.token } });
  });

  app.post("/api/v1/auth/redeem-invite", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    schema: { body: {
      type: "object", additionalProperties: false,
      required: ["token", "email", "displayName", "password"],
      properties: {
        token: { type: "string", minLength: 40, maxLength: 256 },
        email: { type: "string", minLength: 3, maxLength: 254 },
        displayName: { type: "string", minLength: 2, maxLength: 80 },
        password: { type: "string", minLength: 16, maxLength: 1024 }
      }
    } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const body = request.body as { token: string; email: string; displayName: string; password: string };
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "A valid email is required." });
    const tokenHash = hashOpaqueToken(body.token);
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const sessionToken = issueOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    try {
      const user = await prisma.$transaction(async (tx) => {
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
          throw Object.assign(new Error("This email is already registered."), { statusCode: 409 });
        }
        const claimed = await tx.invite.updateMany({
          where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() }
        });
        if (claimed.count !== 1) throw Object.assign(new Error("Invite is invalid, expired, or already used."), { statusCode: 400 });
        const created = await tx.user.create({
          data: { email, displayName: body.displayName.trim(), passwordHash, status: "ACTIVE", roles: ["SUBSCRIBER"] },
          select: { id: true, email: true, displayName: true, roles: true }
        });
        await tx.invite.updateMany({ where: { tokenHash }, data: { usedById: created.id } });
        await tx.session.create({ data: { userId: created.id, tokenHash: sessionToken.tokenHash, expiresAt } });
        return created;
      }, { isolationLevel: "Serializable" });
      setSessionCookie(reply, sessionToken.token, expiresAt);
      return reply.code(201).send({ user });
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : 400;
      const message = error instanceof Error ? error.message : "Invite redemption failed.";
      return reply.code(statusCode >= 400 && statusCode < 500 ? statusCode : 400).send({ error: message });
    }
  });
}
