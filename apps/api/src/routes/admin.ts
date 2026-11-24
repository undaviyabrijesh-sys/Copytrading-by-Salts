import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma } from "@salts/database/client";
import { assertTrustedOrigin, currentUser } from "./auth.js";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const actor = await currentUser(request);
  if (!actor) { reply.code(401).send({ error: "Authentication required." }); return null; }
  if (!actor.roles.includes("ADMIN")) { reply.code(403).send({ error: "Administrator permission required." }); return null; }
  if (!actor.totpEnabled || !actor.mfaVerifiedAt || Date.now() - actor.mfaVerifiedAt.getTime() > 10 * 60 * 1000) {
    reply.code(403).send({ error: "Recent MFA verification is required for administrator actions." });
    return null;
  }
  return actor;
}

function audit(actorId: string, action: string, targetType: string, targetId: string) {
  return prisma.auditEvent.create({
    data: { actorId, action, targetType, targetId, requestId: randomBytes(12).toString("hex") }
  });
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/users", async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const users = await prisma.user.findMany({
      select: { id: true, email: true, displayName: true, status: true, roles: true, totpEnabled: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return { users };
  });

  app.patch("/api/v1/admin/users/:userId/roles", {
    schema: {
      params: { type: "object", required: ["userId"], properties: { userId: { type: "string", minLength: 1 } } },
      body: { type: "object", additionalProperties: false, required: ["roles"], properties: {
        roles: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: ["SUBSCRIBER", "HOST"] } }
      } }
    }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const { userId } = request.params as { userId: string };
    if (userId === actor.id) return reply.code(400).send({ error: "Use a separate approved administrator to change your own roles." });
    const body = request.body as { roles: ("SUBSCRIBER" | "HOST")[] };
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return reply.code(404).send({ error: "User not found." });
    const user = await prisma.user.update({
      where: { id: userId },
      data: { roles: body.roles },
      select: { id: true, email: true, displayName: true, roles: true, status: true }
    });
    await audit(actor.id, "USER_ROLES_UPDATED", "User", userId);
    return { user };
  });

  app.patch("/api/v1/admin/users/:userId/status", {
    schema: {
      params: { type: "object", required: ["userId"], properties: { userId: { type: "string", minLength: 1 } } },
      body: { type: "object", additionalProperties: false, required: ["status"], properties: {
        status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] }
      } }
    }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const { userId } = request.params as { userId: string };
    if (userId === actor.id) return reply.code(400).send({ error: "You cannot change your own account status." });
    const body = request.body as { status: "ACTIVE" | "SUSPENDED" };
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return reply.code(404).send({ error: "User not found." });
    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: body.status },
      select: { id: true, email: true, displayName: true, status: true, roles: true }
    });
    if (body.status === "SUSPENDED") {
      await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(actor.id, "USER_STATUS_UPDATED", "User", userId);
    return { user };
  });


  app.get("/api/v1/admin/listings", async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const listings = await prisma.hostListing.findMany({
      where: { status: { not: "REMOVED" } },
      select: {
        id: true, hostUserId: true, market: true, title: true, status: true,
        updatedAt: true, host: { select: { displayName: true, email: true } },
        _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } }
      },
      orderBy: { updatedAt: "desc" }, take: 200
    });
    return { listings };
  });

  app.patch("/api/v1/admin/listings/:listingId/moderation", {
    schema: {
      params: { type: "object", required: ["listingId"], properties: { listingId: { type: "string", minLength: 1 } } },
      body: { type: "object", additionalProperties: false, required: ["action"], properties: {
        action: { type: "string", enum: ["SUSPEND", "REINSTATE"] }
      } }
    }
  }, async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const { listingId } = request.params as { listingId: string };
    const { action } = request.body as { action: "SUSPEND" | "REINSTATE" };
    const existing = await prisma.hostListing.findFirst({
      where: { id: listingId, status: { not: "REMOVED" } },
      select: { id: true, hostUserId: true, status: true }
    });
    if (!existing) return reply.code(404).send({ error: "Listing not found." });
    if (action === "SUSPEND" && existing.status === "SUSPENDED") return reply.code(409).send({ error: "Listing is already suspended." });
    if (action === "REINSTATE" && existing.status !== "SUSPENDED") return reply.code(409).send({ error: "Only suspended listings can be reinstated." });
    const nextStatus = action === "SUSPEND" ? "SUSPENDED" : "DRAFT";
    const listing = await prisma.$transaction(async (tx) => {
      const updated = await tx.hostListing.update({ where: { id: listingId }, data: { status: nextStatus } });
      if (action === "SUSPEND") await tx.hostSubscription.updateMany({
        where: { listingId, status: "ACTIVE" }, data: { status: "PAUSED" }
      });
      return updated;
    });
    await prisma.auditEvent.create({ data: {
      actorId: actor.id, tenantId: existing.hostUserId,
      action: action === "SUSPEND" ? "HOST_LISTING_ADMIN_SUSPENDED" : "HOST_LISTING_ADMIN_REINSTATED",
      targetType: "HostListing", targetId: listingId,
      requestId: randomBytes(12).toString("hex"),
      metadata: { previousStatus: existing.status, newStatus: nextStatus }
    }});
    return { listing };
  });

  app.get("/api/v1/admin/invites", async (request, reply) => {
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const invites = await prisma.invite.findMany({
      select: { id: true, createdById: true, expiresAt: true, usedAt: true, usedById: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return { invites };
  });

  app.post("/api/v1/admin/invites/:inviteId/revoke", async (request, reply) => {
    assertTrustedOrigin(request);
    const actor = await requireAdmin(request, reply);
    if (!actor) return;
    const { inviteId } = request.params as { inviteId: string };
    const updated = await prisma.invite.updateMany({
      where: { id: inviteId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() }
    });
    if (updated.count !== 1) return reply.code(404).send({ error: "Unused active invite not found." });
    await audit(actor.id, "INVITE_REVOKED", "Invite", inviteId);
    return { ok: true };
  });
}
