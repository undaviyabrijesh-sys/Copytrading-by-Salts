import test from "node:test";
import assert from "node:assert/strict";
import type { AdapterCapabilities, CanonicalInstrument } from "./index.js";
import { evaluatePaperRouting, type PaperDestinationContext, type PaperSignalContext, type PaperSubscriptionContext } from "./paper-routing.js";

const instrument: CanonicalInstrument = { market: "CRYPTO", venue: "DELTA", segment: "PERPETUAL", symbol: "BTCUSD", quoteCurrency: "USD", tickSize: "0.5" };
const capabilities: AdapterCapabilities = {
  market: "CRYPTO", segments: ["PERPETUAL"], orderTypes: ["MARKET", "LIMIT"],
  supportsModify: true, supportsCancel: true, supportsPartialFills: true,
  supportsStopLoss: false, supportsTakeProfit: false, supportsTrailingStop: false,
  supportsReduceOnly: true, supportsOrderEvents: true, supportsTradeHistory: true
};
const subscription: PaperSubscriptionContext = {
  id: "sub-1", hostUserId: "host-1", subscriberId: "client-1", market: "CRYPTO",
  status: "ACTIVE", mode: "PAPER", listingStatus: "PUBLISHED",
  settings: { quantityMultiplier: 0.25, maxOrderValue: 20000, maxQuantity: 1, maxOpenOrders: 5, maxDailyLoss: 500 }
};
const signal: PaperSignalContext = {
  hostUserId: "host-1", market: "CRYPTO", event: "ENTRY", instrument,
  side: "BUY", orderType: "LIMIT", quantity: "2.00000000", price: "40000"
};
const destination: PaperDestinationContext = {
  ownerUserId: "client-1", market: "CRYPTO", mode: "PAPER", connectionStatus: "CONNECTED",
  instrumentMapped: true, destinationInstrument: instrument, capabilities,
  openOrderCount: 1, dailyLoss: 0, linkedPositionExists: false
};

test("applies subscriber multiplier using exact decimal quantity", () => {
  const result = evaluatePaperRouting({ subscription, signal, destination });
  assert.equal(result.eligible, true);
  if (result.eligible) assert.equal(result.quantity, "0.5");
});

test("blocks new entries after unsubscribe but permits linked position management", () => {
  const stopped = { ...subscription, status: "UNSUBSCRIBED" as const };
  const entry = evaluatePaperRouting({ subscription: stopped, signal, destination });
  assert.equal(entry.eligible, false);
  if (!entry.eligible) assert.equal(entry.code, "SUBSCRIPTION_INACTIVE");
  const exitSignal = { ...signal, event: "SQUARE_OFF" as const };
  const management = evaluatePaperRouting({
    subscription: stopped, signal: exitSignal,
    destination: { ...destination, linkedPositionExists: true }
  });
  assert.equal(management.eligible, true);
  if (management.eligible) assert.equal(management.managementOnly, true);
});

test("blocks new entries when listing is paused but preserves risk management", () => {
  const paused = { ...subscription, listingStatus: "PAUSED" as const };
  const entry = evaluatePaperRouting({ subscription: paused, signal, destination });
  assert.equal(entry.eligible, false);
  if (!entry.eligible) assert.equal(entry.code, "LISTING_NOT_PUBLISHED");
});

test("rejects cross-market and wrong-tenant destination routes", () => {
  const crossMarket = evaluatePaperRouting({ subscription, signal, destination: { ...destination, market: "INDIA", capabilities: { ...capabilities, market: "INDIA" } } });
  assert.equal(crossMarket.eligible, false);
  if (!crossMarket.eligible) assert.equal(crossMarket.code, "MARKET_MISMATCH");
  const wrongTenant = evaluatePaperRouting({ subscription, signal, destination: { ...destination, ownerUserId: "someone-else" } });
  assert.equal(wrongTenant.eligible, false);
  if (!wrongTenant.eligible) assert.equal(wrongTenant.code, "TENANT_MISMATCH");
});

test("blocks entries above subscriber order value limit", () => {
  const result = evaluatePaperRouting({ subscription: { ...subscription, settings: { ...subscription.settings, maxOrderValue: 1000 } }, signal, destination });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "MAX_ORDER_VALUE");
});

test("fails closed for unsupported stop loss lifecycle events", () => {
  const stopSignal = { ...signal, event: "PLACE_STOP_LOSS" as const };
  const result = evaluatePaperRouting({ subscription, signal: stopSignal, destination: { ...destination, linkedPositionExists: true } });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "STOP_LOSS_UNSUPPORTED");
});

test("blocks new entries at open-order and daily-loss limits", () => {
  const openLimit = evaluatePaperRouting({ subscription, signal, destination: { ...destination, openOrderCount: 5 } });
  assert.equal(openLimit.eligible, false);
  if (!openLimit.eligible) assert.equal(openLimit.code, "MAX_OPEN_ORDERS");
  const lossLimit = evaluatePaperRouting({ subscription, signal, destination: { ...destination, dailyLoss: 500 } });
  assert.equal(lossLimit.eligible, false);
  if (!lossLimit.eligible) assert.equal(lossLimit.code, "DAILY_LOSS_LIMIT");
});

test("fails closed when risk snapshot is malformed", () => {
  const result = evaluatePaperRouting({ subscription, signal, destination: { ...destination, openOrderCount: Number.NaN } });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "INVALID_RISK_SNAPSHOT");
});


test("blocks destination segments absent from the broker capability set", () => {
  const result = evaluatePaperRouting({ subscription, signal, destination: { ...destination, capabilities: { ...capabilities, segments: ["SPOT"] } } });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "DESTINATION_SEGMENT_UNSUPPORTED");
});

test("requires exact source order references for modifications and cancellations", () => {
  const modify = { ...signal, event: "MODIFY_ORDER" as const };
  const result = evaluatePaperRouting({ subscription, signal: modify, destination: { ...destination, linkedPositionExists: true } });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "TARGET_ORDER_REQUIRED");
  const valid = evaluatePaperRouting({ subscription, signal: { ...modify, targetOrderId: "source-order-17" }, destination: { ...destination, linkedPositionExists: true } });
  assert.equal(valid.eligible, true);
});

test("requires explicit quantity and partial-fill capability for partial exits", () => {
  const partial = { ...signal, event: "PARTIAL_EXIT" as const, quantity: undefined };
  const missingQty = evaluatePaperRouting({ subscription, signal: partial, destination: { ...destination, linkedPositionExists: true, openPositionQuantity: "0.5" } });
  assert.equal(missingQty.eligible, false);
  if (!missingQty.eligible) assert.equal(missingQty.code, "PARTIAL_EXIT_QUANTITY_REQUIRED");
  const unsupported = evaluatePaperRouting({ subscription, signal: { ...signal, event: "PARTIAL_EXIT" as const, quantity: "0.25" }, destination: { ...destination, linkedPositionExists: true, openPositionQuantity: "0.5", capabilities: { ...capabilities, supportsPartialFills: false } } });
  assert.equal(unsupported.eligible, false);
  if (!unsupported.eligible) assert.equal(unsupported.code, "PARTIAL_EXIT_UNSUPPORTED");
});


test("scales partial exits exactly and never closes more than the reconciled position", () => {
  const partial = { ...signal, event: "PARTIAL_EXIT" as const, quantity: "1" };
  const allowed = evaluatePaperRouting({ subscription, signal: partial, destination: { ...destination, linkedPositionExists: true, openPositionQuantity: "0.5" } });
  assert.equal(allowed.eligible, true);
  if (allowed.eligible) assert.equal(allowed.quantity, "0.25");
  const tooLarge = evaluatePaperRouting({ subscription, signal: { ...partial, quantity: "3" }, destination: { ...destination, linkedPositionExists: true, openPositionQuantity: "0.5" } });
  assert.equal(tooLarge.eligible, false);
  if (!tooLarge.eligible) assert.equal(tooLarge.code, "PARTIAL_EXIT_EXCEEDS_POSITION");
});

test("rejects malformed source instrument before routing", () => {
  const malformed = { ...signal, instrument: { ...instrument, tickSize: "0" } };
  const result = evaluatePaperRouting({ subscription, signal: malformed, destination });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "INSTRUMENT_TICK_SIZE_INVALID");
});


test("blocks partial exits when broker order-event reconciliation is unavailable", () => {
  const partial = { ...signal, event: "PARTIAL_EXIT" as const, quantity: "1" };
  const result = evaluatePaperRouting({ subscription, signal: partial, destination: { ...destination, linkedPositionExists: true, openPositionQuantity: "0.5", capabilities: { ...capabilities, supportsOrderEvents: false } } });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "ORDER_EVENTS_UNSUPPORTED");
});


test("rejects source instruments whose market conflicts with the signal workspace", () => {
  const mismatch = { ...signal, instrument: { ...instrument, market: "INDIA" as const } };
  const result = evaluatePaperRouting({ subscription, signal: mismatch, destination });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, "MARKET_MISMATCH");
});


test("rejects zero or invalid partial-exit sizing multipliers", () => {
  const partial = { ...signal, event: "PARTIAL_EXIT" as const, quantity: "1" };
  const zero = evaluatePaperRouting({ subscription: { ...subscription, settings: { ...subscription.settings, quantityMultiplier: 0 } }, signal: partial, destination: { ...destination, linkedPositionExists: true, openPositionQuantity: "1" } });
  assert.equal(zero.eligible, false);
  if (!zero.eligible) assert.equal(zero.code, "INVALID_PARTIAL_EXIT_SIZING");
});
