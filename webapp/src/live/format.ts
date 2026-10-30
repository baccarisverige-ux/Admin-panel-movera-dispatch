/**
 * Pure helpers of the live people area: names, document rows, query strings, error texts and the Agent-like object
 * the shell reads. No React, no fetch: src/live/format.test.ts covers them.
 */
import type { Agent } from "../auth/permissions.ts";
import type { MarketId } from "../markets/markets.ts";
import { ApiError } from "../api/httpClient.ts";
import { CURRENCIES, formatMoney, type CurrencyCode, type Money } from "../domain/money.ts";
import { currentLanguage, tr, type MessageKey } from "../i18n/index.ts";
import { DOCUMENT_TYPES, ONBOARDING_COUNTRIES, REQUIRED_DOCUMENTS } from "./onboardingContract.ts";
import type { AdminMe, DocumentStatus, DocumentSummary, Driver, Vehicle } from "./types.ts";

/** "Anna Berg", or the first name alone; the id when the server sent no name. */
export function fullName(first: string | undefined, last: string | undefined, fallback = ""): string {
  const name = [first, last].filter((part) => part && part.trim()).join(" ").trim();
  return name || fallback;
}

type LocalName = { en: string; sv: string; fr: string };
type CountryTypes = { names: Map<string, LocalName>; kinds: Map<string, string> };
const COUNTRY_TYPES = new Map<string, CountryTypes>();

/**
 * Contract v0.17.0 (owner item 14): the admin's own document types and new names of a country, read with its onboarding
 * settings, so a type the contract does not know (custom_…) shows its name and kind everywhere in the panel.
 */
export function registerCountryTypes(country: string, doc: { customTypes?: Array<{ id?: string; kind: string; name: LocalName }>; texts?: Record<string, { name?: LocalName }> }): void {
  const entry: CountryTypes = { names: new Map(), kinds: new Map() };
  for (const custom of doc.customTypes ?? []) if (custom.id) { entry.names.set(custom.id, custom.name); entry.kinds.set(custom.id, custom.kind); }
  for (const [type, text] of Object.entries(doc.texts ?? {})) if (text.name) entry.names.set(type, text.name);
  COUNTRY_TYPES.set(country, entry);
}

function registered(type: string, country?: string): { name?: LocalName; kind?: string } {
  const own = country ? COUNTRY_TYPES.get(country) : undefined;
  if (own?.names.has(type) || own?.kinds.has(type)) return { name: own.names.get(type), kind: own.kinds.get(type) };
  if (!type.startsWith("custom_")) return {};
  for (const entry of COUNTRY_TYPES.values()) if (entry.kinds.has(type)) return { name: entry.names.get(type), kind: entry.kinds.get(type) };
  return {};
}

/** The document type's name in the panel's language (contract.json#driverOnboarding.documents.types, or the country's own); the id when unknown. */
export function documentTypeName(type: string, language: string = currentLanguage(), country?: string): string {
  const lang = language === "sv" || language === "fr" ? language : "en";
  // v0.18.3 (R5): the admin's text of that country, else the contract's name in that country, else the type's name.
  const name = registered(type, country).name ?? (country ? DOCUMENT_TYPES[type]?.nameByCountry?.[country] : undefined) ?? DOCUMENT_TYPES[type]?.name;
  if (!name) return type;
  return name[lang] || name.en;
}

/** Whether a type takes an uploaded file (vs the terms acceptance or an admin check). */
export function documentHasFile(type: string): boolean {
  return (registered(type).kind ?? DOCUMENT_TYPES[type]?.kind ?? "file") === "file";
}

/** An admin_check type (the info session, or the admin's own): Movera marks it held (POST …/documents/{type}/check). */
export function isAdminCheck(type: string): boolean {
  return (registered(type).kind ?? DOCUMENT_TYPES[type]?.kind) === "admin_check";
}

export type DocumentRow = { type: string; status: DocumentStatus; document: DocumentSummary | null; required: boolean };

/**
 * One row per required type (in the contract's order), with status "missing" when nothing was uploaded, then any
 * uploaded document of a type that is not required. The latest document of a type wins when the server sent several.
 */
export function documentRows(required: readonly string[] | undefined, documents: readonly DocumentSummary[] | undefined): DocumentRow[] {
  const byType = new Map<string, DocumentSummary>();
  for (const document of documents ?? []) byType.set(document.type, document);
  const rows: DocumentRow[] = [];
  const seen = new Set<string>();
  for (const type of required ?? []) {
    if (seen.has(type)) continue;
    seen.add(type);
    const document = byType.get(type) ?? null;
    rows.push({ type, status: document?.status ?? "missing", document, required: true });
  }
  for (const document of documents ?? []) {
    if (seen.has(document.type)) continue;
    seen.add(document.type);
    rows.push({ type: document.type, status: document.status, document, required: false });
  }
  return rows;
}

/** The person's required documents: the server's list, else the contract's for the country. */
export function requiredFor(driver: Pick<Driver, "requiredDocuments" | "requiredFleetDocuments" | "accountType" | "country">): { person: string[]; company: string[] } {
  const country = driver.country ? REQUIRED_DOCUMENTS[driver.country] : undefined;
  const person = driver.requiredDocuments ?? [...(country?.driver ?? [])];
  const company = driver.accountType === "fleet" ? driver.requiredFleetDocuments ?? [...(country?.fleet ?? [])] : [];
  return { person, company };
}

/**
 * The person's and the company's uploads for the two tables of a fleet account: a company type goes to the company
 * table (unless the person needs it too, like national_id in France), everything else to the person's.
 */
export function splitDocuments(documents: readonly DocumentSummary[], required: { person: readonly string[]; company: readonly string[] }): { person: DocumentSummary[]; company: DocumentSummary[] } {
  const company = new Set(required.company);
  const person = new Set(required.person);
  return {
    person: documents.filter((document) => !company.has(document.type) || person.has(document.type)),
    company: documents.filter((document) => company.has(document.type)),
  };
}

export function requiredForVehicle(vehicle: Pick<Vehicle, "requiredDocuments">, country?: string): string[] {
  if (vehicle.requiredDocuments) return vehicle.requiredDocuments;
  return [...((country && REQUIRED_DOCUMENTS[country]?.vehicle) ?? [])];
}

/** "3/5": approved documents over the required ones (person and, for a fleet account, company). */
export function documentCounts(driver: Pick<Driver, "documents" | "requiredDocuments" | "requiredFleetDocuments" | "accountType" | "country">): { approved: number; required: number } {
  const lists = requiredFor(driver);
  const required = [...new Set([...lists.person, ...lists.company])];
  const approved = required.filter((type) => driver.documents.some((document) => document.type === type && document.status === "approved")).length;
  return { approved, required: required.length };
}

/** "Stockholm län, SE" from the contract's cities; the ids when unknown. */
export function placeLabel(country: string | undefined, cityId: string | undefined): string {
  const city = country ? ONBOARDING_COUNTRIES[country]?.cities.find((item) => item.cityId === cityId) : undefined;
  const cityName = city?.name ?? cityId ?? "";
  return [cityName, country].filter(Boolean).join(", ");
}

/** A query string from the given filters, leaving out empty values; "" when nothing is set. */
export function listQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

const CATEGORY_NAMES: Record<string, MessageKey> = { economy: "Movera", comfort: "Comfort", premium: "Premium", priority: "Priority", xl: "XL", electric: "Electric", pet: "Pet" };
const RULE_PROBLEMS: Record<string, MessageKey> = {
  category_off: "the category is turned off",
  year_too_old: "the car is too old",
  too_few_seats: "too few seats",
  fuel_not_allowed: "fuel not allowed",
  fuel_required: "the fuel is missing",
  extra_needs_ride: "an extra needs a ride category too",
};

/** v0.18.3 (R2): Vehicle.ruleProblems / 409 vehicle_rules_not_met details ("<category>:<problem>") in the panel's language. */
export function ruleProblemText(detail: string): string {
  const [category = "", problem = ""] = detail.includes(":") ? detail.split(":", 2) : ["", detail];
  const what = RULE_PROBLEMS[problem] ? tr(RULE_PROBLEMS[problem]) : problem;
  if (!category) return what;
  const name = category === "car" ? tr("Car") : category === "child_seat" ? tr("Child seat") : (CATEGORY_NAMES[category] ? tr(CATEGORY_NAMES[category]) : category);
  return `${name}: ${what}`;
}

/** The text a screen shows for a failed call: plain for the known cases, with the request id for the unexpected ones. */
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error && error.message ? error.message : tr("Something failed.");
  if (error.status === 403) return tr("Your role cannot do that.");
  if (error.status === 401) return tr("Sign in again.");
  if (error.status === 409 && error.code === "version_mismatch") return tr("Someone else changed this record. It was reloaded; check it and try again.");
  // v0.18.3 (R2): approving a car that breaks the country's car rules.
  if (error.reason === "vehicle_rules_not_met") return tr("The car does not meet the country's car rules: {0}.", [error.details.map(ruleProblemText).join(", ") || "—"]);
  // v0.18.3 (R9): the issue date of a document cannot be in the future.
  if (error.reason === "issued_in_future") return tr("The issue date cannot be in the future.");
  // v0.18.0 (owner 2026-10-29, live audit): car details, the car's driver, categories and the bank review.
  if (error.reason === "category_not_allowed") return tr("The car does not fit that category: {0}.", [error.details.join(", ") || "—"]);
  if (error.reason === "plate_taken") return tr("Another car already has this plate.");
  if (error.reason === "driver_not_in_fleet") return tr("That driver is not in the car's fleet.");
  if (error.reason === "vehicle_not_approved") return tr("The car is not approved yet.");
  if (error.reason === "vehicle_documents_not_approved") return tr("The car's documents are not approved yet.");
  if (error.reason === "vehicle_in_use") return tr("The car is in use by another driver.");
  if (error.reason === "driver_online") return tr("The driver is online. Try again when the driver is offline.");
  if (error.reason === "no_vehicle") return tr("The driver has no car, so no category can be set.");
  if (error.reason === "bank_not_uploaded") return tr("The driver has not uploaded bank details yet.");
  if (error.reason === "note_required") return tr("Write a note: the driver sees why the bank details were rejected.");
  // v0.17.0 (owner item 1): approving a document that expires needs its date.
  if (error.status === 400 && error.reason === "expiry_required") return tr("This document expires: type the expiry date from the document (after today).");
  if (error.status === 400 && error.reason === "expiry_in_past") return tr("The expiry date must be after today.");
  if (error.status === 409 && error.reason === "on_trip") return tr("The driver is on a trip. Try again when the trip has ended.");
  if (error.status === 409 && error.reason === "invitation_expired") return tr("This invitation has expired.");
  if (error.status === 409 && error.reason === "invitation_closed") return tr("This invitation was already answered or withdrawn.");
  if (error.status === 409 && error.reason === "driver_not_signed_up") return tr("That number has no account yet. Accept is possible once it signs up.");
  if (error.status === 409 && error.reason === "already_in_fleet") return tr("The driver is already in a fleet.");
  if (error.status === 404 && error.reason === "invitation_not_found") return tr("This invitation is no longer on the fleet.");
  if (error.status === 429) return error.retryAfterSeconds ? tr("Too many attempts. Wait {0} s.", [error.retryAfterSeconds]) : tr("Too many attempts. Wait.");
  if (error.status === 0) return error.message;
  const unexpected = error.status >= 500 || error.code === "internal" || error.code === "unavailable";
  if (unexpected && error.requestId) return `${error.message} (${tr("request {0}", [error.requestId])})`;
  return error.message;
}

/** The sign-in screen's message: one text for every wrong credential, the wait for a lock, the server's text otherwise. */
export function signInErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return tr("Wrong e-mail or password.");
    if (error.status === 429) return error.retryAfterSeconds ? tr("Too many attempts. Wait {0} s.", [error.retryAfterSeconds]) : tr("Too many attempts. Wait.");
  }
  return errorText(error);
}

const MARKETS: readonly MarketId[] = ["SE", "FR", "TN"];

/** The Agent the shell, the menu and the language picker read, built from the server's AdminMe (adminId = id). */
export function agentFromAdmin(admin: AdminMe): Agent {
  const countries = admin.scope.countries?.filter((code): code is MarketId => (MARKETS as readonly string[]).includes(code));
  const language = admin.language === "en" || admin.language === "fr" || admin.language === "sv" ? admin.language : undefined;
  return {
    id: admin.adminId,
    email: admin.email,
    name: admin.name,
    password: "",
    code: "",
    role: admin.role,
    active: true,
    presence: "online",
    scope: {
      zones: admin.scope.zones === "all" ? "all" : [...admin.scope.zones],
      market: "SE-STO",
      ...(countries && countries.length ? { countries } : {}),
      ...(admin.scope.fleetPartnerId ? { fleetPartnerId: admin.scope.fleetPartnerId } : {}),
    },
    ...(language ? { language } : {}),
  };
}

/** Whether the signed-in admin holds a permission: the server's expanded list, never the panel's role tables. */
export function adminCan(admin: Pick<AdminMe, "permissions"> | null | undefined, permission: string): boolean {
  return Boolean(admin?.permissions.includes(permission));
}

/** The server base of the live mode: "" (same origin) for VITE_ADMIN_API=http, else the URL without its trailing slash. */
export function liveBaseUrl(value: string | undefined): string {
  if (!value || value === "http") return "";
  return value.replace(/\/$/, "");
}

/** A YYYY-MM-DD or ISO timestamp as a date in the panel's language; "" when missing. */
/** A timestamp with its time of day ("25 Oct 2026, 08:01"), for timelines. */
export function shortDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(date);
}

export function shortDate(value: string | undefined, locale: string): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: value.length === 10 ? "UTC" : undefined }).format(date);
}

/** True when the document can be shown in the browser (jpeg, png, pdf); HEIC is offered as a download instead. */
export function viewableMediaType(mediaType: string): "image" | "pdf" | "download" {
  if (mediaType.startsWith("image/heic") || mediaType.startsWith("image/heif")) return "download";
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "pdf";
  return "download";
}

/** Money from the server in the currency's own format ("520,00 kr"); an unknown currency as "520.00 XYZ". */
export function liveMoney(value: { amountMinor: number; currency: string } | null | undefined): string {
  if (!value) return "—";
  if (value.currency in CURRENCIES) return formatMoney(value as Money);
  return `${(value.amountMinor / 100).toFixed(2)} ${value.currency}`;
}

/**
 * The amount an admin types ("120,50" or "120.50") in minor units of the currency; null when it is not a number with at
 * most the currency's decimals.
 */
export function parseMinor(text: string, currency: string): number | null {
  const exponent = currency in CURRENCIES ? CURRENCIES[currency as CurrencyCode].exponent : 2;
  const clean = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > exponent) return null;
  return Number(whole) * 10 ** exponent + Number(frac.padEnd(exponent, "0") || "0");
}

/** The trip's timeline from the projection's own timestamps, oldest first. */
export function tripTimeline(trip: { createdAt: string; scheduledAt?: string; acceptedAt?: string; updatedAt: string; cancellation?: { at: string } }): { label: "Created" | "Scheduled for" | "Driver accepted" | "Cancelled" | "Last change"; at: string }[] {
  const rows: { label: "Created" | "Scheduled for" | "Driver accepted" | "Cancelled" | "Last change"; at: string }[] = [{ label: "Created", at: trip.createdAt }];
  if (trip.scheduledAt) rows.push({ label: "Scheduled for", at: trip.scheduledAt });
  if (trip.acceptedAt) rows.push({ label: "Driver accepted", at: trip.acceptedAt });
  if (trip.cancellation) rows.push({ label: "Cancelled", at: trip.cancellation.at });
  if (!trip.cancellation || trip.cancellation.at !== trip.updatedAt) rows.push({ label: "Last change", at: trip.updatedAt });
  return rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** contract.json#fareLines codes in the admin's words (sv/fr/en through the dictionary). */
export const FARE_LINE_LABEL = {
  base: "Base fare",
  distance: "Distance",
  time: "Time",
  stops: "Extra stops",
  waiting: "Waiting at pickup",
  pickup_fee: "Pickup fee",
  surge: "Surge",
  discount: "Discount",
  cancel_fee: "Cancel fee",
  app_fee: "App fee",
  minimum_adjust: "Raised to the minimum",
  maximum_adjust: "Lowered to the maximum",
  stop_waiting: "Waiting at stops",
  extras: "Extras",
  airport: "Airport fee",
  reservation_fee: "Reservation fee",
  fixed_route: "Fixed route price",
  rounding: "Rounding",
  outstanding_fee: "Unpaid fee from an earlier trip",
  rider_raise: "Rider raised the price",
  pickup_pay: "Driver pickup pay · paid by Movera",
  driver_bonus: "Money added for the driver (paid by Movera)",
} as const;

export function fareLineLabel(code: string): string {
  const label = (FARE_LINE_LABEL as Record<string, (typeof FARE_LINE_LABEL)[keyof typeof FARE_LINE_LABEL]>)[code];
  return label ? tr(label) : code;
}

const ROW_HEALTH: Record<string, string> = { approved: "valid", in_review: "review", expired: "invalid", rejected: "invalid", missing: "invalid" };

/**
 * The health of one live document row: an approved document whose end date is within the warning days is "expiring"
 * (owner G2 R10: the driver page's expiring list comes from the server's dates, not the demo).
 */
export function liveRowHealth(row: { status: string; document: { expiresAt?: string } | null }, nowMs: number, warnDays: number): string {
  const base = ROW_HEALTH[row.status] ?? "invalid";
  const end = row.document?.expiresAt ? Date.parse(row.document.expiresAt) : NaN;
  if (base !== "valid" || !Number.isFinite(end)) return base;
  if (end < nowMs) return "invalid";
  return end - nowMs <= warnDays * 86_400_000 ? "expiring" : "valid";
}
