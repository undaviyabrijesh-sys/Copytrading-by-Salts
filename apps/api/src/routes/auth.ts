import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "@salts/database/client";
import { hashOpaqueToken, issueOpaqueToken } from "../security/opaque-tokens.js";

const SESSION_COOKIE = "salts_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type SafeUser = { id: string; email: string; displayName: string; roles: string[]; totpEnabled: boolean };

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
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

function assertTrustedOrigin(request: FastifyRequest) {
  const expected = process.env.APP_ORIGIN;
  const origin = request.headers.origin;
  if (!expected || !origin || origin !== expected) {
    throw Object.assign(new Error("Request origin is not allowed."), { statusCode: 403 });
  }
}

async function currentUser(request: FastifyRequest): Promise<SafeUser | null> {
  const token = cookieValue(request.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  let tokenHash: string;
  try { tokenHash = hashOpaqueToken(token); } catch { return null; }
  const session = await prisma.session.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() }, user: { status: "ACTIVE" } },
    select: { id: true, user: { select: { id: true, email: true, displayName: true, roles: true, totpEnabled: true } } }
  });
  if (!session) return null;
  void prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return session.user;
}

async function createSession(userId: string, reply: FastifyReply) {
  const issued = issueOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, tokenHash: issued.tokenHash, expiresAt } });
  setSessionCookie(reply, issued.token, expiresAt);
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
    schema: { body: {
      type: "object", additionalProperties: false,
      required: ["email", "password"],
      properties: { email: { type: "string", maxLength: 254 }, password: { type: "string", minLength: 1, maxLength: 1024 } }
    } }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const body = request.body as { email: string; password: string };
    const email = body.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "ACTIVE" || !(await argon2.verify(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }
    await createSession(user.id, reply);
    return { user: { id: user.id, email: user.email, displayName: user.displayName, roles: user.roles } };
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

  app.get("/api/v1/auth/me", async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required." });
    return { user };
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
    if (!actor.totpEnabled) return reply.code(403).send({ error: "MFA enrollment is required before administrator actions are enabled." });
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
    if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email)) return reply.code(400).send({ error: "A valid email is required." });
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
