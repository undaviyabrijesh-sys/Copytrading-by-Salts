import test from "node:test";
import assert from "node:assert/strict";
import { hashOpaqueToken, isTokenUsable, issueOpaqueToken } from "./opaque-tokens.js";

test("issued opaque tokens are high entropy and only their hash is stored", () => {
  const issued = issueOpaqueToken();
  assert.ok(issued.token.length >= 40);
  assert.equal(issued.tokenHash, hashOpaqueToken(issued.token));
  assert.notEqual(issued.token, issued.tokenHash);
});

test("opaque token hashing rejects short input", () => {
  assert.throws(() => hashOpaqueToken("short"), /Invalid opaque token/);
});

test("token is usable only before expiry and before use or revocation", () => {
  const now = new Date("2026-11-24T00:00:00.000Z");
  const base = { now, expiresAt: new Date("2026-11-25T00:00:00.000Z") };
  assert.equal(isTokenUsable(base), true);
  assert.equal(isTokenUsable({ ...base, usedAt: now }), false);
  assert.equal(isTokenUsable({ ...base, revokedAt: now }), false);
  assert.equal(isTokenUsable({ ...base, expiresAt: now }), false);
});
