import type { AdapterCapabilities } from "@salts/domain";
import type { BrokerAdapter, BrokerConnectionContext, NormalizedOrderRequest, NormalizedOrderUpdate } from "./types.js";

/** Deterministic test adapter only. It never connects to a broker or submits a real order. */
export class MockPaperAdapter implements BrokerAdapter {
  readonly providerId = "MOCK_PAPER";
  async capabilities(context: BrokerConnectionContext): Promise<AdapterCapabilities> {
    return {
      market: context.market,
      segments: context.market === "INDIA" ? ["NSE_EQ", "NSE_FO"] : ["SPOT", "PERPETUAL"],
      orderTypes: ["MARKET", "LIMIT"],
      supportsModify: true, supportsCancel: true, supportsPartialFills: true,
      supportsStopLoss: false, supportsTakeProfit: false, supportsTrailingStop: false,
      supportsReduceOnly: context.market === "CRYPTO",
      supportsOrderEvents: true, supportsTradeHistory: true
    };
  }
  async testConnection(_context: BrokerConnectionContext) {
    return { ok: true, checks: { authentication: "PASS", permissions: "UNKNOWN", marketData: "UNKNOWN", orderRoute: "UNKNOWN" } };
  }
  async placeOrder(_context: BrokerConnectionContext, request: NormalizedOrderRequest): Promise<NormalizedOrderUpdate> {
    return { providerOrderId: `paper-${request.clientOrderId}`, clientOrderId: request.clientOrderId, status: "OPEN", filledQuantity: "0", occurredAt: new Date().toISOString() };
  }
  async getOrder(_context: BrokerConnectionContext, providerOrderId: string): Promise<NormalizedOrderUpdate> {
    return { providerOrderId, status: "UNKNOWN", filledQuantity: "0", reasonCode: "MOCK_NO_ORDER_STATE", occurredAt: new Date().toISOString() };
  }
  async cancelOrder(_context: BrokerConnectionContext, providerOrderId: string): Promise<NormalizedOrderUpdate> {
    return { providerOrderId, status: "CANCELLED", filledQuantity: "0", occurredAt: new Date().toISOString() };
  }
}
