import type { AdapterCapabilities, CanonicalInstrument, CanonicalOrderType, Market, Side } from "@salts/domain";

export interface BrokerConnectionContext {
  connectionId: string;
  ownerUserId: string;
  provider: string;
  market: Market;
  mode: "PAPER" | "LIVE";
}

export interface NormalizedOrderRequest {
  clientOrderId: string;
  instrument: CanonicalInstrument;
  side: Side;
  orderType: CanonicalOrderType;
  quantity: string;
  limitPrice?: string;
  triggerPrice?: string;
  reduceOnly?: boolean;
}

export interface NormalizedOrderUpdate {
  providerOrderId: string;
  clientOrderId?: string;
  status: "PENDING" | "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "UNKNOWN";
  filledQuantity: string;
  averageFillPrice?: string;
  reasonCode?: string;
  occurredAt: string;
}

export interface BrokerAdapter {
  readonly providerId: string;
  capabilities(context: BrokerConnectionContext): Promise<AdapterCapabilities>;
  testConnection(context: BrokerConnectionContext): Promise<{ ok: boolean; checks: Record<string, "PASS" | "FAIL" | "UNKNOWN"> }>;
  placeOrder(context: BrokerConnectionContext, request: NormalizedOrderRequest): Promise<NormalizedOrderUpdate>;
  getOrder(context: BrokerConnectionContext, providerOrderId: string): Promise<NormalizedOrderUpdate>;
  cancelOrder(context: BrokerConnectionContext, providerOrderId: string): Promise<NormalizedOrderUpdate>;
  // Implementations must never log credential material or treat an ACK as a fill.
}

export class UnsupportedAdapterOperation extends Error {
  constructor(providerId: string, operation: string) {
    super(`Adapter ${providerId} does not support ${operation}.`);
    this.name = "UnsupportedAdapterOperation";
  }
}
