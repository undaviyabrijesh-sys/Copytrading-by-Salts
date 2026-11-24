import test from "node:test";
import assert from "node:assert/strict";
import { credentialProviders } from "../providers/credential-providers.js";

test("only providers with an explicit field contract accept credential intake", () => {
  assert.ok(credentialProviders.length >= 40);
  const enabled = credentialProviders.filter(provider => provider.connectEnabled);
  assert.deepEqual(enabled.map(provider => provider.id).sort(), [
    "ALICE_BLUE", "ANGEL_ONE", "DELTA_INDIA", "DHAN", "FIVE_PAISA", "FLATTRADE",
    "FYERS", "GROWW", "ICICI_BREEZE", "SHOONYA", "UPSTOX", "ZERODHA"
  ].sort());
  for (const provider of credentialProviders) {
    assert.equal(new Set(provider.fields.map(field => field.key)).size, provider.fields.length);
    if (!provider.connectEnabled) assert.equal(provider.fields.length, 0);
    if (provider.connectEnabled) assert.ok(provider.fields.length > 0);
  }
});

test("Dhan, Delta and Groww expose their documented static credential fields", () => {
  const delta = credentialProviders.find(provider => provider.id === "DELTA_INDIA");
  const dhan = credentialProviders.find(provider => provider.id === "DHAN");
  const groww = credentialProviders.find(provider => provider.id === "GROWW");
  assert.equal(delta?.market, "CRYPTO");
  assert.deepEqual(delta?.fields.map(field => field.key), ["apiKey", "apiSecret"]);
  assert.equal(dhan?.market, "INDIA");
  assert.deepEqual(dhan?.fields.map(field => field.key), ["clientId", "apiKey", "apiSecret"]);
  assert.equal(groww?.market, "INDIA");
  assert.deepEqual(groww?.fields.map(field => field.key), ["accessToken"]);
});

test("research-only providers have no credential intake or execution readiness", () => {
  const research = credentialProviders.filter(provider => !provider.connectEnabled);
  assert.ok(research.length >= 25);
  assert.ok(research.every(provider => provider.fields.length === 0));
  assert.ok(research.every(provider => provider.note.toLowerCase().includes("disabled") || provider.note.toLowerCase().includes("research")));
});
