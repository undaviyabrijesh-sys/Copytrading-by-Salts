/**
 * Canonical domain contracts shared by the web, API and copy engine.
 * Provider-specific payloads must be normalized before entering this domain.
 */

export type Market = "INDIA" | "CRYPTO";
export type AccountRole = "SUBSCRIBER" | "HOST" | "ADMIN";
export type TradingMode = "PAPER" | "LIVE";
export type Side = "BUY" | "SELL";

export type CanonicalOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP_LIMIT"
  | "STOP_MARKET";

export type SignalEventType =
  | "ENTRY"
  | "EXIT"
  | "PARTIAL_EXIT"
  | "MODIFY_ORDER"
  | "CANCEL"
  | "PLACE_STOP_LOSS"
  | "MODIFY_STOP_LOSS"
  | "CANCEL_STOP_LOSS"
  | "PLACE_TAKE_PROFIT"
  | "MODIFY_TAKE_PROFIT"
  | "CANCEL_TAKE_PROFIT"
  | "TRAIL_STOP"
  | "SQUARE_OFF";

export interface CanonicalInstrument {
  market: Market;
  venue: string;
  segment: string;
  symbol: string;
  underlying?: string;
  expiry?: string;
  strike?: string;
  optionType?: "CE" | "PE";
  quoteCurrency: string;
  contractMultiplier?: string;
  lotSize?: string;
  tickSize: string;
}

export interface SignalEnvelope {
  schemaVersion: 1;
  signalId: string;
  idempotencyKey: string;
  hostUserId: string;
  hostConnectionId: string;
  market: Market;
  event: SignalEventType;
  instrument: CanonicalInstrument;
  side?: Side;
  orderType?: CanonicalOrderType;
  quantity?: string;
  limitPrice?: string;
  triggerPrice?: string;
  targetOrderId?: string;
  occurredAt: string;
  receivedAt: string;
}

export interface AdapterCapabilities {
  market: Market;
  segments: string[];
  orderTypes: CanonicalOrderType[];
  supportsModify: boolean;
  supportsCancel: boolean;
  supportsPartialFills: boolean;
  supportsStopLoss: boolean;
  supportsTakeProfit: boolean;
  supportsTrailingStop: boolean;
  supportsReduceOnly: boolean;
  supportsOrderEvents: boolean;
  supportsTradeHistory: boolean;
}

export type CopyDecision =
  | { status: "ELIGIBLE"; destinationInstrument: CanonicalInstrument; quantity: string }
  | { status: "SKIPPED"; code: string; message: string };

export function assertMarketMatch(
  source: Market,
  destination: Market
): void {
  if (source !== destination) {
    throw new Error("MARKET_MISMATCH: India and Crypto order routing are isolated.");
  }
}

export function isOrderTypeSupported(
  orderType: CanonicalOrderType,
  capabilities: AdapterCapabilities
): boolean {
  return capabilities.orderTypes.includes(orderType);
}
