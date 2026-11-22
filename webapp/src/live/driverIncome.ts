/**
 * v0.18.153 P29 (contract.json#driverIncomeYear; owner 2026-11-21 "Don't only save ! Execute ! Add section in admin all what
 * need and in code and everywhere" + "Also another one ( yearly but with monthly details ) and can choose with monthly and
 * daily or monthly and dayly and even all trip per day also"; EU DAC7): Admin › Finance › Driver income (year). Pure parts
 * of the page: the query, the detail choices, the column help texts and the download name. The money is the server's;
 * the panel never works an amount out (moneyBase).
 */

export type IncomeMoney = { amountMinor: number; currency: string };
export const MONEY_FIELDS = ["grossFares", "tips", "bonuses", "adjustments", "pickupPay", "feeShare", "moveraCommission", "moveraFees", "netEarnings", "cashCollectedByDriver", "paidOutByMovera"] as const;
export type IncomeMoneyField = (typeof MONEY_FIELDS)[number];
export type IncomeTotals = { rides: number } & Record<IncomeMoneyField, IncomeMoney>;
export type IncomeTripLine = IncomeTotals & { localTime: string; lineKind?: "trip" | "credit" | "payout"; tripId: string | null; zoneId: string | null; paymentMethod: string | null };
export type IncomeDay = IncomeTotals & { day: string; trips?: IncomeTripLine[] };
export type IncomeMonth = IncomeTotals & { month: string; days?: IncomeDay[] };
export type IncomeQuarter = IncomeTotals & { quarter: number };
export type IncomeRow = IncomeTotals & {
  kind: "company" | "driver";
  payeeId: string;
  name: string;
  orgNumber: string | null;
  address: string | null;
  country: string | null;
  currency: string;
  bank: { holder: string; last4: string } | null;
  driverIds: string[];
  ownPartOnly?: boolean;
  /** v0.18.153 review SHOULD-4: this payee also has money outside the zones in view. */
  partial?: boolean;
  quarters: IncomeQuarter[];
  months?: IncomeMonth[];
};
export type IncomePage = { year: number; detail: IncomeDetail; month?: string; items: IncomeRow[]; nextCursor: string | null; generatedAt: string };
export type IncomeDetail = "quarter" | "month" | "day" | "trips";

/** The "Details" chooser (owner: Quarters / Months / Months + days / All trips per day). */
export const DETAIL_CHOICES: readonly { id: IncomeDetail; label: string }[] = [
  { id: "quarter", label: "Quarters" },
  { id: "month", label: "Months" },
  { id: "day", label: "Months + days" },
  { id: "trips", label: "All trips per day" },
];

/**
 * The year picker: every year from 2020 up to this one; last year first chosen (the year the accountant files). "This
 * year" is the server's: it refuses a year after the current UTC year (income_year_invalid), so the list uses the UTC
 * year, never the browser's local one (around New Year they differ).
 */
export function yearChoices(now: Date): number[] {
  const out: number[] = [];
  for (let year = now.getUTCFullYear(); year >= 2020; year -= 1) out.push(year);
  return out;
}
export const defaultYear = (now: Date) => Math.max(2020, now.getUTCFullYear() - 1);

/** The query of GET /admin/finance/driver-income(.csv). All trips per day needs a month or a payee (income_detail_too_big). */
export function incomeQuery(input: { year: number; detail: IncomeDetail; month?: string | null; payeeId?: string | null; zoneParams?: readonly [string, string][]; cursor?: string | null; limit?: number }): string {
  const q = new URLSearchParams();
  q.set("year", String(input.year));
  q.set("detail", input.detail);
  if (input.month) q.set("month", input.month);
  if (input.payeeId) q.set("payeeId", input.payeeId);
  for (const [k, v] of input.zoneParams ?? []) q.append(k, v);
  if (input.cursor) q.set("cursor", input.cursor);
  if (input.limit) q.set("limit", String(input.limit));
  return q.toString();
}

/** All trips per day: the list shows days; the trips of one payee's month are read when it is opened. */
export const listDetail = (detail: IncomeDetail): IncomeDetail => (detail === "trips" ? "day" : detail);
export const tripsNeedScope = (detail: IncomeDetail, month: string | null, payeeId: string | null) => detail === "trips" && !month && !payeeId;

/** The file name the server sends (Content-Disposition), for the browser download. */
export function csvFileName(year: number, detail: IncomeDetail, month?: string | null): string {
  return `movera-driver-income-${year}${month ? `-${month.slice(5)}` : ""}-${detail}.csv`;
}

export const monthChoices = (year: number): string[] => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

/** The (i) text of each column (owner: English only). */
export const COLUMN_INFO: Record<"payee" | "orgNumber" | "rides" | "partial" | IncomeMoneyField, string> = {
  partial: "This company or driver also earned or was paid in zones you do not cover. The row shows only your zones; an admin with every zone sees the whole amount for the tax report.",
  payee: "Who is reported: the taxi company (fleet) the driver drives for, or the driver himself when he has no company.",
  orgNumber: "The company's organisation number. Empty for a driver without a company: Movera does not store a personal ID number.",
  rides: "Paid rides of the period (pay in the car included).",
  grossFares: "What riders paid for the rides, VAT included, tips not included.",
  tips: "Tips riders gave (cash tips included).",
  bonuses: "Bonuses Movera paid: trip bonuses, lost-ride payments and bonus campaigns.",
  adjustments: "Changes Movera made to the driver's pay after the ride (can be negative).",
  pickupPay: "Pickup pay Movera paid for driving to the rider.",
  feeShare: "The driver's share of cancel and no-show fees.",
  moveraCommission: "What Movera kept from the fares at each ride's end.",
  moveraFees: "Movera's share of the cancel and no-show fees.",
  netEarnings: "What the driver earned through the app, counted on the day it was credited (the same as the driver's Earnings): rides + pickup pay + fee share + tips + changes + bonuses. This is the amount for DAC7.",
  cashCollectedByDriver: "Money the driver took in the car (pay in the car). Already in his hand, part of the earnings.",
  paidOutByMovera: "What Movera paid out in payouts marked paid in this period (by the day it was paid). Never below 0.",
};

/** The column order of the table (money columns the accountant needs first). */
export const TABLE_FIELDS: readonly IncomeMoneyField[] = ["grossFares", "netEarnings", "moveraCommission", "moveraFees", "tips", "bonuses", "adjustments", "pickupPay", "feeShare", "cashCollectedByDriver", "paidOutByMovera"];
export const FIELD_LABEL: Record<IncomeMoneyField, string> = {
  grossFares: "Fares",
  tips: "Tips",
  bonuses: "Bonuses",
  adjustments: "Pay changes",
  pickupPay: "Pickup pay",
  feeShare: "Fee share",
  moveraCommission: "Movera commission",
  moveraFees: "Movera fee share",
  netEarnings: "Earnings",
  cashCollectedByDriver: "Cash in the car",
  paidOutByMovera: "Paid out",
};
