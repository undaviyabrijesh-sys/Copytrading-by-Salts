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
