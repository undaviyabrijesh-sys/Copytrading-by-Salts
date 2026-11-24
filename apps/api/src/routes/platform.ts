import type { FastifyInstance } from "fastify";
import { prisma } from "@salts/database/client";
import { currentUser } from "./auth.js";

const brokerCatalog = {
  INDIA: [
    { id: "ZERODHA", label: "Zerodha Kite Connect", auth: "API_KEY_SECRET_OAUTH", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://kite.trade/docs/connect/v3/" },
    { id: "DHAN", label: "DhanHQ", auth: "ACCESS_TOKEN_OR_API_KEY", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://dhanhq.co/docs/v2/authentication/" },
    { id: "ANGEL_ONE", label: "Angel One SmartAPI", auth: "API_KEY_CLIENT_PIN_TOTP", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://smartapi.angelone.in/docs" },
    { id: "UPSTOX", label: "Upstox", auth: "OAUTH2", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://upstox.com/developer/api-documentation/authentication/" },
    { id: "FYERS", label: "FYERS API v3", auth: "OAUTH2_APP_ID_SECRET", researchStatus: "THIRD_PARTY_APPROVAL_REQUIRED", connection: "NOT_IMPLEMENTED", docsUrl: "https://fyers.in/api-docs/v3/api/authentication/third-party-app/" },
    { id: "SHOONYA", label: "Shoonya", auth: "OAUTH2", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://www.shoonya.com/api-documentation/auth-overview" },
    { id: "FLATTRADE", label: "Flattrade Pi", auth: "API_KEY_SECRET_SESSION", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://pi.flattrade.in/docs" },
    { id: "FIVE_PAISA", label: "5paisa Xstream", auth: "OAUTH_REQUEST_TOKEN", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://xstream.5paisa.com/dev-docs/docFundamentals/integration-flow" },
    { id: "ICICI_BREEZE", label: "ICICI Direct Breeze", auth: "APP_KEY_SECRET_SESSION", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://api.icicidirect.com/breezeapi/documents/index.html" },
    { id: "KOTAK_NEO", label: "Kotak Neo", auth: "REVIEW_REQUIRED", researchStatus: "REVIEW_REQUIRED", connection: "DISABLED", docsUrl: "https://www.kotakneo.com/" },
    { id: "ALICE_BLUE", label: "Alice Blue ANT", auth: "APP_KEY_SECRET_SESSION", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://ant.aliceblueonline.com/productdocumentation/" },
    { id: "GROWW", label: "Groww Trade API", auth: "ACCESS_TOKEN", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://groww.in/trade-api/docs" }
  ],
  CRYPTO: [
    { id: "DELTA_INDIA", label: "Delta Exchange India", auth: "API_KEY_SECRET_HMAC", researchStatus: "DOCUMENTED", connection: "NOT_IMPLEMENTED", docsUrl: "https://docs.delta.exchange/" }
  ]
} as const;

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
    markets: brokerCatalog,
    disclaimer: "Research catalogue only. No listed provider is connected or enabled for order execution. Provider-specific approvals, credential vault, adapter tests and capability verification are required."
  }));
}
