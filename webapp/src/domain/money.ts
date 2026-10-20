import { z } from "zod";

/** ISO 4217 currencies of contract v0.3.0 (contract.json#currencies): exponent = minor-unit digits. */
export const CURRENCIES = {
  SEK: { exponent: 2, symbol: "kr", locale: "sv-SE" },
  EUR: { exponent: 2, symbol: "€", locale: "fr-FR" },
  TND: { exponent: 3, symbol: "DT", locale: "fr-TN" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

/** Wire money: integer minor units in an ISO 4217 currency. No floats, no display strings. */
export type Money = { amountMinor: number; currency: CurrencyCode };

export const currencySchema = z.enum(Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]]);
export const moneySchema = z.object({ amountMinor: z.number().int(), currency: currencySchema }).strict();

export function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

export function isMoney(value: unknown): value is Money {
  return moneySchema.safeParse(value).success;
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountMinor)) throw new RangeError(`amountMinor must be an integer, got ${amountMinor}`);
  return { amountMinor, currency };
}

export function exponentOf(currency: CurrencyCode): number {
  return CURRENCIES[currency].exponent;
}

/** "126.75", "-20.00", "12.500": the exact decimal amount (fixtures/money.json `major`). */
export function toMajorString({ amountMinor, currency }: Money): string {
  const exponent = exponentOf(currency);
  const abs = Math.abs(amountMinor);
  const step = 10 ** exponent;
  return `${amountMinor < 0 ? "-" : ""}${Math.floor(abs / step)}.${String(abs % step).padStart(exponent, "0")}`;
}

/** Major units to minor units for this currency (TND has 1000 millimes, not 100). */
export function fromMajor(major: number, currency: CurrencyCode): Money {
  return money(Math.round(major * 10 ** exponentOf(currency)), currency);
}

function separators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.5);
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: (parts.find((part) => part.type === "group")?.value ?? "").replace(/\s/g, " "),
  };
}

/**
 * The one money formatter of the admin (C-23): every other helper (markets formatMoney, formatOre,
 * formatSek, the pricing money()) calls this one.
 * Display money with the currency's own decimals and symbol: "126,75 kr", "3,35 €", "12,500 DT".
 * The locale only picks the decimal and group separators (default: the currency's home locale).
 * Output is plain ASCII spaces and "-" so it is stable in tests and CSV.
 * `compact` is for big totals on cards: whole units, and "12,3 k kr" style from 10 000 up.
 */
export function formatMoney(value: Money, locale?: string, options: { grouping?: boolean; compact?: boolean } = {}): string {
  const { exponent, symbol, locale: home } = CURRENCIES[value.currency];
  if (options.compact) {
    const major = value.amountMinor / 10 ** exponent;
    const number = new Intl.NumberFormat(locale ?? home, { notation: Math.abs(major) >= 10_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(major) >= 10_000 ? 1 : 0 }).format(major);
    return `${number.replace(/\s/g, " ").replace("\u2212", "-")} ${symbol}`;
  }
  const { decimal, group } = separators(locale ?? home);
  const [whole, frac] = toMajorString(value).replace("-", "").split(".");
  const grouped = options.grouping === false || !group ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${value.amountMinor < 0 ? "-" : ""}${grouped}${exponent ? `${decimal}${frac}` : ""} ${symbol}`;
}
