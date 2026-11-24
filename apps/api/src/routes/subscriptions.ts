import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma } from "@salts/database/client";
import { assertTrustedOrigin, currentUser } from "./auth.js";

export async function registerSubscriptionRoutes(app: FastifyInstance) {
  app.get("/api/v1/subscriptions", async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const subscriptions = await prisma.hostSubscription.findMany({
      where: { subscriberId: actor.id },
      include: { listing: { select: { id: true, title: true, market: true, status: true, host: { select: { id: true, displayName: true } } } } },
      orderBy: { updatedAt: "desc" }
    });
    return { subscriptions };
  });

  app.post("/api/v1/listings/:listingId/subscribe", {
    schema: {
      params: { type: "object", required: ["listingId"], properties: { listingId: { type: "string", minLength: 1 } } },
      body: {
        type: "object", additionalProperties: false,
        properties: {
          quantityMultiplier: { type: "number", minimum: 0.1, maximum: 10, default: 1 },
          maxOrderValue: { type: "number", exclusiveMinimum: 0, maximum: 100000000 }
        }
      }
    }
  }, async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const { listingId } = request.params as { listingId: string };
    const body = (request.body ?? {}) as { quantityMultiplier?: number; maxOrderValue?: number };
    const listing = await prisma.hostListing.findFirst({ where: { id: listingId, status: "PUBLISHED" } });
    if (!listing) return reply.code(404).send({ error: "Published listing not found." });
    if (listing.hostUserId === actor.id) return reply.code(400).send({ error: "You cannot subscribe to your own listing." });
    const quantityMultiplier = body.quantityMultiplier ?? 1;
    const settings = {
      quantityMultiplier,
      ...(body.maxOrderValue !== undefined ? { maxOrderValue: body.maxOrderValue } : {})
    };
    const subscription = await prisma.hostSubscription.upsert({
      where: { subscriberId_listingId: { subscriberId: actor.id, listingId } },
      create: {
        hostUserId: listing.hostUserId, subscriberId: actor.id, listingId,
        market: listing.market, status: "ACTIVE", mode: "PAPER", settings
      },
      update: {
        status: "ACTIVE", mode: "PAPER", market: listing.market,
        hostUserId: listing.hostUserId, settings
      }
    });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, tenantId: actor.id, action: "HOST_LISTING_SUBSCRIBED", targetType: "HostSubscription", targetId: subscription.id, requestId: randomBytes(12).toString("hex"), metadata: { market: listing.market } }
    });
    return reply.code(201).send({ subscription, executionMode: "PAPER_ONLY" });
  });

  app.delete("/api/v1/subscriptions/:subscriptionId", async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const { subscriptionId } = request.params as { subscriptionId: string };
    const existing = await prisma.hostSubscription.findFirst({ where: { id: subscriptionId, subscriberId: actor.id } });
    if (!existing) return reply.code(404).send({ error: "Subscription not found." });
    if (existing.status === "UNSUBSCRIBED") return { ok: true, status: "UNSUBSCRIBED" };
    const subscription = await prisma.hostSubscription.update({
      where: { id: subscriptionId },
      data: { status: "UNSUBSCRIBED" }
    });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, tenantId: actor.id, action: "HOST_LISTING_UNSUBSCRIBED", targetType: "HostSubscription", targetId: subscription.id, requestId: randomBytes(12).toString("hex") }
    });
    return { ok: true, status: subscription.status, copyRouting: "DISABLED" };
  });
}
