import test from "node:test";
import assert from "node:assert/strict";
import { createDeltaSignature } from "./delta-auth.js";

test("Delta signs the exact method, timestamp, path, query and body sequence", () => {
  const a = createDeltaSignature({
    secret: "secret",
    method: "get",
    timestamp: "1700000000",
    path: "/v2/orders",
    queryString: "?product_id=1&state=open"
  });
  const b = createDeltaSignature({
    secret: "secret",
    method: "GET",
    timestamp: "1700000000",
    path: "/v2/orders",
    queryString: "?product_id=1&state=open"
  });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, createDeltaSignature({
    secret: "secret", method: "GET", timestamp: "1700000001",
    path: "/v2/orders", queryString: "?product_id=1&state=open"
  }));
});

test("Delta signature rejects an unsafe path", () => {
  assert.throws(() => createDeltaSignature({
    secret: "secret", method: "GET", timestamp: "1", path: "https://evil.example/"
  }), /DELTA_SIGNATURE_INPUT_INVALID/);
});
