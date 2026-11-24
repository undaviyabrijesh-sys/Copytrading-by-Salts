import Fastify from "fastify";

const app = Fastify({ logger: true, trustProxy: false });

app.get("/health/live", async () => ({ status: "ok" }));

app.get("/health/ready", async () => ({
  status: "not_ready",
  reason: "Database, queue and authentication checks are not wired yet"
}));

app.get("/api/v1/platform", async () => ({
  name: "Copy Trading by Salts",
  stage: "phase1_foundation",
  markets: ["INDIA", "CRYPTO"],
  executionMode: "PAPER_ONLY",
  liveTradingEnabled: false
}));

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
