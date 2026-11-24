import test from "node:test";
import assert from "node:assert/strict";
import { assertMarketMatch, isOrderTypeSupported, type AdapterCapabilities } from "./index.ts";

const capabilities: AdapterCapabilities = {
  market: "INDIA",
  segments: ["NSE_EQ"],
  orderTypes: ["MARKET", "LIMIT"],
  supportsModify: true,
  supportsCancel: true,
  supportsPartialFills: true,
  supportsStopLoss: false,
  supportsTakeProfit: false,
  supportsTrailingStop: false,
  supportsReduceOnly: false,
  supportsOrderEvents: true,
  supportsTradeHistory: true
};

test("prevents routing between India and Crypto workspaces", () => {
  assert.throws(() => assertMarketMatch("INDIA", "CRYPTO"), /MARKET_MISMATCH/);
});

test("accepts only destination-supported canonical order types", () => {
  assert.equal(isOrderTypeSupported("LIMIT", capabilities), true);
  assert.equal(isOrderTypeSupported("STOP_MARKET", capabilities), false);
});
