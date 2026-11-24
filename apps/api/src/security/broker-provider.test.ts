import test from "node:test";
import assert from "node:assert/strict";
import { credentialProviders } from "../providers/credential-providers.js";

test("only explicitly implemented token providers accept credential submission", () => {
  const enabled = credentialProviders.filter(provider => provider.connectEnabled).map(provider => provider.id).sort();
  assert.deepEqual(enabled, ["DELTA_INDIA", "DHAN", "GROWW"]);
});

test("provider credential schemas are exact and market-scoped", () => {
  const delta = credentialProviders.find(provider => provider.id === "DELTA_INDIA");
  const dhan = credentialProviders.find(provider => provider.id === "DHAN");
  const groww = credentialProviders.find(provider => provider.id === "GROWW");
  assert.equal(delta?.market, "CRYPTO");
  assert.deepEqual(delta?.fields.map(field => field.key), ["apiKey", "apiSecret"]);
  assert.equal(dhan?.market, "INDIA");
  assert.deepEqual(dhan?.fields.map(field => field.key), ["accessToken"]);
  assert.equal(groww?.market, "INDIA");
  assert.deepEqual(groww?.fields.map(field => field.key), ["accessToken"]);
});

test("OAuth providers are not exposed to generic credential submission", () => {
  const oauth = credentialProviders.filter(provider => provider.auth === "OAUTH");
  assert.ok(oauth.length >= 8);
  assert.ok(oauth.every(provider => provider.connectEnabled === false && provider.fields.length === 0));
});
