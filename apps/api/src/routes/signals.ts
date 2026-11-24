import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma } from "@salts/database/client";
import { assertTrustedOrigin, currentUser } from "./auth.js";

const events = ["ENTRY", "EXIT", "PARTIAL_EXIT", "MODIFY_ORDER", "CANCEL", "PLACE_STOP_LOSS", "MODIFY_STOP_LOSS", "CANCEL_STOP_LOSS", "PLACE_TAKE_PROFIT", "MODIFY_TAKE_PROFIT", "CANCEL_TAKE_PROFIT", "TRAIL_STOP", "SQUARE_OFF"] as const;

export async function registerSignalRoutes(app: FastifyInstance) {
  app.post("/api/v1/host/signals", {
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
          payload: { type: "object", additionalProperties: true },
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
    const connection = await prisma.brokerConnection.findFirst({
      where: { id: body.hostConnectionId, userId: actor.id, market: body.market, status: "CONNECTED" },
      select: { id: true }
    });
    if (!connection) return reply.code(409).send({ error: "A connected source broker account owned by this host is required." });
    const publishedListing = await prisma.hostListing.findFirst({
      where: { hostUserId: actor.id, market: body.market, status: "PUBLISHED" },
      select: { id: true }
    });
    if (!publishedListing) return reply.code(409).send({ error: "Publish a listing for this market before sending signals." });

    const requestId = randomBytes(12).toString("hex");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const signal = await tx.signal.create({ data: {
          idempotencyKey: body.idempotencyKey,
          hostUserId: actor.id,
          hostConnectionId: connection.id,
          market: body.market,
          event: body.event,
          instrument: body.instrument as object,
          payload: body.payload as object,
          occurredAt: new Date(body.occurredAt)
        }});
        const subscriptions = await tx.hostSubscription.findMany({
          where: {
            hostUserId: actor.id, market: body.market, status: "ACTIVE", mode: "PAPER",
            listing: { status: "PUBLISHED" }
          },
          select: { id: true, subscriberId: true, settings: true }
        });
        if (subscriptions.length) {
          await tx.copyIntent.createMany({
            data: subscriptions.map((sub) => ({
              signalId: signal.id, subscriptionId: sub.id, subscriberId: sub.subscriberId,
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
