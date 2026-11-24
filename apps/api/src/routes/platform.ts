import type { FastifyInstance } from "fastify";
import { prisma } from "@salts/database/client";
import { currentUser } from "./auth.js";

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.get("/api/v1/brokers/connections", async (request, reply) => {
    const actor = await currentUser(request);
    if (!actor) return reply.code(401).send({ error: "Authentication required." });
    const connections = await prisma.brokerConnection.findMany({
      where: { userId: actor.id },
      select: { id: true, market: true, provider: true, label: true, status: true, lastHealthAt: true, tokenExpiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    return { connections };
  });

  app.get("/api/v1/markets", async () => ({
    markets: [
      { id: "INDIA", label: "India", status: "PAPER_ONLY", liveEnabled: false },
      { id: "CRYPTO", label: "Crypto", status: "PAPER_ONLY", liveEnabled: false }
    ]
  }));

  app.get("/api/v1/brokers/catalog", async () => ({
    markets: {
      INDIA: [
        { id: "ZERODHA", label: "Zerodha", connection: "NOT_IMPLEMENTED", mode: "PAPER_ADAPTER_REQUIRED" },
        { id: "DHAN", label: "Dhan", connection: "NOT_IMPLEMENTED", mode: "PAPER_ADAPTER_REQUIRED" },
        { id: "ANGEL_ONE", label: "Angel One", connection: "NOT_IMPLEMENTED", mode: "PAPER_ADAPTER_REQUIRED" },
        { id: "UPSTOX", label: "Upstox", connection: "NOT_IMPLEMENTED", mode: "PAPER_ADAPTER_REQUIRED" },
        { id: "FYERS", label: "FYERS", connection: "NOT_IMPLEMENTED", mode: "PAPER_ADAPTER_REQUIRED" }
      ],
      CRYPTO: [
        { id: "DELTA_INDIA", label: "Delta Exchange India", connection: "NOT_IMPLEMENTED", mode: "PAPER_ADAPTER_REQUIRED" }
      ]
    }
  }));
}
