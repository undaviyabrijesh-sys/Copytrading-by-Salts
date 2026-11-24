import type { AdapterCapabilities, CanonicalInstrument, CanonicalOrderType, Market, SignalEventType, Side } from "./index.js";
import { evaluateCopyRequest } from "./copy-policy.js";
import { compareDecimalStrings, multiplyDecimalStrings } from "./decimal.js";

export interface PaperSubscriptionContext {
  id: string;
  hostUserId: string;
  subscriberId: string;
  market: Market;
  status: "ACTIVE" | "PAUSED" | "UNSUBSCRIBED";
  mode: "PAPER" | "LIVE";
  listingStatus: "DRAFT" | "PUBLISHED" | "PAUSED" | "REMOVED" | "SUSPENDED";
  settings: {
    quantityMultiplier?: number;
    maxOrderValue?: number;
    maxQuantity?: number;
    maxOpenOrders?: number;
    maxDailyLoss?: number;
    allowedOrderTypes?: CanonicalOrderType[];
  };
}

export interface PaperSignalContext {
  hostUserId: string;
  market: Market;
  event: SignalEventType;
  instrument: CanonicalInstrument;
  side?: Side;
  orderType?: CanonicalOrderType;
  quantity?: string;
  price?: string;
  lotSize?: string;
  minQuantity?: string;
}

export interface PaperDestinationContext {
  ownerUserId: string;
  market: Market;
  mode: "PAPER" | "LIVE";
  connectionStatus: "CONNECTED" | "PENDING" | "ERROR" | "DISCONNECTED" | "REAUTH_REQUIRED";
  instrumentMapped: boolean;
  destinationInstrument?: CanonicalInstrument;
  capabilities: AdapterCapabilities;
  openOrderCount: number;
  dailyLoss: number;
  linkedPositionExists: boolean;
}

export type PaperRoutingDecision =
  | { eligible: true; event: SignalEventType; quantity?: string; instrument?: CanonicalInstrument; managementOnly: boolean }
  | { eligible: false; code: string; reason: string };

/**
 * Paper routing gate. New entries require an active, published subscription.
 * Position-management events may still pass after unsubscribe/pause so the
 * system can manage or flatten already-copied exposure.
 */
export function evaluatePaperRouting(input: {
  subscription: PaperSubscriptionContext;
  signal: PaperSignalContext;
  destination: PaperDestinationContext;
}): PaperRoutingDecision {
  const { subscription: sub, signal, destination: dest } = input;
  const isEntry = signal.event === "ENTRY";

  if (sub.hostUserId !== signal.hostUserId) return { eligible: false, code: "HOST_SUBSCRIPTION_MISMATCH", reason: "Signal host does not match the subscribed host." };
  if (sub.subscriberId !== dest.ownerUserId) return { eligible: false, code: "TENANT_MISMATCH", reason: "Destination broker connection does not belong to this subscriber." };
  if (sub.market !== signal.market || signal.market !== dest.market || dest.capabilities.market !== dest.market) {
    return { eligible: false, code: "MARKET_MISMATCH", reason: "India and Crypto routing are isolated; all source and destination markets must match." };
  }
  if (sub.mode !== "PAPER" || dest.mode !== "PAPER") return { eligible: false, code: "PAPER_MODE_REQUIRED", reason: "Only paper-mode routing is enabled." };
  if (dest.connectionStatus !== "CONNECTED") return { eligible: false, code: "DESTINATION_NOT_CONNECTED", reason: "Subscriber destination connection is not healthy and connected." };
  if (isEntry) {
    if (sub.status !== "ACTIVE") return { eligible: false, code: "SUBSCRIPTION_INACTIVE", reason: "New entries are blocked because the subscription is not active." };
    if (sub.listingStatus !== "PUBLISHED") return { eligible: false, code: "LISTING_NOT_PUBLISHED", reason: "New entries are blocked because the host listing is not published." };
  } else if (!dest.linkedPositionExists) {
    return { eligible: false, code: "LINKED_POSITION_NOT_FOUND", reason: "Management event has no linked copied position or order at this subscriber." };
  }

  if (signal.orderType && sub.settings.allowedOrderTypes && !sub.settings.allowedOrderTypes.includes(signal.orderType)) {
    return { eligible: false, code: "SUBSCRIBER_ORDER_TYPE_BLOCKED", reason: "Subscriber risk settings do not allow this order type." };
  }

  if (!isEntry) {
    if (!dest.instrumentMapped || !dest.destinationInstrument || dest.destinationInstrument.market !== dest.market) return { eligible: false, code: "INSTRUMENT_NOT_MAPPED", reason: "Existing position management requires a verified destination instrument mapping." };
    if (["PLACE_STOP_LOSS", "MODIFY_STOP_LOSS", "PLACE_TAKE_PROFIT", "MODIFY_TAKE_PROFIT", "TRAIL_STOP"].includes(signal.event) && !signal.orderType) return { eligible: false, code: "MANAGEMENT_ORDER_TYPE_REQUIRED", reason: "Stop and take-profit events require an explicit canonical order type." };\n    if (signal.orderType && !dest.capabilities.orderTypes.includes(signal.orderType)) return { eligible: false, code: "ORDER_TYPE_UNSUPPORTED", reason: "Destination adapter does not support the management order type." };
    if (!dest.capabilities.supportsOrderEvents) return { eligible: false, code: "ORDER_EVENTS_UNSUPPORTED", reason: "Destination adapter cannot safely process order lifecycle events." };
    if (["CANCEL", "CANCEL_STOP_LOSS", "CANCEL_TAKE_PROFIT"].includes(signal.event) && !dest.capabilities.supportsCancel) return { eligible: false, code: "CANCEL_UNSUPPORTED", reason: "Destination adapter does not support cancellation." };
    if (["MODIFY_ORDER", "MODIFY_STOP_LOSS", "MODIFY_TAKE_PROFIT", "TRAIL_STOP"].includes(signal.event) && !dest.capabilities.supportsModify) {
      return { eligible: false, code: "MODIFY_UNSUPPORTED", reason: "Destination adapter does not support this modification." };
    }
    if (["PLACE_STOP_LOSS", "MODIFY_STOP_LOSS"].includes(signal.event) && !dest.capabilities.supportsStopLoss) return { eligible: false, code: "STOP_LOSS_UNSUPPORTED", reason: "Destination adapter does not support stop-loss orders." };
    if (["PLACE_TAKE_PROFIT", "MODIFY_TAKE_PROFIT"].includes(signal.event) && !dest.capabilities.supportsTakeProfit) return { eligible: false, code: "TAKE_PROFIT_UNSUPPORTED", reason: "Destination adapter does not support take-profit orders." };
    if (signal.event === "TRAIL_STOP" && !dest.capabilities.supportsTrailingStop) return { eligible: false, code: "TRAILING_STOP_UNSUPPORTED", reason: "Destination adapter does not support trailing stops." };
    return { eligible: true, event: signal.event, instrument: dest.destinationInstrument, managementOnly: true };
  }

  if (!signal.orderType) return { eligible: false, code: "ORDER_TYPE_MISSING", reason: "Signal does not contain a normalized order type." };
  if (!signal.side) return { eligible: false, code: "SIDE_MISSING", reason: "Entry signal does not contain a normalized BUY or SELL side." };

  if (!Number.isSafeInteger(dest.openOrderCount) || dest.openOrderCount < 0 || !Number.isFinite(dest.dailyLoss) || dest.dailyLoss < 0) {
    return { eligible: false, code: "INVALID_RISK_SNAPSHOT", reason: "Subscriber risk snapshot is invalid; routing is blocked." };
  }
  if (sub.settings.maxOpenOrders !== undefined && (!Number.isSafeInteger(sub.settings.maxOpenOrders) || sub.settings.maxOpenOrders < 1)) {
    return { eligible: false, code: "INVALID_RISK_LIMIT", reason: "Subscriber maximum open-order limit is invalid." };
  }
  if (sub.settings.maxDailyLoss !== undefined && (!Number.isFinite(sub.settings.maxDailyLoss) || sub.settings.maxDailyLoss < 0)) {
    return { eligible: false, code: "INVALID_RISK_LIMIT", reason: "Subscriber daily-loss limit is invalid." };
  }
  if (sub.settings.maxQuantity !== undefined && (compareDecimalStrings(String(sub.settings.maxQuantity), "0") ?? -1) <= 0) {
    return { eligible: false, code: "INVALID_RISK_LIMIT", reason: "Subscriber maximum quantity is invalid." };
  }
  if (sub.settings.maxOrderValue !== undefined && (compareDecimalStrings(String(sub.settings.maxOrderValue), "0") ?? -1) <= 0) {
    return { eligible: false, code: "INVALID_RISK_LIMIT", reason: "Subscriber maximum order value is invalid." };
  }
  if (sub.settings.maxOpenOrders !== undefined && dest.openOrderCount >= sub.settings.maxOpenOrders) {
    return { eligible: false, code: "MAX_OPEN_ORDERS", reason: "Subscriber open-order limit has been reached." };
  }
  if (sub.settings.maxDailyLoss !== undefined && dest.dailyLoss >= sub.settings.maxDailyLoss) {
    return { eligible: false, code: "DAILY_LOSS_LIMIT", reason: "Subscriber daily loss limit has been reached; new entries are blocked." };
  }
  const multiplier = String(sub.settings.quantityMultiplier ?? 1);
  const sourceQuantity = signal.quantity ?? "";
  const quantity = multiplyDecimalStrings(sourceQuantity, multiplier);
  if (!quantity || compareDecimalStrings(sourceQuantity, "0") === null || compareDecimalStrings(sourceQuantity, "0")! <= 0 || compareDecimalStrings(multiplier, "0") === null || compareDecimalStrings(multiplier, "0")! <= 0 || compareDecimalStrings(quantity, "0")! <= 0) {
    return { eligible: false, code: "INVALID_SIZING", reason: "Subscriber sizing multiplier or source quantity is invalid." };
  }
  const maxQuantityComparison = sub.settings.maxQuantity === undefined ? null : compareDecimalStrings(quantity, String(sub.settings.maxQuantity));
  if (sub.settings.maxQuantity !== undefined && (maxQuantityComparison === null || maxQuantityComparison > 0)) {
    return { eligible: false, code: "MAX_QUANTITY", reason: "Calculated quantity exceeds the subscriber maximum quantity." };
  }
  if (sub.settings.maxOrderValue !== undefined) {
    const price = signal.price ?? "";
    const orderValue = multiplyDecimalStrings(quantity, price);
    const priceComparison = compareDecimalStrings(price, "0");
    if (!orderValue || priceComparison === null || priceComparison <= 0) return { eligible: false, code: "PRICE_REQUIRED", reason: "A valid reference price is required to enforce the subscriber order-value cap." };
    const valueComparison = compareDecimalStrings(orderValue, String(sub.settings.maxOrderValue));
    if (valueComparison === null || valueComparison > 0) {
      return { eligible: false, code: "MAX_ORDER_VALUE", reason: "Calculated order value exceeds the subscriber maximum." };
    }
  }
  const copy = evaluateCopyRequest({
    sourceMarket: signal.market,
    destinationMarket: dest.market,
    instrumentMapped: dest.instrumentMapped,
    destinationInstrument: dest.destinationInstrument,
    orderType: signal.orderType,
    quantity,
    lotSize: signal.lotSize,
    minQuantity: signal.minQuantity,
    capabilities: dest.capabilities
  });
  if (!copy.eligible) return { eligible: false, code: copy.code, reason: copy.reason };
  return { eligible: true, event: signal.event, quantity: copy.quantity, instrument: copy.instrument, managementOnly: false };
}
