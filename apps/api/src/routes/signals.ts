import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@salts/database/client";
import { assertTrustedOrigin, currentUser } from "./auth.js";

const events = ["ENTRY", "EXIT", "PARTIAL_EXIT", "MODIFY_ORDER", "CANCEL", "PLACE_STOP_LOSS", "MODIFY_STOP_LOSS", "CANCEL_STOP_LOSS", "PLACE_TAKE_PROFIT", "MODIFY_TAKE_PROFIT", "CANCEL_TAKE_PROFIT", "TRAIL_STOP", "SQUARE_OFF"] as const;

export async function registerSignalRoutes(app: FastifyInstance) {

  app.get("/api/v1/host/signals", async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (actor.status !== "ACTIVE" || !actor.roles.includes("HOST")) return reply.code(403).send({ error: "An active approved host account is required." });
    const signals = await prisma.signal.findMany({
      where: { hostUserId: actor.id },
      select: {
        id: true, market: true, event: true, instrument: true, occurredAt: true, receivedAt: true,
        _count: { select: { copyIntents: true } }
      },
      orderBy: { receivedAt: "desc" }, take: 100
    });
    return { signals };
  });

  app.get("/api/v1/subscriber/copy-intents", async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (actor.status !== "ACTIVE") return reply.code(403).send({ error: "An active account is required." });
    const intents = await prisma.copyIntent.findMany({
      where: { subscriberId: actor.id },
      select: {
        id: true, status: true, decisionCode: true, decisionReason: true,
        attemptCount: true, createdAt: true, updatedAt: true, completedAt: true,
        signal: { select: { market: true, event: true, instrument: true, occurredAt: true } },
        subscription: { select: { listing: { select: { id: true, title: true } } } }
      },
      orderBy: { createdAt: "desc" }, take: 100
    });
    return { intents };
  });


  app.post("/api/v1/host/signals", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: {
      body: {
        type: "object", additionalProperties: false,
        required: ["idempotencyKey", "hostConnectionId", "market", "event", "instrument", "payload", "occurredAt"],
        properties: {
          idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" },
          hostConnectionId: { type: "string", minLength: 1, maxLength: 128 },
          market: { type: "string", enum: ["INDIA", "CRYPTO"] },
          event: { type: "string", enum: [...events] },
          instrument: {
            type: "object", additionalProperties: true,
            required: ["market", "venue", "segment", "symbol", "quoteCurrency", "tickSize"],
            properties: {
              market: { type: "string", enum: ["INDIA", "CRYPTO"] },
              venue: { type: "string", minLength: 1, maxLength: 40 },
              segment: { type: "string", minLength: 1, maxLength: 40 },
              symbol: { type: "string", minLength: 1, maxLength: 100 },
              quoteCurrency: { type: "string", minLength: 1, maxLength: 20 },
              tickSize: { type: "string", minLength: 1, maxLength: 32 }
            }
          },
          payload: {
            type: "object", additionalProperties: false,
            properties: {
              side: { type: "string", enum: ["BUY", "SELL"] },
              orderType: { type: "string", enum: ["MARKET", "LIMIT", "STOP_LIMIT", "STOP_MARKET"] },
              quantity: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+(\\.[0-9]+)?$" },
              limitPrice: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+(\\.[0-9]+)?$" },
              triggerPrice: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+(\\.[0-9]+)?$" },
              targetOrderId: { type: "string", minLength: 1, maxLength: 128 }
            }
          },
          occurredAt: { type: "string", format: "date-time" }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    assertTrustedOrigin(request);
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    if (actor.status !== "ACTIVE" || !actor.roles.includes("HOST")) return reply.code(403).send({ error: "An active approved host account is required." });
    const body = request.body as {
      idempotencyKey: string; hostConnectionId: string; market: "INDIA" | "CRYPTO";
      event: typeof events[number]; instrument: Record<string, unknown>;
      payload: Record<string, unknown>; occurredAt: string;
    };
    if (body.instrument.market !== body.market) return reply.code(400).send({ error: "Instrument market must match signal market." });
    if (body.event === "ENTRY" && (!["BUY", "SELL"].includes(String(body.payload.side)) ||
      !["MARKET", "LIMIT", "STOP_LIMIT", "STOP_MARKET"].includes(String(body.payload.orderType)) ||
      typeof body.payload.quantity !== "string")) {
      return reply.code(400).send({ error: "Entry signals require normalized side, orderType and quantity fields." });
    }
    const connection = await prisma.brokerConnection.findFirst({
      where: { id: body.hostConnectionId, userId: actor.id, market: body.market, status: "CONNECTED" },
      select: { id: true }
    });
    if (!connection) return reply.code(409).send({ error: "A connected source broker account owned by this host is required." });
    const requestId = randomBytes(12).toString("hex");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const publishedListing = await tx.hostListing.findFirst({
          where: { hostUserId: actor.id, market: body.market, status: "PUBLISHED" },
          select: { id: true }
        });
        if (!publishedListing) {
          throw Object.assign(new Error("Publish a listing for this market before sending signals."), { statusCode: 409 });
        }
        const signal = await tx.signal.create({ data: {
          idempotencyKey: body.idempotencyKey,
          hostUserId: actor.id,
          hostConnectionId: connection.id,
          market: body.market,
          event: body.event,
          instrument: body.instrument as Prisma.InputJsonObject,
          payload: body.payload as Prisma.InputJsonObject,
          occurredAt: new Date(body.occurredAt)
        }});
        const subscriptions = await tx.hostSubscription.findMany({
          where: {
            hostUserId: actor.id, market: body.market, status: "ACTIVE", mode: "PAPER",
            subscriber: { status: "ACTIVE" },
            listing: { status: "PUBLISHED" }
          },
          select: { id: true, subscriberId: true, destinationConnectionId: true, settings: true }
        });
        if (subscriptions.length) {
          await tx.copyIntent.createMany({
            data: subscriptions.map((sub) => ({
              signalId: signal.id, subscriptionId: sub.id, subscriberId: sub.subscriberId,
              destinationConnectionId: sub.destinationConnectionId,
              status: "QUEUED"
            })),
            skipDuplicates: true
          });
        }
        await tx.auditEvent.create({ data: {
          actorId: actor.id, tenantId: actor.id, action: "HOST_SIGNAL_ACCEPTED",
          targetType: "Signal", targetId: signal.id, requestId,
          metadata: { market: body.market, event: body.event, fanoutCount: subscriptions.length }
        }});
        return { signalId: signal.id, fanoutCount: subscriptions.length };
      }, { isolationLevel: "Serializable" });
      return reply.code(202).send({ accepted: true, ...result, status: "QUEUED_FOR_PAPER_EVALUATION" });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        return reply.code(409).send({ error: "Duplicate signal idempotency key." });
      }
      throw error;
    }
  });
}
