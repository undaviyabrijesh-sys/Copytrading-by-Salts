export interface DecimalParts {
  coefficient: bigint;
  scale: number;
}

export function parseDecimal(value: string): DecimalParts | null {
  if (value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}

export function compareDecimalStrings(left: string, right: string): number | null {
  const a = parseDecimal(left), b = parseDecimal(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const av = a.coefficient * 10n ** BigInt(scale - a.scale);
  const bv = b.coefficient * 10n ** BigInt(scale - b.scale);
  return av < bv ? -1 : av > bv ? 1 : 0;
}

export function multiplyDecimalStrings(left: string, right: string): string | null {
  const a = parseDecimal(left), b = parseDecimal(right);
  if (!a || !b) return null;
  const coefficient = a.coefficient * b.coefficient;
  const scale = a.scale + b.scale;
  let digits = coefficient.toString().padStart(scale + 1, "0");
  if (scale > 0) {
    digits = digits.slice(0, -scale) + "." + digits.slice(-scale);
    digits = digits.replace(/\.?0+$/, "");
  }
  return digits;
}

export function isPositiveDecimal(value: string): boolean {
  return (compareDecimalStrings(value, "0") ?? 0) > 0;
}

export function isDecimalMultiple(value: string, base: string): boolean {
  const a = parseDecimal(value), b = parseDecimal(base);
  if (!a || !b || b.coefficient <= 0n) return false;
  const scale = Math.max(a.scale, b.scale);
  const av = a.coefficient * 10n ** BigInt(scale - a.scale);
  const bv = b.coefficient * 10n ** BigInt(scale - b.scale);
  return av >= bv && av % bv === 0n;
}
