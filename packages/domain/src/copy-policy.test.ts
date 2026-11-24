import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCopyRequest } from "./copy-policy.js";
import type { AdapterCapabilities, CanonicalInstrument } from "./index.js";

const instrument: CanonicalInstrument = { market:"INDIA", venue:"NSE", segment:"NSE_EQ", symbol:"INFY", quoteCurrency:"INR", tickSize:"0.05" };
const caps: AdapterCapabilities = { market:"INDIA", segments:["NSE_EQ"], orderTypes:["MARKET","LIMIT"], supportsModify:true, supportsCancel:true, supportsPartialFills:true, supportsStopLoss:false, supportsTakeProfit:false, supportsTrailingStop:false, supportsReduceOnly:false, supportsOrderEvents:true, supportsTradeHistory:true };

test("fails closed for cross-market routing", () => {
  const result = evaluateCopyRequest({sourceMarket:"INDIA",destinationMarket:"CRYPTO",instrumentMapped:true,destinationInstrument:instrument,orderType:"MARKET",quantity:"1",capabilities:caps});
  assert.equal(result.eligible,false);
  if (!result.eligible) assert.equal(result.code,"MARKET_MISMATCH");
});

test("skips unsupported order types instead of approximating", () => {
  const result = evaluateCopyRequest({sourceMarket:"INDIA",destinationMarket:"INDIA",instrumentMapped:true,destinationInstrument:instrument,orderType:"STOP_MARKET",quantity:"1",capabilities:caps});
  assert.equal(result.eligible,false);
  if (!result.eligible) assert.equal(result.code,"ORDER_TYPE_UNSUPPORTED");
});

test("does not round a fractional derivative quantity up to one lot", () => {
  const result = evaluateCopyRequest({sourceMarket:"INDIA",destinationMarket:"INDIA",instrumentMapped:true,destinationInstrument:instrument,orderType:"MARKET",quantity:"0.5",lotSize:"1",capabilities:caps});
  assert.equal(result.eligible,false);
  if (!result.eligible) assert.equal(result.code,"INVALID_LOT_QUANTITY");
});

test("accepts supported, mapped and valid quantity", () => {
  const result = evaluateCopyRequest({sourceMarket:"INDIA",destinationMarket:"INDIA",instrumentMapped:true,destinationInstrument:instrument,orderType:"LIMIT",quantity:"2",capabilities:caps});
  assert.equal(result.eligible,true);
});
