import test from "node:test";
import assert from "node:assert/strict";
import type { CanonicalInstrument } from "./index.js";
import { validateCanonicalInstrument } from "./instrument-validation.js";

const equity: CanonicalInstrument = {
  market: "INDIA", venue: "NSE", segment: "NSE_EQ", symbol: "INFY",
  quoteCurrency: "INR", tickSize: "0.05"
};

test("accepts a fully identified equity instrument", () => {
  assert.deepEqual(validateCanonicalInstrument(equity), { valid: true });
});

test("rejects zero or malformed tick sizes", () => {
  assert.equal(validateCanonicalInstrument({ ...equity, tickSize: "0" }).valid, false);
  assert.equal(validateCanonicalInstrument({ ...equity, tickSize: "unknown" }).valid, false);
});

test("requires complete option identity instead of guessing expiry, strike or option type", () => {
  const incomplete = { ...equity, underlying: "NIFTY", expiry: "2026-12-31", strike: "25000" };
  const result = validateCanonicalInstrument(incomplete);
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "OPTION_TYPE_REQUIRED");
  const complete = { ...incomplete, optionType: "CE" as const };
  assert.deepEqual(validateCanonicalInstrument(complete), { valid: true });
});

test("rejects impossible option expiry and non-positive strike", () => {
  const base = { ...equity, underlying: "NIFTY", expiry: "2026-02-30", strike: "25000", optionType: "PE" as const };
  const expiry = validateCanonicalInstrument(base);
  assert.equal(expiry.valid, false);
  if (!expiry.valid) assert.equal(expiry.code, "OPTION_EXPIRY_INVALID");
  const strike = validateCanonicalInstrument({ ...base, expiry: "2026-12-31", strike: "0" });
  assert.equal(strike.valid, false);
  if (!strike.valid) assert.equal(strike.code, "OPTION_STRIKE_INVALID");
});
