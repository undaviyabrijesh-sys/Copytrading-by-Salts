import type { AdapterCapabilities, CanonicalInstrument, CanonicalOrderType, Market } from "./index.js";
import { assertMarketMatch, isOrderTypeSupported } from "./index.js";
import { compareDecimalStrings, isDecimalMultiple, isPositiveDecimal } from "./decimal.js";

export interface CopyRequest {
  sourceMarket: Market;
  destinationMarket: Market;
  instrumentMapped: boolean;
  destinationInstrument?: CanonicalInstrument;
  orderType: CanonicalOrderType;
  quantity: string;
  lotSize?: string;
  minQuantity?: string;
  capabilities: AdapterCapabilities;
}

export type CopyEligibility =
  | { eligible: true; instrument: CanonicalInstrument; quantity: string }
  | { eligible: false; code: string; reason: string };

/** Fail-closed eligibility check. Never substitutes an instrument or rounds up quantity. */
export function evaluateCopyRequest(request: CopyRequest): CopyEligibility {
  try {
    assertMarketMatch(request.sourceMarket, request.destinationMarket);
  } catch {
    return { eligible: false, code: "MARKET_MISMATCH", reason: "India and Crypto workspaces cannot route orders to each other." };
  }
  if (request.capabilities.market !== request.destinationMarket) {
    return { eligible: false, code: "ADAPTER_MARKET_MISMATCH", reason: "Destination adapter is not approved for this market." };
  }
  if (!request.instrumentMapped || !request.destinationInstrument) {
    return { eligible: false, code: "INSTRUMENT_NOT_MAPPED", reason: "No verified equivalent instrument exists at the destination broker." };
  }
  if (request.destinationInstrument.market !== request.destinationMarket) {
    return { eligible: false, code: "DESTINATION_INSTRUMENT_MARKET_MISMATCH", reason: "Mapped instrument belongs to a different market." };
  }
  if (!isOrderTypeSupported(request.orderType, request.capabilities)) {
    return { eligible: false, code: "ORDER_TYPE_UNSUPPORTED", reason: `Destination broker does not support ${request.orderType} for this account capability set.` };
  }
  if (!isPositiveDecimal(request.quantity)) {
    return { eligible: false, code: "INVALID_QUANTITY", reason: "Quantity must be a positive decimal value." };
  }
  if (request.lotSize) {
    if (!isPositiveDecimal(request.lotSize) || !isDecimalMultiple(request.quantity, request.lotSize)) {
      return { eligible: false, code: "INVALID_LOT_QUANTITY", reason: "Quantity is below one lot or is not a valid lot multiple; order skipped." };
    }
  }
  if (request.minQuantity && (compareDecimalStrings(request.quantity, request.minQuantity) ?? -1) < 0) {
    return { eligible: false, code: "BELOW_MIN_QUANTITY", reason: "Quantity is below the destination broker minimum." };
  }
  return { eligible: true, instrument: request.destinationInstrument, quantity: request.quantity };
}
