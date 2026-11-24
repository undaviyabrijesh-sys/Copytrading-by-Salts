import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma } from "@salts/database/client";
import { currentUser } from "./auth.js";

function requireMarket(value: unknown): "INDIA" | "CRYPTO" {
  if (value !== "INDIA" && value !== "CRYPTO") throw Object.assign(new Error("Market must be INDIA or CRYPTO."), { statusCode: 400 });
  return value;
}

async function actorFor(request: FastifyRequest, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const actor = await currentUser(request);
  if (!actor) { reply.code(401).send({ error: "Authentication required." }); return null; }
  if (!actor.roles.includes("HOST") && !actor.roles.includes("ADMIN")) {
    reply.code(403).send({ error: "An approved host role is required to manage listings." });
    return null;
  }
  return actor;
}

export async function registerHostRoutes(app: FastifyInstance) {
  app.get("/api/v1/host/listings", async (request, reply) => {
    const actor = await actorFor(request, reply);
    if (!actor) return;
    const listings = await prisma.hostListing.findMany({
      where: { hostUserId: actor.id, status: { not: "REMOVED" } },
      orderBy: { updatedAt: "desc" }
    });
    return { listings };
  });

  app.post("/api/v1/host/listings", {
    schema: { body: {
      type: "object", additionalProperties: false,
      required: ["market", "title", "description", "riskDisclosure"],
      properties: {
        market: { type: "string", enum: ["INDIA", "CRYPTO"] },
        title: { type: "string", minLength: 3, maxLength: 80 },
        description: { type: "string", minLength: 10, maxLength: 2000 },
        riskDisclosure: { type: "string", minLength: 20, maxLength: 3000 }
      }
    } }
  }, async (request, reply) => {
    const actor = await actorFor(request, reply);
    if (!actor) return;
    const body = request.body as { market: unknown; title: string; description: string; riskDisclosure: string };
    const market = requireMarket(body.market);
    const listing = await prisma.hostListing.create({
      data: {
        hostUserId: actor.id, market, title: body.title.trim(),
        description: body.description.trim(), riskDisclosure: body.riskDisclosure.trim(),
        status: "DRAFT"
      }
    });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, tenantId: actor.id, action: "HOST_LISTING_CREATED", targetType: "HostListing", targetId: listing.id, requestId: randomBytes(12).toString("hex") }
    });
    return reply.code(201).send({ listing });
  });

  app.patch("/api/v1/host/listings/:listingId", {
    schema: { params: { type: "object", required: ["listingId"], properties: { listingId: { type: "string", minLength: 1 } } }, body: {
      type: "object", additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 3, maxLength: 80 },
        description: { type: "string", minLength: 10, maxLength: 2000 },
        riskDisclosure: { type: "string", minLength: 20, maxLength: 3000 },
        status: { type: "string", enum: ["DRAFT", "PUBLISHED", "PAUSED"] }
      },
      minProperties: 1
    } }
  }, async (request, reply) => {
    const actor = await actorFor(request, reply);
    if (!actor) return;
    const { listingId } = request.params as { listingId: string };
    const body = request.body as { title?: string; description?: string; riskDisclosure?: string; status?: "DRAFT" | "PUBLISHED" | "PAUSED" };
    const existing = await prisma.hostListing.findFirst({ where: { id: listingId, hostUserId: actor.id, status: { not: "REMOVED" } } });
    if (!existing) return reply.code(404).send({ error: "Listing not found." });
    const data = {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.riskDisclosure !== undefined ? { riskDisclosure: body.riskDisclosure.trim() } : {}),
      ...(body.status !== undefined ? { status: body.status, publishedAt: body.status === "PUBLISHED" ? new Date() : existing.publishedAt } : {})
    };
    const listing = await prisma.hostListing.update({ where: { id: listingId, hostUserId: actor.id }, data });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, tenantId: actor.id, action: "HOST_LISTING_UPDATED", targetType: "HostListing", targetId: listing.id, requestId: randomBytes(12).toString("hex") }
    });
    return { listing };
  });

  app.delete("/api/v1/host/listings/:listingId", async (request, reply) => {
    const actor = await actorFor(request, reply);
    if (!actor) return;
    const { listingId } = request.params as { listingId: string };
    const existing = await prisma.hostListing.findFirst({ where: { id: listingId, hostUserId: actor.id, status: { not: "REMOVED" } } });
    if (!existing) return reply.code(404).send({ error: "Listing not found." });
    await prisma.hostListing.update({ where: { id: listingId, hostUserId: actor.id }, data: { status: "REMOVED" } });
    await prisma.auditEvent.create({
      data: { actorId: actor.id, tenantId: actor.id, action: "HOST_LISTING_REMOVED", targetType: "HostListing", targetId: listingId, requestId: randomBytes(12).toString("hex") }
    });
    return { ok: true };
  });

  app.get("/api/v1/listings", async (request) => {
    const query = request.query as { market?: string };
    const market = query.market ? requireMarket(query.market) : undefined;
    const listings = await prisma.hostListing.findMany({
      where: { status: "PUBLISHED", ...(market ? { market } : {}) },
      select: {
        id: true, market: true, title: true, description: true, riskDisclosure: true,
        publishedAt: true, host: { select: { id: true, displayName: true } }
      },
      orderBy: { publishedAt: "desc" },
      take: 100
    });
    return { listings };
  });
}
