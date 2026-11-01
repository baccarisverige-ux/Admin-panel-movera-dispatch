/**
 * Driver group 4 admin features on live (contract v0.18.6 §32 dispatchTools, owner decisions G4-F2..F4, F6): saved
 * presets, driver groups, radar zones and their rules, and events are kept on the server per country
 * (/admin/dispatch/*). The Dispatch pages edit them in the dispatch book as before; here a save is turned into the
 * server's POST / PUT / DELETE calls (one per item that changed, with its version), and the server's items are read
 * back into the book. Pure helpers plus the calls, so node --test covers them.
 */
import type { MarketId } from "../markets/markets.ts";
import { market, MARKETS } from "../markets/markets.ts";
import { zoneDefault, type DispatchBook, type DispatchEvent, type DriverGroup, type EventText, type Preset, type RadarZone, type RadarZoneRule, type ZoneDispatch } from "../dispatch/rules.ts";
import { dispatchDocumentOf, rulesOfDispatch } from "./configDocs.ts";

/* ---------------------------------------------------------------- the server's items (contract.json#dispatchTools) */

type Stamps = { version: number; createdBy?: string; createdAt?: string; updatedBy?: string; updatedAt?: string };
export type ServerPreset = Stamps & { presetId: string; country: string; name: string; values: Record<string, unknown> };
export type ServerGroup = Stamps & { groupId: string; country: string; name: string; driverIds: string[] };
export type ServerRadarZone = Stamps & { radarZoneId: string; country: string; zoneId: string; name: string; polygon: [number, number][] };
export type ServerRadarRule = Stamps & { ruleId: string; country: string; name: string; radarZoneIds: "all" | string[]; seconds: number; maxDrivers: number; repeat: boolean };
export type ServerEvent = Stamps & {
  eventId: string;
  country: string;
  name: string;
  location: { lat: number; lng: number };
  polygon?: [number, number][] | null;
  startsAt: string;
  endsAt: string;
  on: boolean;
  details: { title: EventText; description: EventText; pickupNote?: EventText | null };
};
export type RadarZoneSend = { sendId: string; tripId: string; radarZoneId: string; ruleId: string; seconds: number; maxDrivers: number; repeat: boolean; active: boolean; rounds: number; startedAt: string; stoppedAt?: string; stopReason?: string };

export type DispatchTools = Pick<DispatchBook, "presets" | "groups" | "radarZones" | "radarZoneRules" | "events">;

const isCountry = (value: string): value is MarketId => MARKETS.some((item) => item.id === value);
const countryOf = (value: string): MarketId => (isCountry(value) ? value : "SE");

/* ---------------------------------------------------------------- local time of a country <-> UTC */

/** The UTC offset of a time zone at an instant, in minutes (Europe/Stockholm in summer: 120). */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((local - at.getTime()) / 60_000);
}

/** "2026-11-07T20:00" in `timeZone` → "2026-11-07T19:00:00.000Z". Null when the text is not a date and time. */
export function localToUtc(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as number[];
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Two passes find the offset that applies at that local time (also across a clock change).
  let at = guess - offsetMinutes(timeZone, new Date(guess)) * 60_000;
  at = guess - offsetMinutes(timeZone, new Date(at)) * 60_000;
  return new Date(at).toISOString();
}

/** "2026-11-07T19:00:00Z" → "2026-11-07T20:00" in `timeZone` (for the date-time fields). */
export function utcToLocal(iso: string, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const local = new Date(at.getTime() + offsetMinutes(timeZone, at) * 60_000);
  return local.toISOString().slice(0, 16);
}

/* ---------------------------------------------------------------- server → book */

/** A server preset as the Presets list shows it; applying it changes only the dispatch document's parts of a zone. */
export function presetOf(item: ServerPreset): Preset {
  const country = countryOf(item.country);
  const first = market(country).zones[0]!;
  const zone = rulesOfDispatch(item.values, null, zoneDefault(first.id));
  const { zoneId: _drop, ...values } = zone;
  void _drop;
  return { id: item.presetId, name: item.name, note: item.updatedBy ?? item.createdBy ?? "", builtIn: false, values, country, doc: item.values, version: item.version };
}

export const groupOf = (item: ServerGroup): DriverGroup => ({ id: item.groupId, country: countryOf(item.country), name: item.name, driverIds: [...item.driverIds], version: item.version });

export const radarZoneOf = (item: ServerRadarZone): RadarZone => ({ id: item.radarZoneId, country: countryOf(item.country), zoneId: item.zoneId, name: item.name, ring: item.polygon.map(([lat, lng]) => [lat, lng] as [number, number]), createdAt: item.createdAt ?? "", version: item.version });

export const radarRuleOf = (item: ServerRadarRule): RadarZoneRule => ({ id: item.ruleId, country: countryOf(item.country), name: item.name, radarZoneIds: item.radarZoneIds === "all" ? "all" : [...item.radarZoneIds], seconds: item.seconds, maxDrivers: item.maxDrivers, repeat: item.repeat, version: item.version });

const EMPTY_TEXT: EventText = { sv: "", fr: "", en: "" };

export function eventOf(item: ServerEvent): DispatchEvent {
  const country = countryOf(item.country);
  const timeZone = market(country).timeZone;
  return {
    id: item.eventId,
    country,
    name: item.name,
    ring: (item.polygon ?? []).map(([lat, lng]) => [lat, lng] as [number, number]),
    location: [item.location.lat, item.location.lng],
    from: utcToLocal(item.startsAt, timeZone),
    until: utcToLocal(item.endsAt, timeZone),
    on: item.on,
    details: { title: { ...item.details.title }, description: { ...item.details.description }, pickupNote: { ...(item.details.pickupNote ?? EMPTY_TEXT) } },
    // Demo-only fields (owner G4-F6: events change no dispatch on live).
    mode: "radar",
    radarDrivers: 10,
    pickupNote: "",
    driverMessage: "",
    version: item.version,
  };
}

/* ---------------------------------------------------------------- book → server bodies */

const META = ["version", "publishedAt", "zoneId", "country", "timeZone", "usesStandard"];

/** The values a preset keeps on the server: the zone's dispatch document without its stamps (contract presets.note). */
export function presetValuesOf(preset: Preset, country: MarketId): Record<string, unknown> {
  if (preset.doc && !preset.values) return { ...preset.doc };
  const zoneId = market(country).zones[0]!.id;
  const doc = dispatchDocumentOf({ ...(preset.values as ZoneDispatch), zoneId }, zoneId, null);
  for (const key of META) delete doc[key];
  return doc;
}

/** A ring as the server takes it: [lat, lng] points, not closed (the first point is not repeated at the end). */
export function openRing(ring: readonly [number, number][]): [number, number][] {
  const points = ring.map(([lat, lng]) => [lat, lng] as [number, number]);
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 3 && first && last && first[0] === last[0] && first[1] === last[1]) points.pop();
  return points;
}

const filled = (text: EventText | undefined) => Boolean(text && text.sv.trim() && text.fr.trim() && text.en.trim());
const trimmed = (text: EventText): EventText => ({ sv: text.sv.trim(), fr: text.fr.trim(), en: text.en.trim() });

export function eventBody(event: DispatchEvent): Record<string, unknown> {
  const timeZone = market(event.country).timeZone;
  const details = event.details ?? { title: EMPTY_TEXT, description: EMPTY_TEXT, pickupNote: EMPTY_TEXT };
  const [lat, lng] = event.location ?? [0, 0];
  return {
    name: event.name.trim(),
    location: { lat, lng },
    ...(event.ring.length >= 3 ? { polygon: openRing(event.ring) } : {}),
    startsAt: localToUtc(event.from, timeZone),
    endsAt: localToUtc(event.until, timeZone),
    on: event.on,
    details: { title: trimmed(details.title), description: trimmed(details.description), ...(filled(details.pickupNote) ? { pickupNote: trimmed(details.pickupNote) } : {}) },
  };
}

/** What is missing before an event can be saved (G4-F6: point, times, every text in sv / fr / en). */
export function eventIssue(event: DispatchEvent): string | null {
  if (!event.name.trim()) return "Give the event a name.";
  if (!event.location) return "Put the event's pin on the map.";
  const timeZone = market(event.country).timeZone;
  const from = localToUtc(event.from, timeZone);
  const until = localToUtc(event.until, timeZone);
  if (!from || !until) return "Set the start and the end.";
  if (Date.parse(until) <= Date.parse(from)) return "The end must be after the start.";
  const details = event.details;
  if (!details || !filled(details.title)) return "Write the title in Swedish, French and English.";
  if (!filled(details.description)) return "Write the description in Swedish, French and English.";
  const note = details.pickupNote;
  if (note && (note.sv.trim() || note.fr.trim() || note.en.trim()) && !filled(note)) return "Write the pickup note in all three languages, or leave it empty.";
  return null;
}

/* ---------------------------------------------------------------- the calls */

export type ToolsHttp = {
  json: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  put: <T>(path: string, body: unknown) => Promise<T>;
  del: (path: string) => Promise<unknown>;
};

const BASE = "/admin/dispatch";

async function list<T>(http: ToolsHttp, path: string): Promise<T[]> {
  try {
    return (await http.json<{ items?: T[] }>(`${BASE}/${path}`)).items ?? [];
  } catch (error) {
    // An admin with no zone of any country, or an older server: nothing to show, never the demo's samples.
    const status = (error as { status?: number } | null)?.status;
    if (status === 403 || status === 404) return [];
    throw error;
  }
}

/** Every country's items the admin may see (the server keeps to the admin's scope). */
export async function readDispatchTools(http: ToolsHttp): Promise<DispatchTools> {
  const [presets, groups, radarZones, radarZoneRules, events] = await Promise.all([
    list<ServerPreset>(http, "presets"),
    list<ServerGroup>(http, "groups"),
    list<ServerRadarZone>(http, "radar-zones"),
    list<ServerRadarRule>(http, "radar-rules"),
    list<ServerEvent>(http, "events"),
  ]);
  return { presets: presets.map(presetOf), groups: groups.map(groupOf), radarZones: radarZones.map(radarZoneOf), radarZoneRules: radarZoneRules.map(radarRuleOf), events: events.map(eventOf) };
}

type Kind = keyof DispatchTools;
type Item = { id: string; version?: number };

/** One server call for a change to the dispatch tools. */
export type ToolCall = { method: "POST" | "PUT" | "DELETE"; path: string; body?: Record<string, unknown> };

const PATHS: Record<Kind, string> = { presets: "presets", groups: "groups", radarZones: "radar-zones", radarZoneRules: "radar-rules", events: "events" };

function createBody(kind: Kind, item: Item): Record<string, unknown> {
  if (kind === "presets") {
    const preset = item as Preset;
    const country = preset.country ?? "SE";
    return { country, name: preset.name.trim(), values: presetValuesOf(preset, country) };
  }
  if (kind === "groups") {
    const group = item as DriverGroup;
    return { country: group.country, name: group.name.trim(), driverIds: [...group.driverIds] };
  }
  if (kind === "radarZones") {
    const zone = item as RadarZone;
    return { zoneId: zone.zoneId, name: zone.name.trim(), polygon: openRing(zone.ring) };
  }
  if (kind === "radarZoneRules") {
    const rule = item as RadarZoneRule;
    return { country: rule.country, name: rule.name.trim(), radarZoneIds: rule.radarZoneIds, seconds: Math.round(rule.seconds), maxDrivers: Math.round(rule.maxDrivers), repeat: rule.repeat };
  }
  const event = item as DispatchEvent;
  return { country: event.country, ...eventBody(event) };
}

/** The fields a PUT may change (the create body without what is fixed: country, a radar zone's zone). */
function updateBody(kind: Kind, item: Item): Record<string, unknown> {
  const body = createBody(kind, item);
  delete body["country"];
  if (kind === "radarZones") delete body["zoneId"];
  return body;
}

/**
 * The calls that make the server's items equal the book's, for every kind: new items are created, changed ones are
 * put with their version, removed ones deleted. Creates go first and deletes last, rules before radar zones, so a
 * rule never names a radar zone that is not there yet or any more.
 */
export function toolCalls(before: DispatchTools, after: DispatchTools): ToolCall[] {
  const calls: ToolCall[] = [];
  const known = (kind: Kind) => new Map((before[kind] as Item[]).map((item) => [item.id, item]));
  const changes = (kind: Kind) => {
    const old = known(kind);
    const next = after[kind] as Item[];
    const ids = new Set(next.map((item) => item.id));
    return {
      create: next.filter((item) => !old.has(item.id) || old.get(item.id)!.version === undefined),
      update: next.filter((item) => old.get(item.id)?.version !== undefined && JSON.stringify(updateBody(kind, item)) !== JSON.stringify(updateBody(kind, old.get(item.id)!))),
      remove: [...old.values()].filter((item) => !ids.has(item.id) && item.version !== undefined),
    };
  };
  const order: Kind[] = ["presets", "groups", "radarZones", "radarZoneRules", "events"];
  const all = Object.fromEntries(order.map((kind) => [kind, changes(kind)])) as Record<Kind, ReturnType<typeof changes>>;
  for (const kind of order) {
    for (const item of all[kind].create) calls.push({ method: "POST", path: `${BASE}/${PATHS[kind]}`, body: createBody(kind, item) });
    for (const item of all[kind].update) calls.push({ method: "PUT", path: `${BASE}/${PATHS[kind]}/${encodeURIComponent(item.id)}`, body: { expectedVersion: item.version, ...updateBody(kind, item) } });
  }
  for (const kind of ["presets", "groups", "radarZoneRules", "radarZones", "events"] as Kind[]) {
    for (const item of all[kind].remove) calls.push({ method: "DELETE", path: `${BASE}/${PATHS[kind]}/${encodeURIComponent(item.id)}?expectedVersion=${item.version}` });
  }
  return calls;
}

const KIND_OF_PATH = new Map<string, Kind>((Object.keys(PATHS) as Kind[]).map((kind) => [PATHS[kind], kind]));
const ITEM_OF: Record<Kind, (item: never) => Item> = { presets: presetOf, groups: groupOf, radarZones: radarZoneOf, radarZoneRules: radarRuleOf, events: eventOf };
const ID_FIELD: Record<Kind, string> = { presets: "presetId", groups: "groupId", radarZones: "radarZoneId", radarZoneRules: "ruleId", events: "eventId" };

/** The kind and the item id a call's path names ("/admin/dispatch/groups/grp_1?expectedVersion=2" → groups, grp_1). */
function target(call: ToolCall): { kind: Kind; id: string | null } | null {
  const [, rest = ""] = call.path.split(`${BASE}/`);
  const [kindPath = "", idPart] = rest.split("?")[0]!.split("/");
  const kind = KIND_OF_PATH.get(kindPath);
  return kind ? { kind, id: idPart ? decodeURIComponent(idPart) : null } : null;
}

const isText = (value: unknown): value is EventText => Boolean(value) && typeof value === "object" && ["sv", "fr", "en"].every((lang) => typeof (value as Record<string, unknown>)[lang] === "string");

/** Whether the answer carries every field the kind's converter reads (a `201 { groupId, version }` alone does not). */
function hasItemFields(kind: Kind, raw: Record<string, unknown>): boolean {
  if (typeof raw["name"] !== "string" || (kind !== "radarZones" && typeof raw["country"] !== "string")) return false;
  if (kind === "presets") return Boolean(raw["values"]) && typeof raw["values"] === "object";
  if (kind === "groups") return Array.isArray(raw["driverIds"]);
  if (kind === "radarZones") return typeof raw["zoneId"] === "string" && typeof raw["country"] === "string" && Array.isArray(raw["polygon"]);
  if (kind === "radarZoneRules") return (raw["radarZoneIds"] === "all" || Array.isArray(raw["radarZoneIds"])) && typeof raw["seconds"] === "number" && typeof raw["maxDrivers"] === "number" && typeof raw["repeat"] === "boolean";
  const location = raw["location"] as Record<string, unknown> | null;
  const details = raw["details"] as Record<string, unknown> | null;
  return Boolean(location) && typeof location?.["lat"] === "number" && typeof location["lng"] === "number" && typeof raw["startsAt"] === "string" && typeof raw["endsAt"] === "string" && typeof raw["on"] === "boolean" && Boolean(details) && isText(details?.["title"]) && isText(details["description"]);
}

/**
 * The tools after one answered call: a POST adds the server's item (its id and version), a PUT replaces it, a DELETE
 * (204, no body) takes it out. Null when the answer is not the item the contract promises (an older server), so the
 * caller reads the server's lists instead of guessing.
 */
export function applyToolAnswer(tools: DispatchTools, call: ToolCall, answer: unknown): DispatchTools | null {
  const at = target(call);
  if (!at) return null;
  const { kind } = at;
  const items = tools[kind] as Item[];
  if (call.method === "DELETE") return at.id === null ? null : { ...tools, [kind]: items.filter((item) => item.id !== at.id) };
  const raw = answer as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || typeof raw[ID_FIELD[kind]] !== "string" || typeof raw["version"] !== "number" || !hasItemFields(kind, raw)) return null;
  let item: Item;
  try {
    item = ITEM_OF[kind](raw as never);
  } catch {
    // The contract promises the item, but only the preset's body is fully checked here: anything odd means a re-read.
    return null;
  }
  const known = items.some((other) => other.id === item.id);
  return { ...tools, [kind]: known ? items.map((other) => (other.id === item.id ? item : other)) : [...items, item] };
}

/**
 * Sends the calls one by one and applies every answer to `before`, so the page's list is the server's right after a
 * save without a second read (G4 live: a deleted row stayed, a new one waited for a reload). The first refusal stops
 * (what was sent before it stays; the caller reads the server again). Null when an answer could not be applied.
 */
export async function sendToolCalls(http: ToolsHttp, calls: readonly ToolCall[], before: DispatchTools): Promise<DispatchTools | null> {
  let tools: DispatchTools | null = before;
  for (const call of calls) {
    const answer = call.method === "POST" ? await http.post<unknown>(call.path, call.body) : call.method === "PUT" ? await http.put<unknown>(call.path, call.body) : await http.del(call.path);
    tools = tools && applyToolAnswer(tools, call, answer);
  }
  return tools;
}

/** The book's dispatch tools. */
export const toolsOf = (book: DispatchBook): DispatchTools => ({ presets: book.presets.filter((item) => !item.builtIn), groups: book.groups, radarZones: book.radarZones, radarZoneRules: book.radarZoneRules, events: book.events });

/* ---------------------------------------------------------------- the running repeat of a trip */

/** A radar zone send that still goes out by itself (RadarZoneSend with active true), as the Handle panel shows it. */
export type RadarRepeat = { sendId: string; radarZoneId: string; seconds: number; maxDrivers: number; rounds: number; startedAt: string };

/**
 * G4 checker: the running repeat comes from the server's trip (`radarZoneSend` on GET /admin/trips/{id}), so it
 * survives a reload and shows for every admin. Read defensively: undefined when the server does not send the field
 * (an older server; the panel then falls back to what this session sent), null when it is there but nothing runs.
 */
export function radarRepeatOf(trip: unknown): RadarRepeat | null | undefined {
  if (!trip || typeof trip !== "object" || !("radarZoneSend" in trip)) return undefined;
  const raw = (trip as { radarZoneSend?: unknown }).radarZoneSend;
  if (!raw || typeof raw !== "object") return null;
  const send = raw as Partial<RadarZoneSend>;
  if (send.active !== true || typeof send.sendId !== "string" || typeof send.radarZoneId !== "string") return null;
  const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  return { sendId: send.sendId, radarZoneId: send.radarZoneId, seconds: num(send.seconds, 0), maxDrivers: num(send.maxDrivers, 0), rounds: num(send.rounds, 1), startedAt: typeof send.startedAt === "string" ? send.startedAt : "" };
}

/* ---------------------------------------------------------------- the server's refusals, in the panel's words */

const REASON_TEXT: Record<string, string> = {
  name_taken: "That name is already used in this country. Choose another name.",
  driver_not_in_country: "A driver in the group is not from this country. Take them out and save again.",
  no_free_driver: "No driver of that group or area is free right now.",
  rule_not_for_zone: "That rule is not for this radar zone. Pick another rule.",
  radar_zone_in_use: "A radar zone rule still lists this radar zone. Change the rule first.",
  radar_zone_send_not_found: "No radar is sending again for this ride.",
  group_in_use: "This group is used by a booked ride. It cannot be deleted now.",
  zone_not_in_country: "A radar zone of another country is in the rule.",
  invalid_polygon: "The outline is not valid. Draw it again.",
  ends_before_start: "The end must be after the start.",
  zone_out_of_scope: "This country is outside your zones.",
  // Owner bug 2026-11-01: assign / radar refusals by reason code, never the server's English sentence.
  offer_already_open: "The driver already sees this ride.",
  driver_on_trip: "The driver is on a trip and cannot take this ride now.",
  driver_not_available: "No chosen driver can take a ride now (offline or no recent position).",
};

/** The panel's sentence for a dispatch-tools refusal, or null when the server's own message should stay. */
export function toolRefusal(error: unknown): string | null {
  const value = error as { status?: number; reason?: string | null; code?: string } | null;
  if (value?.status === 409 && value.code === "version_mismatch") return "Someone changed this since you opened it. The page shows the newest version; make your change again.";
  return (value?.reason && REASON_TEXT[value.reason]) || null;
}
