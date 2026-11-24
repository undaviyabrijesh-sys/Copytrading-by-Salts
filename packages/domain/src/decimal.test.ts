import test from "node:test";
import assert from "node:assert/strict";
import { compareDecimalStrings, isDecimalMultiple, isPositiveDecimal, multiplyDecimalStrings } from "./decimal.js";

test("multiplies high precision decimal quantities without floating point rounding", () => {
  assert.equal(multiplyDecimalStrings("0.00000003", "0.25"), "0.0000000075");
  assert.equal(multiplyDecimalStrings("2.00000000", "0.25"), "0.5");
});

test("compares decimals with different scales exactly", () => {
  assert.equal(compareDecimalStrings("1.0000000001", "1"), 1);
  assert.equal(compareDecimalStrings("0.50", "0.5"), 0);
  assert.equal(compareDecimalStrings("0.49", "0.5"), -1);
});

test("validates lot multiples exactly", () => {
  assert.equal(isDecimalMultiple("1.5", "0.5"), true);
  assert.equal(isDecimalMultiple("1.4", "0.5"), false);
  assert.equal(isDecimalMultiple("0.5", "1"), false);
});

test("rejects malformed or non-positive decimal input", () => {
  assert.equal(isPositiveDecimal("0"), false);
  assert.equal(isPositiveDecimal("-1"), false);
  assert.equal(isPositiveDecimal("1e4"), false);
  assert.equal(multiplyDecimalStrings("1.2.3", "2"), null);
});
