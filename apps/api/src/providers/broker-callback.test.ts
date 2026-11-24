import assert from "node:assert/strict";
import test from "node:test";
import { buildBrokerCallbackUri } from "./broker-callback.js";

test("builds the callback route actually registered by the API", () => {
  assert.equal(
    buildBrokerCallbackUri("https://api.example.com", "ZERODHA"),
    "https://api.example.com/api/v1/brokers/oauth/zerodha/callback"
  );
});

test("preserves a configured API path prefix", () => {
  assert.equal(
    buildBrokerCallbackUri("https://api.example.com/platform/", "UPSTOX"),
    "https://api.example.com/platform/api/v1/brokers/oauth/upstox/callback"
  );
});

test("rejects insecure or malformed callback bases", () => {
  assert.throws(() => buildBrokerCallbackUri("http://api.example.com", "FYERS"));
  assert.throws(() => buildBrokerCallbackUri("https://api.example.com?next=x", "FYERS"));
  assert.throws(() => buildBrokerCallbackUri("https://api.example.com", "DHAN"));
});
