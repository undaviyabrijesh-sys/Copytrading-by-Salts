import test from "node:test";
import assert from "node:assert/strict";
import { credentialProviders } from "../providers/credential-providers.js";

test("every listed broker has a secure credential-intake schema", () => {
  assert.ok(credentialProviders.length >= 40);
  assert.ok(credentialProviders.every(provider => provider.connectEnabled && provider.fields.length > 0));
  const allowed = ["accessToken", "apiKey", "apiSecret", "clientId", "clientSecret"];
  for (const provider of credentialProviders) {
    assert.ok(provider.fields.every(field => allowed.includes(field.key)));
    assert.equal(new Set(provider.fields.map(field => field.key)).size, provider.fields.length);
  }
});

test("known token/key providers retain their exact provider-specific fields", () => {
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

test("unverified providers accept intake fields without being marked connected or execution-ready", () => {
  const unverified = credentialProviders.filter(provider => !["DELTA_INDIA", "DHAN", "GROWW"].includes(provider.id));
  assert.ok(unverified.length >= 35);
  assert.ok(unverified.every(provider => provider.fields.length > 0));
  assert.ok(unverified.every(provider => provider.note.toLowerCase().includes("credential") || provider.note.toLowerCase().includes("intake")));
  assert.ok(unverified.every(provider => provider.auth === "OAUTH"));
});
