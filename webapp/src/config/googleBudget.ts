import type { AdminScope } from "../live/types.ts";
import { OPEN } from "../drivers/onboardingSettings.ts";

/**
 * v0.18.171 (contract.json#googleRoadLines.dailyBudget / budgetSetting; owner 2026-11-27 "1,400 for prices and 600 for
 * road lines", 2026-11-28 "admin must be able to change the maximum number of Google calls per day"): Settings › Google
 * budget. ONE global budget for all countries (Google's quota is per project). GET /admin/maps/google-budget
 * (settings.read) answers the numbers and today's counts (America/Los_Angeles day); PUT (settings.publish, an admin who
 * covers every country) changes { dailyLimit, quotesPerDay }. The admin makes no Google call: it only reads and
 * writes these numbers on the Movera server.
 */
export type GoogleBudget = { dailyLimit: number; quotesPerDay: number; roadLinesPerDay: number; today: { day: string; quotes: number; roadLines: number } };
export type GoogleBudgetInput = { dailyLimit: number; quotesPerDay: number };
export type BudgetHttp = { json: <T>(path: string) => Promise<T>; put: <T>(path: string, body: unknown) => Promise<T> };

export const GOOGLE_BUDGET_PATH = "/admin/maps/google-budget";
export const GOOGLE_BUDGET_DEFAULTS: Readonly<GoogleBudgetInput> = { dailyLimit: 2000, quotesPerDay: 1400 };
/** openapi.yaml GoogleRoutesBudgetCommand: dailyLimit 100..100000, quotesPerDay 0..dailyLimit. */
export const DAILY_LIMIT_RANGE: readonly [number, number] = [100, 100000];

/** Road lines get what the quotes leave. */
export const roadLinesPerDay = (b: GoogleBudgetInput): number => Math.max(0, b.dailyLimit - b.quotesPerDay);

/** English issue text (translated by the panel), or null when the pair can be sent. */
export function budgetIssue(b: GoogleBudgetInput): string | null {
  if (!Number.isInteger(b.dailyLimit) || b.dailyLimit < DAILY_LIMIT_RANGE[0] || b.dailyLimit > DAILY_LIMIT_RANGE[1]) return "Daily limit: a whole number from 100 to 100000.";
  if (!Number.isInteger(b.quotesPerDay) || b.quotesPerDay < 0) return "Quotes per day: a whole number from 0.";
  if (b.quotesPerDay > b.dailyLimit) return "Quotes per day cannot be above the daily limit.";
  return null;
}

/** Only an admin who covers every country may save (server: 403 not_all_countries). */
export function coversAllCountries(scope: AdminScope | null | undefined): boolean {
  if (!scope || scope.zones !== "all" || scope.fleetPartnerId) return false;
  if (!scope.countries) return true;
  return (Object.keys(OPEN) as string[]).every((c) => scope.countries!.includes(c));
}

export const readGoogleBudget = (http: BudgetHttp): Promise<GoogleBudget> => http.json<GoogleBudget>(GOOGLE_BUDGET_PATH);
export const saveGoogleBudget = (http: BudgetHttp, b: GoogleBudgetInput): Promise<GoogleBudget> =>
  http.put<GoogleBudget>(GOOGLE_BUDGET_PATH, { dailyLimit: b.dailyLimit, quotesPerDay: b.quotesPerDay });

/** The clear English reason of a failed save (the panel translates it). */
export function budgetErrorText(error: unknown): string {
  const e = error as { status?: number; reason?: string | null; code?: string } | null;
  if (e?.status === 403 || e?.reason === "not_all_countries") return "Only an admin who covers every country can change the Google budget (403 not_all_countries).";
  if (e?.status === 400 || e?.reason === "invalid_budget") return "The server refused these numbers: quotes per day cannot be above the daily limit (400 invalid_budget).";
  return "Could not save. Try again.";
}

/**
 * The server's alert system_health:google_routes_budget:<CC> (contract.json#googleRoadLines.budgetAlert): the server
 * sends these English templates, the admin shows them in its language.
 */
export const GOOGLE_BUDGET_ALERT_PREFIX = "system_health:google_routes_budget:";
export const GOOGLE_BUDGET_ALERT_TEXTS = [
  "Google Routes daily limit reached — prices use the estimate until tomorrow.",
  "Google road lines used their daily share — lines are approximate until tomorrow.",
  "Today {0}: {1} of {2} Google calls used.",
] as const;
export const isGoogleBudgetAlert = (id: string): boolean => id.startsWith(GOOGLE_BUDGET_ALERT_PREFIX);
