/**
 * Driver app texts (Round 3, Q30): every island, offer and main trip button text the driver app lets admin change,
 * per language (English, Swedish, French). An empty text means the app's own default (English).
 * BQ-A09 (owner Q7 "Make it real, sv/fr/en" => "Arabic tab removed", Rules decisions/driver-g14.md): no Arabic tab; the
 * removed tab is archived in ./archive/driverTexts-ar-2026-11-15.ts and saved Arabic texts stay in book.archivedAr.
 * The keys and defaults are the driver app's (DriverTexts in driver_app_texts.dart); the app reads
 * { byLanguage: { sv: { "island.online": "Radar på" } } }.
 */

export const DRIVER_TEXTS_KEY = "driverTexts";

export type TextLang = "en" | "sv" | "fr";
export const TEXT_LANGS: { id: TextLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "sv", label: "Swedish" },
  { id: "fr", label: "French" },
];

export type TextArea = "island" | "offer" | "trip";
export type TextGroup = "rides" | "scheduled" | "account" | "recovery" | "cards" | "buttons";

/** max: the longest text that still fits its place in the app. */
export const TEXT_AREAS: { id: TextArea; label: string; max: number; help: string }[] = [
  { id: "island", label: "Island", max: 40, help: "Short notices on the island at the top of Home." },
  { id: "offer", label: "Offer cards", max: 32, help: "Radar, Exclusive and the scheduled ride popup." },
  { id: "trip", label: "Trip buttons", max: 28, help: "The main button on the trip screen." },
];

export const TEXT_GROUPS: Record<TextGroup, string> = {
  rides: "Online and rides",
  scheduled: "Scheduled rides",
  account: "Account and rules",
  recovery: "Saved trips",
  cards: "Offer cards",
  buttons: "Trip buttons",
};

export type DriverTextKey = { id: string; area: TextArea; group: TextGroup; english: string };

const ROWS: [string, TextArea, TextGroup, string][] = [
  ["island.online", "island", "rides", "Radar online"],
  ["island.offline", "island", "rides", "Radar offline"],
  ["island.riderCancelled", "island", "rides", "Rider cancelled"],
  ["island.riderEndedTrip", "island", "rides", "Rider ended trip"],
  ["island.matching", "island", "rides", "Matching…"],
  ["island.matched", "island", "rides", "Trip matched"],
  ["island.takenByOther", "island", "rides", "Taken by another driver"],
  ["island.tripUnavailable", "island", "rides", "Trip unavailable"],
  ["island.noConnection", "island", "rides", "No connection"],
  ["island.contactSupport", "island", "rides", "Contact support"],
  ["island.newReservation", "island", "scheduled", "New reservation"],
  ["island.exclusiveRide", "island", "rides", "Exclusive ride"],
  ["island.exclusiveReservation", "island", "scheduled", "Exclusive reservation"],
  ["island.reservationAccepted", "island", "scheduled", "Reservation accepted"],
  ["island.noLongerAvailable", "island", "rides", "No longer available"],
  ["island.assignedByMovera", "island", "scheduled", "Assigned by Movera"],
  ["island.assignmentAccepted", "island", "scheduled", "Scheduled ride accepted"],
  ["island.assignmentNotAccepted", "island", "scheduled", "Assignment not accepted"],
  ["island.pickupIn", "island", "scheduled", "{time} pickup in {left}"],
  ["island.goOnlineFor", "island", "scheduled", "Go online for {time} pickup"],
  ["island.leaveNow", "island", "scheduled", "Leave now for {time} pickup"],
  ["island.headToPickup", "island", "scheduled", "Head to your {time} pickup"],
  ["island.givenToBackup", "island", "scheduled", "Given to backup driver"],
  ["island.cashOn", "island", "account", "Cash rides on"],
  ["island.cashOff", "island", "account", "Cash rides off"],
  ["island.lastMissed", "island", "account", "Next missed offer: offline"],
  ["island.offlineMissed", "island", "account", "Offline: {count} offers missed"],
  ["island.drivingLeft", "island", "account", "{minutes} min left to drive"],
  ["island.restUntil", "island", "account", "Rest until {time}"],
  ["island.restOver", "island", "account", "Rest over"],
  ["island.documentExpires", "island", "account", "{document} expires {when}"],
  ["island.documentExpired", "island", "account", "{document} expired"],
  ["island.documentInReview", "island", "account", "New document in review"],
  ["island.documentApproved", "island", "account", "Document approved"],
  ["island.highDemand", "island", "account", "High demand · {area}"],
  ["island.scheduledPaused", "island", "scheduled", "Scheduled rides paused"],
  ["island.savedTripOpen", "island", "recovery", "Saved trip open"],
  ["island.newerTripKept", "island", "recovery", "Newer trip kept"],
  ["island.recordSetAside", "island", "recovery", "Trip record set aside"],
  ["island.recoveryFailed", "island", "recovery", "Recovery failed"],
  ["island.tripNotClosed", "island", "recovery", "Trip not closed"],
  ["island.closeSavedTrip", "island", "recovery", "Close saved trip"],
  ["island.seeEarnings", "island", "rides", "Tap to see earnings"],
  ["offer.yourShare", "offer", "cards", "Your share"],
  ["offer.fare", "offer", "cards", "Fare"],
  ["offer.pickup", "offer", "cards", "Pickup"],
  ["offer.dropoff", "offer", "cards", "Drop-off"],
  ["offer.pickupNearby", "offer", "cards", "Pickup nearby"],
  ["offer.kmAway", "offer", "cards", "{km} km away"],
  ["offer.tripLength", "offer", "cards", "{minutes} min trip · {km} km"],
  ["offer.match", "offer", "cards", "Match"],
  ["offer.matching", "offer", "cards", "Matching…"],
  ["offer.accept", "offer", "cards", "Accept"],
  ["offer.onYourWay", "offer", "cards", "On your way"],
  ["offer.hide", "offer", "cards", "Hide offer"],
  ["offer.reservationRequest", "offer", "scheduled", "Reservation request"],
  ["offer.yourNextRide", "offer", "scheduled", "Your next ride"],
  ["offer.viewRoute", "offer", "scheduled", "View route"],
  ["trip.arrived", "trip", "buttons", "I've arrived"],
  ["trip.start", "trip", "buttons", "Start trip"],
  ["trip.startFirstStop", "trip", "buttons", "Start first stop"],
  ["trip.arriveAtStop", "trip", "buttons", "Arrive at the stop"],
  ["trip.complete", "trip", "buttons", "Complete trip"],
  ["trip.goToStop", "trip", "buttons", "Go to {stop} stop"],
  ["trip.goToDropoff", "trip", "buttons", "Go to drop-off"],
  ["trip.collectCash", "trip", "buttons", "Collect cash"],
  ["trip.completeRide", "trip", "buttons", "Complete ride"],
];

export const DRIVER_TEXT_KEYS: DriverTextKey[] = ROWS.map(([id, area, group, english]) => ({ id, area, group, english }));

const KEY_BY_ID = new Map(DRIVER_TEXT_KEYS.map((key) => [key.id, key]));

export function textKey(id: string): DriverTextKey | undefined {
  return KEY_BY_ID.get(id);
}

/** Values the app fills in, with the preview's sample. */
export const SAMPLE_VALUES: Record<string, string> = {
  time: "07:40",
  left: "15 min",
  count: "5",
  minutes: "18",
  document: "Driving licence",
  when: "in 7 days",
  area: "City",
  km: "2.4",
  stop: "second",
};

export type Texts = Record<TextLang, Record<string, string>>;
export type TextLog = { at: string; by: string; line: string };
export type DriverTextBook = {
  draftRev: number;
  texts: Texts;
  log: TextLog[];
  /** BQ-A09 + Rule 21: Arabic texts saved before the Arabic tab was removed; kept, never published. */
  archivedAr?: Record<string, string>;
};

export function emptyTexts(): Texts {
  return { en: {}, sv: {}, fr: {} };
}

export function emptyDriverTextBook(): DriverTextBook {
  return { draftRev: 1, texts: emptyTexts(), log: [] };
}

/** Keeps known languages and keys only, and drops empty texts. */
export function cleanTexts(value: unknown): Texts {
  const out = emptyTexts();
  if (!value || typeof value !== "object") return out;
  for (const { id: lang } of TEXT_LANGS) {
    const raw = (value as Record<string, unknown>)[lang];
    if (!raw || typeof raw !== "object") continue;
    for (const [id, text] of Object.entries(raw as Record<string, unknown>)) {
      if (KEY_BY_ID.has(id) && typeof text === "string" && text.trim()) out[lang][id] = text.trim();
    }
  }
  return out;
}

/** BQ-A09 + Rule 21: the written Arabic texts of known keys, kept aside after the Arabic tab was removed. */
function archivedArabic(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const [id, text] of Object.entries(value as Record<string, unknown>)) if (KEY_BY_ID.has(id) && typeof text === "string" && text.trim()) out[id] = text.trim();
  return out;
}

export function normalizeDriverTextBook(value: unknown): DriverTextBook {
  if (!value || typeof value !== "object") return emptyDriverTextBook();
  const raw = value as Partial<DriverTextBook>;
  const archivedAr = { ...archivedArabic(raw.archivedAr), ...archivedArabic((raw.texts as Record<string, unknown> | undefined)?.ar) };
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    texts: cleanTexts(raw.texts),
    log: Array.isArray(raw.log) ? raw.log : [],
    ...(Object.keys(archivedAr).length ? { archivedAr } : {}),
  };
}

/** The values in braces, e.g. ["time", "left"]. */
export function valuesIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))];
}

export function fill(text: string, values: Record<string, string> = SAMPLE_VALUES): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all);
}

/** What the app shows: admin's text for the language, or the app's default. own: admin wrote it. */
export function textOf(texts: Texts, lang: TextLang | (string & {}), id: string, values?: Record<string, string>): { text: string; own: boolean } {
  // A language without a tab here (Messages › Driver notices still has Arabic) uses the app's default.
  const own = (texts as Partial<Record<string, Record<string, string>>>)[lang]?.[id]?.trim();
  const base = own || textKey(id)?.english || id;
  return { text: values ? fill(base, values) : base, own: Boolean(own) };
}

/** Why a text can't be saved, or null. An empty text is fine: the app uses its default. */
export function textIssue(key: DriverTextKey, text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const max = TEXT_AREAS.find((area) => area.id === key.area)!.max;
  if (value.length > max) return `Keep it to ${max} characters (now ${value.length}).`;
  const wanted = valuesIn(key.english);
  const used = valuesIn(value);
  const missing = wanted.filter((name) => !used.includes(name));
  if (missing.length) return `Keep ${missing.map((name) => `{${name}}`).join(" and ")}. The app fills it in.`;
  const unknown = used.filter((name) => !wanted.includes(name));
  if (unknown.length) return wanted.length ? `{${unknown[0]}} is not a value here. Use ${wanted.map((name) => `{${name}}`).join(" and ")}.` : `This text has no values. Remove {${unknown[0]}}.`;
  return null;
}

export type TextIssue = { lang: TextLang; id: string; issue: string };

export function textIssues(texts: Texts): TextIssue[] {
  const out: TextIssue[] = [];
  for (const { id: lang } of TEXT_LANGS) {
    for (const [id, text] of Object.entries(texts[lang] ?? {})) {
      const key = textKey(id);
      const issue = key ? textIssue(key, text) : null;
      if (issue) out.push({ lang, id, issue });
    }
  }
  return out;
}

const langLabel = (lang: TextLang) => TEXT_LANGS.find((item) => item.id === lang)!.label;

/** "Swedish · Radar online: default → “Radar på”". */
export function textChanges(before: Texts, after: Texts): string[] {
  const lines: string[] = [];
  for (const { id: lang } of TEXT_LANGS) {
    for (const key of DRIVER_TEXT_KEYS) {
      const was = before[lang]?.[key.id]?.trim() ?? "";
      const now = after[lang]?.[key.id]?.trim() ?? "";
      if (was !== now) lines.push(`${langLabel(lang)} · ${key.english}: ${was ? `“${was}”` : "default"} → ${now ? `“${now}”` : "default"}`);
    }
  }
  return lines;
}

/** Save the texts. Empty texts are dropped, so the app goes back to its default. */
export function saveTexts(book: DriverTextBook, texts: Texts, actorId: string, nowIso: string): { book: DriverTextBook; error?: string } {
  const issues = textIssues(texts);
  if (issues.length) return { book, error: issues[0].issue };
  const next = cleanTexts(texts);
  const lines = textChanges(book.texts, next);
  if (!lines.length) return { book, error: "Nothing changed." };
  return { book: { draftRev: book.draftRev + 1, texts: next, log: [...lines.map((line) => ({ at: nowIso, by: actorId, line })), ...book.log].slice(0, 300), ...(book.archivedAr ? { archivedAr: book.archivedAr } : {}) } };
}

/** What the driver app reads (DriverAppTextOverrides.byLanguage): only the texts admin wrote. */
export function driverAppTexts(book: DriverTextBook): { byLanguage: Texts } {
  return { byLanguage: cleanTexts(book.texts) };
}

/** How many texts admin wrote, per language. */
export function ownCount(texts: Texts, lang: TextLang): number {
  return Object.values(texts[lang] ?? {}).filter((text) => text.trim()).length;
}
