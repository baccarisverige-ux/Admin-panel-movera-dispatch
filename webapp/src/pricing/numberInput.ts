/** One decimal separator (comma or point), optional minus; "12," and "0." are fine while typing. No exponents, no thousands separators. */
const NUMBER = /^\s*-?(\d+([.,]\d*)?|[.,]\d+)\s*$/;

function withUnit(value: number, unit?: string): string {
  if (!unit) return String(value);
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

/** What is wrong with the typed text, or null when it is a number inside the bounds. */
export function numberInputError(text: string, min: number, max: number | undefined, unit?: string): string | null {
  if (!NUMBER.test(text)) return text.trim() === "" ? "Enter a number." : "Enter a number like 12.5, without spaces or thousands separators.";
  const parsed = parseNumberInput(text);
  if (!Number.isFinite(parsed)) return "Enter a number.";
  if (parsed < min) return min === 0 ? "Must be 0 or more." : `Min ${withUnit(min, unit)}.`;
  if (max !== undefined && parsed > max) return `Max ${withUnit(max, unit)}.`;
  return null;
}

export function parseNumberInput(text: string): number {
  return Number(text.trim().replace(",", "."));
}
