import { ApiError } from "../api/httpClient.ts";
import { CURRENCIES, isCurrency, type CurrencyCode, type Money } from "../domain/money.ts";
import { tr } from "../i18n/core.ts";
import { errorText, parseMinor } from "../live/format.ts";
import type { MarketId } from "../markets/markets.ts";

/**
 * BQ-V44 (owner G10-5 "Make bonuses real (Recommended)", Rules decisions/driver-g10.md:9; Q12 "there is bonus zone and
 * normal zone", decisions/admin-fake-by-group.md:40): the real driver bonus campaigns of contract 0.18.110
 * (contract.json#bonusCampaigns, /admin/bonuses). An admin makes a campaign for one operating zone with its own area,
 * a measure (trips or hours online), a target, an amount and local dates; the SERVER counts, pays once and sums.
 * The panel only sends what the admin typed and shows the server's numbers: it never works progress or money out.
 * Not the trip bonus (POST /admin/trips/{tripId}/driver-bonus) and not the demo builder (bonus.ts / bonusDemo.ts, Rule 21).
 * Values are the contract's (0.18.110) as literals until the coordinator syncs the contract copy after the tag.
 */

export type CampaignMeasure = "trips" | "online_hours";
export type CampaignState = "scheduled" | "active" | "paused" | "ended";
export type CampaignStatus = "active" | "paused" | "ended";
export type CampaignNames = { sv: string; fr: string; en: string };
export type CampaignPoint = [number, number];

export const CAMPAIGN_MEASURES: readonly CampaignMeasure[] = ["trips", "online_hours"];
export const CAMPAIGN_STATES: readonly CampaignState[] = ["scheduled", "active", "paused", "ended"];

/** contract.json#bonusCampaigns.limits: target ranges (D1, whole numbers; online_hours in hours) and maxDays (D2). */
export const CAMPAIGN_LIMITS = { target: { trips: [1, 500], online_hours: [1, 200] }, maxDays: 92 } as const satisfies {
  target: Record<CampaignMeasure, readonly [number, number]>;
  maxDays: number;
};

/** contract.json#configDefaults.bonusCampaignMax (D13): SE 2 000,00 kr, FR 200,00 €, TN 200.000 DT. */
export const BONUS_CAMPAIGN_MAX: Record<MarketId, Money> = {
  SE: { amountMinor: 200000, currency: "SEK" },
  FR: { amountMinor: 20000, currency: "EUR" },
  TN: { amountMinor: 200000, currency: "TND" },
};

/** The live screen's buttons. `admin.server.*`: the screen sends its own request and the server writes the audit. */
export const CAMPAIGN_COMMANDS = {
  create: "admin.server.bonusCampaignCreate",
  edit: "admin.server.bonusCampaignEdit",
  pause: "admin.server.bonusCampaignPause",
  resume: "admin.server.bonusCampaignResume",
  end: "admin.server.bonusCampaignEnd",
  open: "admin.server.bonusCampaignOpen",
} as const;

export type BonusCampaign = {
  bonusId: string;
  zoneId: string;
  country: string;
  currency: CurrencyCode;
  timeZone: string;
  names: CampaignNames;
  measure: CampaignMeasure;
  target: number;
  amount: Money;
  startDate: string;
  endDate: string;
  polygon: CampaignPoint[];
  status: CampaignStatus;
  state: CampaignState;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  endedAt?: string;
  driversWithProgress: number;
  driversEarned: number;
  paidTotal: Money;
};

export type CampaignProgress = { done: number; target: number };
export type BonusProgress = { driverId: string; firstName: string; progress: CampaignProgress; earned: boolean; earnedAt?: string; entryId?: string };
export type CampaignPage<T> = { items: T[]; nextCursor: string | null };

/* ---------------------------------------------------------------- paths */

export const BONUSES_PATH = "/admin/bonuses";
const PAGE = 50;
const query = (parts: Array<[string, string | null | undefined]>) => parts.filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");

export function campaignListPath({ zoneId, state, cursor }: { zoneId?: string | null; state?: CampaignState | null; cursor: string | null }): string {
  return `${BONUSES_PATH}?${query([["zoneId", zoneId], ["state", state], ["cursor", cursor], ["limit", String(PAGE)]])}`;
}
export const campaignPath = (bonusId: string) => `${BONUSES_PATH}/${encodeURIComponent(bonusId)}`;
export const campaignCommandPath = (bonusId: string, action: "pause" | "resume" | "end") => `${campaignPath(bonusId)}/${action}`;
export const campaignDriversPath = (bonusId: string, cursor: string | null) => `${campaignPath(bonusId)}/drivers?${query([["cursor", cursor], ["limit", String(PAGE)]])}`;

/* ---------------------------------------------------------------- checks (the server's own rules, so the admin hears early) */

export type CampaignReason = "bonus_target_invalid" | "bonus_amount_invalid" | "bonus_amount_above_max" | "bonus_dates_invalid" | "bonus_area_invalid" | "bonus_names_invalid";
export type CampaignZone = { zoneId: string; currency: CurrencyCode; timeZone: string; polygon: CampaignPoint[]; max: Money };
export type CampaignInput = { measure: CampaignMeasure; target: number; amount: Money; startDate: string; endDate: string; polygon: CampaignPoint[] };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = (iso: string) => (ISO_DAY.test(iso) ? Date.parse(`${iso}T00:00:00Z`) : Number.NaN);

/** Days from start to end, both counted (both local dates of the zone). */
export function daysCounted(startDate: string, endDate: string): number {
  return Math.round((dayMs(endDate) - dayMs(startDate)) / 86_400_000) + 1;
}

/** The last end date a campaign starting on startDate may have (maxDays, both counted). */
export function lastEndDate(startDate: string): string {
  const ms = dayMs(startDate);
  return Number.isNaN(ms) ? "" : new Date(ms + (CAMPAIGN_LIMITS.maxDays - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** Today in the zone's time zone (YYYY-MM-DD). */
export function zoneToday(timeZone: string, nowMs: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}

/** A point inside the polygon or ON its edge (contract limits.polygon, MF6: the edge counts as inside). */
export function insideOrOnEdge(lat: number, lng: number, polygon: readonly CampaignPoint[]): boolean {
  let inside = false;
  for (let k = 0; k < polygon.length; k += 1) {
    const [y1, x1] = polygon[k]!;
    const [y2, x2] = polygon[(k + 1) % polygon.length]!;
    if ((x1 === x2 && x1 === lng && Math.min(y1, y2) <= lat && lat <= Math.max(y1, y2)) || (y1 === y2 && y1 === lat && Math.min(x1, x2) <= lng && lng <= Math.max(x1, x2))) return true;
    if (y1 > lat !== y2 > lat) {
      const x = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1);
      if (x === lng) return true;
      if (x > lng) inside = !inside;
    }
  }
  return inside;
}

/**
 * The server's checks of BonusCampaignCreate (contract bonusCampaigns.limits, replayed against fixtures/bonus_campaigns.json
 * #validate): target, amount (zone currency, above 0, at most the setting), dates (local, not before today, at most
 * maxDays) and the area (3–500 points, not closed, every point inside the zone). The server checks again; it decides.
 */
export function campaignCheck(zone: Pick<CampaignZone, "currency" | "polygon" | "max">, today: string, input: CampaignInput): CampaignReason | "ok" {
  const [lo, hi] = CAMPAIGN_LIMITS.target[input.measure] ?? [1, 0];
  if (!Number.isInteger(input.target) || input.target < lo || input.target > hi) return "bonus_target_invalid";
  if (input.amount.currency !== zone.currency || !Number.isInteger(input.amount.amountMinor) || input.amount.amountMinor <= 0) return "bonus_amount_invalid";
  if (input.amount.amountMinor > zone.max.amountMinor) return "bonus_amount_above_max";
  const start = dayMs(input.startDate);
  const end = dayMs(input.endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < dayMs(today) || daysCounted(input.startDate, input.endDate) > CAMPAIGN_LIMITS.maxDays) return "bonus_dates_invalid";
  const area = input.polygon;
  const first = area[0];
  const last = area[area.length - 1];
  if (area.length < 3 || area.length > 500 || (first && last && first[0] === last[0] && first[1] === last[1])) return "bonus_area_invalid";
  if (!area.every(([lat, lng]) => insideOrOnEdge(lat, lng, zone.polygon))) return "bonus_area_invalid";
  return "ok";
}

const namesOk = (names: CampaignNames) => (["sv", "fr", "en"] as const).every((lang) => {
  const text = (names[lang] ?? "").trim();
  return text.length >= 1 && text.length <= 80;
});
const trimmed = (names: CampaignNames): CampaignNames => ({ sv: names.sv.trim(), fr: names.fr.trim(), en: names.en.trim() });

export type CampaignForm = { zoneId: string; names: CampaignNames; measure: CampaignMeasure; target: string; amount: string; startDate: string; endDate: string; polygon: CampaignPoint[] };
export type CampaignCreateBody = { zoneId: string; names: CampaignNames; measure: CampaignMeasure; target: number; amount: Money; startDate: string; endDate: string; polygon: CampaignPoint[] };

/**
 * POST /admin/bonuses body from the form. The amount is the typed text read in the zone currency's minor units
 * (SEK/EUR 2 decimals, TND 3); a text with more decimals is refused, never rounded.
 */
export function campaignCreateBody(form: CampaignForm, zone: CampaignZone, today: string): { body: CampaignCreateBody } | { error: CampaignReason } {
  if (!namesOk(form.names)) return { error: "bonus_names_invalid" };
  const target = /^\d+$/.test(form.target.trim()) ? Number(form.target.trim()) : Number.NaN;
  const amountMinor = parseMinor(form.amount, zone.currency);
  const amount: Money = { amountMinor: amountMinor ?? 0, currency: zone.currency };
  const input: CampaignInput = { measure: form.measure, target, amount, startDate: form.startDate, endDate: form.endDate, polygon: form.polygon };
  const checked = campaignCheck(zone, today, input);
  if (checked !== "ok") return { error: checked };
  return { body: { zoneId: zone.zoneId, names: trimmed(form.names), measure: form.measure, target, amount, startDate: form.startDate, endDate: form.endDate, polygon: form.polygon.map(([lat, lng]) => [lat, lng]) } };
}

/** PUT /admin/bonuses/{bonusId}: only the names and a LATER end date (still within maxDays) can change (D8). */
export function campaignEditBody(campaign: Pick<BonusCampaign, "version" | "names" | "startDate" | "endDate">, next: { names: CampaignNames; endDate: string }): { body: { expectedVersion: number; names?: CampaignNames; endDate?: string } } | { error: CampaignReason } {
  if (!namesOk(next.names)) return { error: "bonus_names_invalid" };
  const names = trimmed(next.names);
  const namesChanged = (["sv", "fr", "en"] as const).some((lang) => names[lang] !== campaign.names[lang]);
  const endChanged = next.endDate !== campaign.endDate;
  if (endChanged && (Number.isNaN(dayMs(next.endDate)) || dayMs(next.endDate) < dayMs(campaign.endDate) || daysCounted(campaign.startDate, next.endDate) > CAMPAIGN_LIMITS.maxDays)) return { error: "bonus_dates_invalid" };
  return { body: { expectedVersion: campaign.version, ...(namesChanged ? { names } : {}), ...(endChanged ? { endDate: next.endDate } : {}) } };
}

/** Buttons a campaign has (contract endpoints.adminPause): pause on active, resume on paused, end on both; ended has none. */
export function campaignActions(campaign: Pick<BonusCampaign, "status" | "state">): Array<"pause" | "resume" | "end" | "edit"> {
  if (campaign.status === "ended" || campaign.state === "ended") return [];
  return [campaign.status === "paused" ? "resume" : "pause", "end", "edit"];
}

/* ---------------------------------------------------------------- reading the server */

const str = (v: unknown): v is string => typeof v === "string";
const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const moneyOf = (v: unknown): Money | null => {
  const m = v as { amountMinor?: unknown; currency?: unknown } | null;
  return m && int(m.amountMinor) && isCurrency(m.currency) ? { amountMinor: m.amountMinor, currency: m.currency } : null;
};
const namesOf = (v: unknown): CampaignNames | null => {
  const n = v as Partial<CampaignNames> | null;
  return n && str(n.sv) && str(n.fr) && str(n.en) ? { sv: n.sv, fr: n.fr, en: n.en } : null;
};

/** One BonusCampaign as the server sent it; null when a required field is missing or of the wrong kind. */
export function parseCampaign(value: unknown): BonusCampaign | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const names = namesOf(r.names);
  const amount = moneyOf(r.amount);
  const paidTotal = moneyOf(r.paidTotal);
  if (!str(r.bonusId) || !str(r.zoneId) || !str(r.country) || !isCurrency(r.currency) || !str(r.timeZone) || !names || !amount || !paidTotal) return null;
  if (!CAMPAIGN_MEASURES.includes(r.measure as CampaignMeasure) || !CAMPAIGN_STATES.includes(r.state as CampaignState) || !["active", "paused", "ended"].includes(r.status as string)) return null;
  if (!int(r.target) || !int(r.version) || !int(r.driversWithProgress) || !int(r.driversEarned) || !str(r.startDate) || !str(r.endDate) || !Array.isArray(r.polygon)) return null;
  return {
    bonusId: r.bonusId, zoneId: r.zoneId, country: r.country, currency: r.currency, timeZone: r.timeZone, names,
    measure: r.measure as CampaignMeasure, target: r.target, amount, startDate: r.startDate, endDate: r.endDate,
    polygon: (r.polygon as unknown[]).filter((p): p is CampaignPoint => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number"),
    status: r.status as CampaignStatus, state: r.state as CampaignState, version: r.version,
    createdAt: str(r.createdAt) ? r.createdAt : "", createdBy: str(r.createdBy) ? r.createdBy : "", updatedAt: str(r.updatedAt) ? r.updatedAt : "",
    ...(str(r.endedAt) ? { endedAt: r.endedAt } : {}),
    driversWithProgress: r.driversWithProgress, driversEarned: r.driversEarned, paidTotal,
  };
}

const cursorOf = (value: unknown) => {
  const c = (value as { nextCursor?: unknown } | null)?.nextCursor;
  return str(c) && c ? c : null;
};

export function parseCampaignPage(value: unknown): CampaignPage<BonusCampaign> {
  const items = (value as { items?: unknown } | null)?.items;
  return { items: Array.isArray(items) ? items.map(parseCampaign).filter((c): c is BonusCampaign => c !== null) : [], nextCursor: cursorOf(value) };
}

export function parseProgressPage(value: unknown): CampaignPage<BonusProgress> {
  const items = (value as { items?: unknown } | null)?.items;
  const rows = Array.isArray(items) ? items.flatMap((x): BonusProgress[] => {
    const r = (x ?? {}) as Record<string, unknown>;
    const p = (r.progress ?? {}) as Record<string, unknown>;
    if (!str(r.driverId) || !int(p.done) || !int(p.target) || typeof r.earned !== "boolean") return [];
    return [{ driverId: r.driverId, firstName: str(r.firstName) ? r.firstName : "", progress: { done: p.done, target: p.target }, earned: r.earned, ...(str(r.earnedAt) ? { earnedAt: r.earnedAt } : {}), ...(str(r.entryId) ? { entryId: r.entryId } : {}) }];
  }) : [];
  return { items: rows, nextCursor: cursorOf(value) };
}

/**
 * The largest campaign amount of a zone: its CountryRules.bonusCampaignMax as the server serves it (own rules, else the
 * country standard), else the contract default of the country. Another currency is not this country's limit.
 */
export function campaignMaxOf(countryRules: unknown, country: MarketId): Money {
  const fallback = BONUS_CAMPAIGN_MAX[country];
  const served = moneyOf((countryRules as { bonusCampaignMax?: unknown } | null)?.bonusCampaignMax);
  return served && served.currency === fallback.currency && served.amountMinor > 0 ? served : fallback;
}

/* ---------------------------------------------------------------- words */

/** Minutes as the contract's texts.duration ("4 h 20 min") or durationWholeHours ("10 h"). */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? tr("{0} h", [h]) : tr("{0} h {1} min", [h, m]);
}

/** "3 of 10 trips" / "4 h 20 min of 10 h online" from the server's progress numbers (contract progressFormat). */
export function campaignProgressText(measure: CampaignMeasure, progress: CampaignProgress): string {
  if (measure === "trips") return tr("{0} of {1} trips", [progress.done, progress.target]);
  return tr("{0} of {1} online", [durationText(progress.done), durationText(progress.target)]);
}

/** The target as the admin set it: "10 trips" / "10 h online". */
export function campaignTargetText(measure: CampaignMeasure, target: number): string {
  return measure === "trips" ? tr("{0} trips", [target]) : tr("{0} h online", [target]);
}

export const CAMPAIGN_STATE_LABEL: Record<CampaignState, string> = { scheduled: "Starts later", active: "Running now", paused: "Paused", ended: "Campaign ended" };

export function campaignStateText(state: CampaignState): string {
  if (state === "scheduled") return tr("Starts later");
  if (state === "active") return tr("Running now");
  if (state === "paused") return tr("Paused");
  return tr("Campaign ended");
}

/** The server's reasons (contract bonusCampaigns.errors) in the admin's language; null for any other reason. */
export function campaignReasonText(reason: string | null | undefined): string | null {
  if (reason === "bonus_target_invalid") return tr("The target must be a whole number: 1 to 500 trips, or 1 to 200 hours online.");
  if (reason === "bonus_amount_invalid") return tr("Type an amount above 0 in the zone's currency, with at most its decimals.");
  if (reason === "bonus_amount_above_max") return tr("The amount is above this country's largest campaign bonus (Pricing › Tips & limits).");
  if (reason === "bonus_dates_invalid") return tr("Check the dates: the start is today or later, the end is not before the start, at most 92 days.");
  if (reason === "bonus_area_invalid") return tr("Draw the area inside the zone: 3 to 500 points, every point inside the zone's outline.");
  if (reason === "bonus_field_fixed") return tr("Only the names and a later end date can change. To change anything else, end it and make a new campaign.");
  if (reason === "bonus_ended") return tr("This campaign has ended. It cannot change any more.");
  if (reason === "invalid_transition") return tr("The campaign changed meanwhile. It was reloaded; check it and try again.");
  if (reason === "bonus_names_invalid") return tr("Write the name in Swedish, French and English (1 to 80 characters each).");
  return null;
}

/** A failed campaign call in words: the campaign's own reasons first, else the panel's usual error text. */
export function campaignErrorText(error: unknown): string {
  if (error instanceof ApiError) return campaignReasonText(error.reason) ?? errorText(error);
  return errorText(error);
}

/** The amount unit shown next to the field ("kr", "€", "DT"). */
export const currencySymbol = (currency: CurrencyCode) => CURRENCIES[currency].symbol;
