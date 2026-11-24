import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { prisma } from "@salts/database/client";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerAuthRoutes } from "./routes/auth.js";

const app = Fastify({ logger: true, trustProxy: false });

app.get("/health/live", async () => ({ status: "ok" }));

app.get("/health/ready", async (_request, reply) => {
  try {
    await prisma.$queryRaw\`SELECT 1\`;
    return { status: "ready", database: "connected", executionMode: "PAPER_ONLY" };
  } catch {
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  }
});

app.get("/api/v1/platform", async () => ({
  name: "Copy Trading by Salts",
  stage: "phase1_foundation",
  markets: ["INDIA", "CRYPTO"],
  executionMode: "PAPER_ONLY",
  liveTradingEnabled: false
}));

await app.register(rateLimit, { global: false });
await registerPlatformRoutes(app);
await registerAuthRoutes(app);

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
