import test from "node:test";
import assert from "node:assert/strict";
import { decodeBase32, encodeBase32, encryptTotpSecret, decryptTotpSecret, verifyTotp } from "./totp.js";

test("base32 encoding and decoding preserve bytes", () => {
  const original = Buffer.from("hello world");
  assert.deepEqual(decodeBase32(encodeBase32(original)), original);
});

test("RFC 6238 SHA1 six-digit test vector is accepted", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  assert.equal(verifyTotp(secret, "287082", 59000), true);
  assert.equal(verifyTotp(secret, "000000", 59000), false);
});

test("TOTP secret encryption uses authenticated encryption", () => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP");
  assert.equal(decryptTotpSecret(encrypted), "JBSWY3DPEHPK3PXP");
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptTotpSecret(tampered));
});
