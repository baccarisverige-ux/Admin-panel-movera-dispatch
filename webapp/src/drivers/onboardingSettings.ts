import { DOCUMENT_TYPES } from "../live/onboardingContract.ts";
import type { MarketId } from "../markets/markets.ts";

/**
 * Contract v0.17.0 §25 (contract.json#driverOnboarding.settings; owner decisions of 2026-10-29, driver group 2 items
 * 10, 11, 12, 14, 15 and the note check): Drivers › Onboarding settings and Vehicles › Rules are ONE config document
 * per country, `onboarding`. The demo keeps the same document in the slice below; the live build reads and publishes
 * it with GET/PUT /admin/config/onboarding?country and POST …/publish { country } (src/live/liveSettings.ts). The page
 * is the same in both, so the demo looks exactly like live.
 *
 * Owner item 14/15: "admin can remove and add documents text ( if there is 5 can add more or delete and write the name
 * of documents)": per country and account type the admin adds a contract type or a NEW type (name + help in sv / fr /
 * en, owner, kind, expires), edits the name and help of any type, and removes a type from a list.
 */

export const ONBOARDING_SETTINGS_KEY = "onboardingSettings";

export type Scope = "driver" | "fleet" | "vehicle";
export const SCOPES: readonly Scope[] = ["driver", "fleet", "vehicle"];
export type Fuel = "petrol" | "diesel" | "hybrid" | "electric";
export const FUEL_IDS: readonly Fuel[] = ["petrol", "diesel", "hybrid", "electric"];
export type LocalText = { sv: string; fr: string; en: string };
export type CustomType = { id?: string; draftKey?: string; owner: Scope; kind: "file" | "admin_check"; expires: boolean; name: LocalText; help: LocalText };
export type CategoryRule = { category: string; on: boolean; minYear: number; minSeats: number; fuels: Fuel[] };
export type StepId = "signup" | "documents" | "checks" | "training" | "ready";

export type SettingsDoc = {
  version: number;
  publishedAt?: string;
  country: string;
  documents: Record<Scope, string[]>;
  expiringTypes: string[];
  steps: Array<{ id: StepId; on: boolean; days: number }>;
  signUpReminders: { on: boolean; everyDays: number; stuckAfterDays: number };
  expiry: { warnDays: number[]; blockAtExpiry: boolean };
  vehicles: { categories: CategoryRule[]; warnDays: number; autoHold: boolean; photosNeeded: boolean };
  customTypes?: CustomType[];
  texts?: Record<string, { name?: LocalText; help?: LocalText }>;
  /** v0.18.3 (R8): the upload guide per type in this country; an empty list falls back to the app's own text. */
  guides?: Record<string, Guide>;
  /** v0.18.3 (R9): months a document of that type is valid from its issue date (1 to 120; FR urssaf_certificate 6). */
  validMonths?: Record<string, number>;
};

export type Guide = { checklist: LocalText[]; tips: LocalText[] };
export const GUIDE_LIMITS = { lines: 10, lineChars: 300 } as const;

/** One country as the page holds it: the server's draft version (PUT's expectedVersion), the live version and the document. */
export type CountryEntry = { draftVersion: number; liveVersion: number; document: SettingsDoc };
export type SettingsBook = { draftRev: number; countries: Record<MarketId, CountryEntry> };

export const STEP_IDS: readonly StepId[] = ["signup", "documents", "checks", "training", "ready"];
export const PHOTO_TYPES = ["vehicle_photo_front", "vehicle_photo_back", "vehicle_photo_side", "vehicle_photo_inside"] as const;
export const LIMITS = { stepDays: [1, 60], remindEveryDays: [1, 30], stuckAfterDays: [2, 90], warnDays: [1, 90], vehicleWarnDays: [1, 120], minYear: [1990, 2030], minSeats: [1, 9], validMonths: [1, 120] } as const;
export const CUSTOM_ID = /^custom_[a-z0-9]{10}$/;
export const DRAFT_REF = "draft:";
/** The country is open for sign-ups (contract.json#driverOnboarding.countries): Tunisia is shown but closed. */
export const OPEN: Readonly<Record<MarketId, boolean>> = { SE: true, FR: true, TN: false };

const ALL: Fuel[] = ["petrol", "diesel", "hybrid", "electric"];
const PREMIUM: Fuel[] = ["hybrid", "electric", "petrol", "diesel"];
function categories(base: number): CategoryRule[] {
  return [
    { category: "economy", on: true, minYear: base, minSeats: 4, fuels: [...ALL] },
    { category: "comfort", on: true, minYear: base + 4, minSeats: 4, fuels: [...ALL] },
    { category: "premium", on: true, minYear: base + 6, minSeats: 4, fuels: [...PREMIUM] },
    { category: "priority", on: true, minYear: base, minSeats: 4, fuels: [...ALL] },
    { category: "xl", on: true, minYear: base, minSeats: 6, fuels: [...ALL] },
    { category: "electric", on: true, minYear: base + 2, minSeats: 4, fuels: ["electric"] },
    { category: "pet", on: true, minYear: base, minSeats: 4, fuels: [...ALL] },
  ];
}
const STEPS = (): SettingsDoc["steps"] => [
  { id: "signup", on: true, days: 3 },
  { id: "documents", on: true, days: 7 },
  { id: "checks", on: true, days: 3 },
  { id: "training", on: true, days: 5 },
  { id: "ready", on: true, days: 2 },
];

/** contract.json#driverOnboarding.settings.defaults (src/drivers/onboardingSettings.test.ts checks they are equal). */
export function contractDefaults(): Record<MarketId, Omit<SettingsDoc, "version" | "country" | "publishedAt">> {
  const common = (base: number) => ({ steps: STEPS(), signUpReminders: { on: true, everyDays: 2, stuckAfterDays: 10 }, expiry: { warnDays: [30, 7, 1], blockAtExpiry: true }, vehicles: { categories: categories(base), warnDays: 30, autoHold: true, photosNeeded: true }, customTypes: [], texts: {}, guides: {}, validMonths: {} });
  return {
    SE: {
      documents: { driver: ["terms", "info_session", "driving_license", "profile_photo", "taxi_driver_license"], fleet: ["company_registration", "taxi_traffic_permit", "tax_settings", "bank_statement"], vehicle: ["vehicle_registration", "insurance"] },
      expiringTypes: ["driving_license", "taxi_driver_license", "taxi_traffic_permit", "vehicle_registration", "insurance"],
      ...common(2015),
    },
    FR: {
      documents: { driver: ["terms", "info_session", "vtc_card", "driving_license", "national_id", "profile_photo"], fleet: ["company_registration", "vtc_register_certificate", "rc_pro_insurance", "urssaf_certificate", "national_id", "bank_statement"], vehicle: ["vehicle_registration", "insurance", "vtc_sticker"] },
      expiringTypes: ["driving_license", "national_id", "vtc_card", "vehicle_registration", "insurance", "rc_pro_insurance", "urssaf_certificate", "vtc_sticker", "vtc_register_certificate"],
      ...common(2016),
      validMonths: { urssaf_certificate: 6 },
    },
    TN: { documents: { driver: [], fleet: [], vehicle: [] }, expiringTypes: [], ...common(2012) },
  };
}

export function defaultDoc(country: MarketId): SettingsDoc {
  return { version: 0, country, ...structuredClone(contractDefaults()[country]) };
}

export function emptySettingsBook(): SettingsBook {
  const entry = (country: MarketId): CountryEntry => ({ draftVersion: 1, liveVersion: 0, document: defaultDoc(country) });
  return { draftRev: 1, countries: { SE: entry("SE"), FR: entry("FR"), TN: entry("TN") } };
}

export function normalizeSettingsBook(value: unknown): SettingsBook {
  const base = emptySettingsBook();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<SettingsBook>;
  const countries = { ...base.countries };
  for (const id of Object.keys(base.countries) as MarketId[]) {
    const saved = raw.countries?.[id];
    if (saved && saved.document && Array.isArray(saved.document.documents?.driver)) {
      const document = { ...defaultDoc(id), ...saved.document };
      const fresh = (document.customTypes ?? []).some((item) => item.id === undefined);
      countries[id] = { draftVersion: saved.draftVersion ?? 1, liveVersion: saved.liveVersion ?? 0, document: fresh ? prepareSettings(document, (key) => demoIdOf(key, id)) : document };
    }
  }
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, countries };
}

/* ---------------------------------------------------------------- document types */

export type TypeInfo = { type: string; owner: Scope; kind: "file" | "acceptance" | "admin_check"; expires: boolean; custom: boolean; name: LocalText; help: LocalText | null };

/** A type as this country shows it: a contract type with the admin's texts, or one of the admin's own. */
export function typeInfo(doc: SettingsDoc, type: string, scope?: Scope): TypeInfo | null {
  const custom = (doc.customTypes ?? []).find((item) => item.id === type || (item.draftKey !== undefined && `${DRAFT_REF}${item.draftKey}` === type));
  if (custom) return { type, owner: custom.owner, kind: custom.kind, expires: custom.expires, custom: true, name: custom.name, help: custom.help };
  const base = DOCUMENT_TYPES[type];
  if (!base) return null;
  const text = doc.texts?.[type];
  const owner: Scope = base.owner === "vehicle" ? "vehicle" : scope === "fleet" ? "fleet" : "driver";
  return { type, owner, kind: base.kind, expires: doc.expiringTypes.includes(type), custom: false, name: text?.name ?? base.name, help: text?.help ?? null };
}

export function localName(text: LocalText, language: string): string {
  const lang = language === "sv" || language === "fr" ? language : "en";
  return text[lang] || text.en;
}

/** Contract types the admin can still add to a list: the right owner, not listed yet (the car photos come with photosNeeded). */
export function addableTypes(doc: SettingsDoc, scope: Scope): string[] {
  const owner = scope === "vehicle" ? "vehicle" : "driver";
  return Object.entries(DOCUMENT_TYPES)
    .filter(([type, info]) => info.owner === owner && !doc.documents[scope].includes(type) && !(PHOTO_TYPES as readonly string[]).includes(type))
    .map(([type]) => type);
}

export function addToList(doc: SettingsDoc, scope: Scope, type: string): SettingsDoc {
  if (doc.documents[scope].includes(type)) return doc;
  return { ...doc, documents: { ...doc.documents, [scope]: [...doc.documents[scope], type] } };
}

/**
 * Remove a type from one list. A type the admin made lives in one list only, so removing it deletes it from the
 * country (contract: "Deleting an entry removes the type from the country: it must not stay in a list").
 */
export function removeFromList(doc: SettingsDoc, scope: Scope, type: string): SettingsDoc {
  const documents = { ...doc.documents, [scope]: doc.documents[scope].filter((item) => item !== type) };
  const custom = (doc.customTypes ?? []).find((item) => item.id === type || `${DRAFT_REF}${item.draftKey}` === type);
  if (custom) return { ...doc, documents, customTypes: (doc.customTypes ?? []).filter((item) => item !== custom), expiringTypes: doc.expiringTypes.filter((item) => item !== type) };
  const stillListed = SCOPES.some((other) => documents[other].includes(type));
  return { ...doc, documents, expiringTypes: stillListed ? doc.expiringTypes : doc.expiringTypes.filter((item) => item !== type) };
}

export type NewType = { owner: Scope; kind: "file" | "admin_check"; expires: boolean; name: LocalText; help: LocalText };

/** A new type the admin made: sent with a draftKey; the server gives it its id (custom_…) when the draft is saved. */
export function addCustomType(doc: SettingsDoc, input: NewType, draftKey: string): SettingsDoc {
  const ref = `${DRAFT_REF}${draftKey}`;
  const entry: CustomType = { draftKey, owner: input.owner, kind: input.kind, expires: input.expires, name: trimText(input.name), help: trimText(input.help) };
  return {
    ...doc,
    customTypes: [...(doc.customTypes ?? []), entry],
    documents: { ...doc.documents, [input.owner]: [...doc.documents[input.owner], ref] },
    expiringTypes: input.expires ? [...doc.expiringTypes, ref] : doc.expiringTypes,
  };
}

const trimText = (text: LocalText): LocalText => ({ sv: text.sv.trim(), fr: text.fr.trim(), en: text.en.trim() });

/** Change the name and help of a type: a custom type's own texts, or texts[type] for a contract type. */
export function editType(doc: SettingsDoc, type: string, change: { name: LocalText; help: LocalText; expires: boolean; kind?: "file" | "admin_check" }): SettingsDoc {
  const custom = (doc.customTypes ?? []).find((item) => item.id === type || `${DRAFT_REF}${item.draftKey}` === type);
  const expiringTypes = change.expires ? (doc.expiringTypes.includes(type) ? doc.expiringTypes : [...doc.expiringTypes, type]) : doc.expiringTypes.filter((item) => item !== type);
  if (custom) {
    const next: CustomType = { ...custom, name: trimText(change.name), help: trimText(change.help), expires: change.expires, ...(change.kind ? { kind: change.kind } : {}) };
    return { ...doc, expiringTypes, customTypes: (doc.customTypes ?? []).map((item) => (item === custom ? next : item)) };
  }
  const base = DOCUMENT_TYPES[type];
  const texts = { ...(doc.texts ?? {}) };
  const name = trimText(change.name);
  const help = trimText(change.help);
  const sameName = base && name.sv === base.name.sv && name.fr === base.name.fr && name.en === base.name.en;
  const hasHelp = help.sv || help.fr || help.en;
  const entry = { ...(sameName ? {} : { name }), ...(hasHelp ? { help } : {}) };
  if (Object.keys(entry).length) texts[type] = entry;
  else delete texts[type];
  return { ...doc, expiringTypes, texts };
}

/* ---------------------------------------------------------------- checks (contract.json#driverOnboarding.settings.rules) */

const within = (value: number, [min, max]: readonly [number, number]) => Number.isInteger(value) && value >= min && value <= max;
const fullText = (text: LocalText | undefined) => Boolean(text && text.sv.trim() && text.fr.trim() && text.en.trim());

/** The first problem with the document, in the words the page shows (English keys of tr()), or null. */
export function settingsProblem(doc: SettingsDoc): string | null {
  if (OPEN[doc.country as MarketId] && !doc.documents.driver.includes("driving_license")) return "The driving licence is always needed.";
  for (const scope of SCOPES) if (new Set(doc.documents[scope]).size !== doc.documents[scope].length) return "A document is listed twice.";
  for (const custom of doc.customTypes ?? []) if (!fullText(custom.name) || !fullText(custom.help)) return "Every new document needs a name and a help text in Swedish, French and English.";
  for (const [, text] of Object.entries(doc.texts ?? {})) if ((text.name && !fullText(text.name))) return "A document name must be written in Swedish, French and English.";
  if (!doc.steps.some((step) => step.on)) return "Keep at least one step on.";
  if (doc.steps.some((step) => !within(step.days, LIMITS.stepDays))) return "Steps: 1 to 60 days.";
  if (!within(doc.signUpReminders.everyDays, LIMITS.remindEveryDays)) return "Remind every 1 to 30 days.";
  if (!within(doc.signUpReminders.stuckAfterDays, LIMITS.stuckAfterDays)) return "Stuck after 2 to 90 days.";
  const warn = doc.expiry.warnDays;
  if (!warn.length || warn.length > 3 || warn.some((day) => !within(day, LIMITS.warnDays))) return "Document warnings: 1 to 90 days before expiry.";
  if (warn.some((day, index) => index > 0 && day >= warn[index - 1]!)) return "Document warnings: each warning must come after the one before (fewer days).";
  for (const rule of doc.vehicles.categories) {
    if (!within(rule.minYear, LIMITS.minYear)) return "Car year: 1990 to 2030.";
    if (!within(rule.minSeats, LIMITS.minSeats)) return "Seats: 1 to 9.";
    if (rule.on && rule.fuels.length === 0) return "A category that is on needs at least one fuel.";
  }
  if (!within(doc.vehicles.warnDays, LIMITS.vehicleWarnDays)) return "Car paper warning: 1 to 120 days.";
  for (const months of Object.values(doc.validMonths ?? {})) if (!within(months, LIMITS.validMonths)) return "Valid months: 1 to 120.";
  for (const guide of Object.values(doc.guides ?? {})) {
    for (const list of [guide.checklist, guide.tips]) {
      if (list.length > GUIDE_LIMITS.lines) return "A guide has at most 10 lines in each list.";
      if (list.some((line) => !fullText(line))) return "Every guide line must be written in Swedish, French and English.";
      if (list.some((line) => [line.sv, line.fr, line.en].some((text) => text.length > GUIDE_LIMITS.lineChars))) return "A guide line has at most 300 characters.";
    }
  }
  return null;
}

/** The document as PUT sends it: no read-only documentTypes, the country's own id. */
export function wireDocument(doc: SettingsDoc): SettingsDoc {
  const { documentTypes: _drop, ...rest } = doc as SettingsDoc & { documentTypes?: unknown };
  void _drop;
  return structuredClone(rest);
}

/**
 * What the server does when the draft is saved (src/drivers/onboardingSettings.ts#prepareSettings in movera-server):
 * new types get their id, "draft:<key>" in the lists becomes it, expiringTypes follows each custom type. The demo runs it.
 */
export function prepareSettings(doc: SettingsDoc, random: (draftKey: string) => string): SettingsDoc {
  const next = structuredClone(doc);
  const keys = new Map<string, string>();
  for (const custom of next.customTypes ?? []) {
    if (custom.id === undefined) {
      custom.id = `custom_${random(custom.draftKey ?? "")}`;
      if (custom.draftKey !== undefined) keys.set(`${DRAFT_REF}${custom.draftKey}`, custom.id);
    }
    delete custom.draftKey;
  }
  const swap = (list: string[]) => list.map((type) => keys.get(type) ?? type);
  next.documents = { driver: swap(next.documents.driver), fleet: swap(next.documents.fleet), vehicle: swap(next.documents.vehicle) };
  let expiring = swap(next.expiringTypes);
  for (const custom of next.customTypes ?? []) {
    expiring = expiring.filter((type) => type !== custom.id);
    if (custom.expires) expiring.push(custom.id!);
  }
  next.expiringTypes = expiring;
  return next;
}

/** Ten lower-case letters or digits from the draft key: the demo's stand-in for the server's random id (same key, same id). */
export function demoIdOf(draftKey: string, country: string): string {
  let value = 2166136261;
  const text = `${country}:${draftKey}`;
  let out = "";
  for (let round = 0; out.length < 10; round += 1) {
    for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
    value = Math.imul(value ^ round, 16777619);
    out += (value >>> 0).toString(36);
  }
  return out.slice(0, 10);
}

/**
 * Publish: the book the page saves (the slice). The demo store keeps it as it is and its read (normalizeSettingsBook)
 * gives new types their id like the server does; the live build sends countries[country].document with PUT and
 * publishes it (src/live/liveSettings.ts), then reads the server's answer.
 */
export function stagePublish(book: SettingsBook, country: MarketId, doc: SettingsDoc, now: string): SettingsBook {
  const entry = book.countries[country];
  const version = entry.liveVersion + 1;
  return { draftRev: book.draftRev + 1, countries: { ...book.countries, [country]: { draftVersion: entry.draftVersion + 1, liveVersion: version, document: { ...wireDocument(doc), version, publishedAt: now, country } } } };
}

/** The types in a country's lists that need an expiry date when approved (owner items 1, 14, 15). */
export function expiringOf(doc: SettingsDoc): ReadonlySet<string> {
  return new Set(doc.expiringTypes);
}

/** The first warning (largest of warnDays): documents show orange from then. */
export function firstWarning(doc: SettingsDoc): number {
  return doc.expiry.warnDays.length ? Math.max(...doc.expiry.warnDays) : 30;
}

/** The demo board's document ids as contract types (src/drivers/gate.ts DRIVER_DOCUMENTS). */
export const DEMO_DOC_TYPE: Readonly<Record<string, string>> = { driver_license: "driving_license", virtual_session: "info_session", vehicle_insurance: "insurance" };
export const contractTypeOf = (demoId: string): string => DEMO_DOC_TYPE[demoId] ?? demoId;

/* ---------------------------------------------------------------- guides and valid months (v0.18.3, owner G2 R8, R9) */

/** Set the upload guide of a type in this country; blank lines are dropped and an empty guide is removed (the app's text). */
export function setGuide(doc: SettingsDoc, type: string, guide: Guide): SettingsDoc {
  const clean = (list: LocalText[]) => list.map(trimText).filter((line) => line.sv || line.fr || line.en);
  const next = { checklist: clean(guide.checklist), tips: clean(guide.tips) };
  const guides = { ...(doc.guides ?? {}) };
  if (next.checklist.length || next.tips.length) guides[type] = next;
  else delete guides[type];
  return { ...doc, guides };
}

/** Set how many months a type is valid from its issue date; null removes it (the admin types the end date). */
export function setValidMonths(doc: SettingsDoc, type: string, months: number | null): SettingsDoc {
  const validMonths = { ...(doc.validMonths ?? {}) };
  if (months === null) delete validMonths[type];
  else validMonths[type] = months;
  return { ...doc, validMonths };
}

/** The end date the review dialog proposes: issue date + N months (YYYY-MM-DD, the month's last day when it is shorter), "" when unknown. */
export function endDateFrom(issuedAt: string, months: number | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issuedAt);
  if (!match || !months) return "";
  const year = Number(match[1]);
  const month = Number(match[2]) - 1 + months;
  const day = Number(match[3]);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month, Math.min(day, last)));
  return date.toISOString().slice(0, 10);
}
