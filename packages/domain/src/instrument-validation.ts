import type { CanonicalInstrument } from "./index.js";
import { isPositiveDecimal } from "./decimal.js";

export type InstrumentValidation =
  | { valid: true }
  | { valid: false; code: string; reason: string };

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Runtime validation for canonical instruments. Never guesses missing contract identity. */
export function validateCanonicalInstrument(instrument: CanonicalInstrument): InstrumentValidation {
  const required = [
    ["venue", instrument.venue], ["segment", instrument.segment],
    ["symbol", instrument.symbol], ["quoteCurrency", instrument.quoteCurrency]
  ] as const;
  for (const [field, value] of required) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
      return { valid: false, code: "INSTRUMENT_FIELD_INVALID", reason: `Canonical instrument ${field} is missing or malformed.` };
    }
  }
  if (!isPositiveDecimal(instrument.tickSize)) {
    return { valid: false, code: "INSTRUMENT_TICK_SIZE_INVALID", reason: "Instrument tickSize must be a positive decimal." };
  }
  if (instrument.lotSize !== undefined && !isPositiveDecimal(instrument.lotSize)) {
    return { valid: false, code: "INSTRUMENT_LOT_SIZE_INVALID", reason: "Instrument lotSize must be a positive decimal." };
  }
  if (instrument.contractMultiplier !== undefined && !isPositiveDecimal(instrument.contractMultiplier)) {
    return { valid: false, code: "INSTRUMENT_MULTIPLIER_INVALID", reason: "Instrument contractMultiplier must be a positive decimal." };
  }
  const isOption = instrument.optionType !== undefined || instrument.strike !== undefined;
  if (isOption) {
    if (instrument.optionType !== "CE" && instrument.optionType !== "PE") {
      return { valid: false, code: "OPTION_TYPE_REQUIRED", reason: "Options require an explicit CE or PE optionType." };
    }
    if (!instrument.underlying?.trim()) {
      return { valid: false, code: "OPTION_UNDERLYING_REQUIRED", reason: "Options require an explicit underlying." };
    }
    if (!instrument.expiry || !validDate(instrument.expiry)) {
      return { valid: false, code: "OPTION_EXPIRY_INVALID", reason: "Options require a valid ISO YYYY-MM-DD expiry." };
    }
    if (!instrument.strike || !isPositiveDecimal(instrument.strike)) {
      return { valid: false, code: "OPTION_STRIKE_INVALID", reason: "Options require a positive strike price." };
    }
  } else if (instrument.expiry !== undefined && !validDate(instrument.expiry)) {
    return { valid: false, code: "INSTRUMENT_EXPIRY_INVALID", reason: "Instrument expiry must use a valid ISO YYYY-MM-DD date." };
  }
  return { valid: true };
}
