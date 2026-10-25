/**
 * Pure helpers of the live people area: names, document rows, query strings, error texts and the Agent-like object
 * the shell reads. No React, no fetch: src/live/format.test.ts covers them.
 */
import type { Agent } from "../auth/permissions.ts";
import type { MarketId } from "../markets/markets.ts";
import { ApiError } from "../api/httpClient.ts";
import { currentLanguage, tr } from "../i18n/index.ts";
import { DOCUMENT_TYPES, ONBOARDING_COUNTRIES, REQUIRED_DOCUMENTS } from "./onboardingContract.ts";
import type { AdminMe, DocumentStatus, DocumentSummary, Driver, Vehicle } from "./types.ts";

/** "Anna Berg", or the first name alone; the id when the server sent no name. */
export function fullName(first: string | undefined, last: string | undefined, fallback = ""): string {
  const name = [first, last].filter((part) => part && part.trim()).join(" ").trim();
  return name || fallback;
}

/** The document type's name in the panel's language (contract.json#driverOnboarding.documents.types); the id when unknown. */
export function documentTypeName(type: string, language: string = currentLanguage()): string {
  const info = DOCUMENT_TYPES[type];
  if (!info) return type;
  const lang = language === "sv" || language === "fr" ? language : "en";
  return info.name[lang] ?? info.name.en;
}

/** Whether a type takes an uploaded file (vs the terms acceptance or an admin check). */
export function documentHasFile(type: string): boolean {
  return (DOCUMENT_TYPES[type]?.kind ?? "file") === "file";
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

/** The text a screen shows for a failed call: plain for the known cases, with the request id for the unexpected ones. */
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error && error.message ? error.message : tr("Something failed.");
  if (error.status === 403) return tr("Your role cannot do that.");
  if (error.status === 401) return tr("Sign in again.");
  if (error.status === 409 && error.code === "version_mismatch") return tr("Someone else changed this record. It was reloaded; check it and try again.");
  if (error.status === 409 && error.reason === "on_trip") return tr("The driver is on a trip. Try again when the trip has ended.");
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
