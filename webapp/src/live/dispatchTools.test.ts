import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { applyPreset, emptyDispatchBook, zoneDefault, type DispatchEvent } from "../dispatch/rules.ts";
import { applyToolAnswer, eventBody, eventIssue, eventOf, localToUtc, openRing, presetOf, radarRepeatOf, readDispatchTools, sendToolCalls, toolCalls, toolRefusal, toolsOf, utcToLocal, type DispatchTools, type ServerEvent, type ToolsHttp } from "./dispatchTools.ts";

/**
 * Driver group 4 admin features on live (contract v0.18.6 §32 dispatchTools; owner G4-F2 presets per country, F3 driver
 * groups, F4 radar zones + rules, F6 events): the panel's saves become the server's calls, the server's items come back.
 */

const none: DispatchTools = { presets: [], groups: [], radarZones: [], radarZoneRules: [], events: [] };
const ring: [number, number][] = [[59.31, 18.06], [59.31, 18.08], [59.32, 18.08], [59.32, 18.06]];

test("G4-F6: event times are the country's local time on screen and UTC on the wire (SE and FR, summer and winter)", () => {
  assert.equal(localToUtc("2026-07-01T20:00", "Europe/Stockholm"), "2026-07-01T18:00:00.000Z");
  assert.equal(localToUtc("2026-12-01T20:00", "Europe/Stockholm"), "2026-12-01T19:00:00.000Z");
  assert.equal(localToUtc("2026-12-01T20:00", "Europe/Paris"), "2026-12-01T19:00:00.000Z");
  assert.equal(utcToLocal("2026-07-01T18:00:00Z", "Europe/Paris"), "2026-07-01T20:00");
  assert.equal(localToUtc("not a time", "Europe/Paris"), null);
});

const SERVER_EVENT: ServerEvent = {
  eventId: "ev_1", country: "FR", name: "Finale", location: { lat: 48.8924, lng: 2.3933 }, polygon: ring, startsAt: "2026-11-07T19:00:00Z", endsAt: "2026-11-07T22:30:00Z", on: true,
  details: { title: { sv: "Final", fr: "Finale", en: "Final" }, description: { sv: "Match", fr: "Match", en: "Match" }, pickupNote: { sv: "Port B", fr: "Porte B", en: "Gate B" } }, version: 3,
};

test("G4-F6: a server event reads into the editor and goes back the same (point, area, local times, sv/fr/en)", () => {
  const event = eventOf(SERVER_EVENT);
  assert.deepEqual(event.location, [48.8924, 2.3933]);
  assert.equal(event.from, "2026-11-07T20:00");
  assert.equal(event.until, "2026-11-07T23:30");
  assert.equal(event.version, 3);
  const body = eventBody(event);
  assert.deepEqual(body, { name: "Finale", location: { lat: 48.8924, lng: 2.3933 }, polygon: ring, startsAt: "2026-11-07T19:00:00.000Z", endsAt: "2026-11-07T22:30:00.000Z", on: true, details: SERVER_EVENT.details });
  assert.equal(eventIssue(event), null);
});

test("G4-F6: an event needs a pin, an end after the start and every text in sv, fr and en (the pickup note is optional)", () => {
  const event = eventOf(SERVER_EVENT);
  assert.equal(eventIssue({ ...event, location: null }), "Put the event's pin on the map.");
  assert.equal(eventIssue({ ...event, until: event.from }), "The end must be after the start.");
  assert.equal(eventIssue({ ...event, details: { ...event.details!, title: { sv: "", fr: "Finale", en: "Final" } } }), "Write the title in Swedish, French and English.");
  const noNote: DispatchEvent = { ...event, details: { ...event.details!, pickupNote: { sv: "", fr: "", en: "" } } };
  assert.equal(eventIssue(noNote), null);
  assert.ok(!("pickupNote" in (eventBody(noNote)["details"] as object)), "an empty pickup note is not sent");
  assert.equal(eventIssue({ ...event, details: { ...event.details!, pickupNote: { sv: "Port B", fr: "", en: "" } } }), "Write the pickup note in all three languages, or leave it empty.");
});

test("G4-F3/F4/F6: a save becomes one POST per new item, one PUT per changed item (with its version), one DELETE per removed item", () => {
  const before: DispatchTools = {
    ...none,
    groups: [{ id: "grp_1", country: "SE", name: "Night", driverIds: ["D1"], version: 2 }, { id: "grp_2", country: "SE", name: "Old", driverIds: [], version: 1 }],
    radarZones: [{ id: "rz_1", country: "SE", zoneId: "Z002", name: "Söder", ring, createdAt: "", version: 4 }],
    radarZoneRules: [{ id: "rr_1", country: "SE", name: "Fast", radarZoneIds: ["rz_1"], seconds: 20, maxDrivers: 5, repeat: true, version: 1 }],
  };
  const after: DispatchTools = {
    ...before,
    groups: [{ ...before.groups[0]!, driverIds: ["D1", "D2"] }, { id: "G-new", country: "SE", name: "Airport", driverIds: ["D3"] }],
    radarZoneRules: [],
    radarZones: [],
  };
  assert.deepEqual(toolCalls(before, after), [
    { method: "POST", path: "/admin/dispatch/groups", body: { country: "SE", name: "Airport", driverIds: ["D3"] } },
    { method: "PUT", path: "/admin/dispatch/groups/grp_1", body: { expectedVersion: 2, name: "Night", driverIds: ["D1", "D2"] } },
    { method: "DELETE", path: "/admin/dispatch/groups/grp_2?expectedVersion=1" },
    // A rule is deleted before the radar zone it lists (the server refuses the zone first: radar_zone_in_use).
    { method: "DELETE", path: "/admin/dispatch/radar-rules/rr_1?expectedVersion=1" },
    { method: "DELETE", path: "/admin/dispatch/radar-zones/rz_1?expectedVersion=4" },
  ]);
  assert.deepEqual(toolCalls(before, before), [], "nothing changed, nothing sent");
});

test("G4-F4: a new radar zone is sent with its zone and an open outline; a rule with its zones, time, drivers and repeat", () => {
  const after: DispatchTools = { ...none, radarZones: [{ id: "RZ-x", country: "FR", zoneId: "FR-PC", name: " Bastille ", ring: [...ring, ring[0]!], createdAt: "" }], radarZoneRules: [{ id: "RR-x", country: "FR", name: "Soir", radarZoneIds: "all", seconds: 30, maxDrivers: 8, repeat: true }] };
  assert.deepEqual(toolCalls(none, after), [
    { method: "POST", path: "/admin/dispatch/radar-zones", body: { zoneId: "FR-PC", name: "Bastille", polygon: ring } },
    { method: "POST", path: "/admin/dispatch/radar-rules", body: { country: "FR", name: "Soir", radarZoneIds: "all", seconds: 30, maxDrivers: 8, repeat: true } },
  ]);
  assert.deepEqual(openRing(ring), ring);
  assert.deepEqual(contract.dispatchTools.radarZones.ranges, { seconds: [5, 120], maxDrivers: [1, 10] });
});

test("G4-F2: a preset is saved per country with the dispatch document's values (no stamps); applying it changes only those parts", () => {
  const zone = { ...zoneDefault("Z001"), radar: { ...zoneDefault("Z001").radar, drivers: 9 } };
  const { zoneId: _drop, ...values } = zone;
  void _drop;
  const calls = toolCalls(none, { ...none, presets: [{ id: "P-2", name: "Nights", note: "", builtIn: false, values, country: "SE" }] });
  assert.equal(calls.length, 1);
  const body = calls[0]!.body as { country: string; name: string; values: Record<string, unknown> };
  assert.equal(body.country, "SE");
  assert.equal((body.values["radar"] as { drivers: number }).drivers, 9);
  for (const key of ["version", "publishedAt", "zoneId", "country", "timeZone", "usesStandard"]) assert.ok(!(key in body.values), key);
  // Back from the server: applied to a zone, the zone's offer card (not a dispatch document part) stays its own.
  const preset = presetOf({ presetId: "prs_1", country: "SE", name: "Nights", values: body.values, version: 1 });
  const target = { ...zoneDefault("Z002"), offerCard: { ...zoneDefault("Z002").offerCard, riderRating: false } };
  const applied = applyPreset(target, preset, "SE");
  assert.equal(applied.radar.drivers, 9);
  assert.equal(applied.offerCard.riderRating, false);
  assert.equal(applied.zoneId, "Z002");
  // Rename and delete go to the same preset with its version.
  assert.deepEqual(toolCalls({ ...none, presets: [preset] }, { ...none, presets: [{ ...preset, name: "Late nights" }] })[0], { method: "PUT", path: "/admin/dispatch/presets/prs_1", body: { expectedVersion: 1, name: "Late nights", values: body.values } });
  assert.deepEqual(toolCalls({ ...none, presets: [preset] }, none), [{ method: "DELETE", path: "/admin/dispatch/presets/prs_1?expectedVersion=1" }]);
});

test("the server's items are read for every country in scope; a 403 is an empty list, never the demo's samples", async () => {
  const http: ToolsHttp = {
    json: async <T,>(path: string) => {
      if (path.endsWith("/groups")) return { items: [{ groupId: "grp_1", country: "SE", name: "Night", driverIds: ["D1"], version: 1 }] } as T;
      if (path.endsWith("/events")) return { items: [SERVER_EVENT] } as T;
      throw Object.assign(new Error("no"), { status: 403 });
    },
    post: async () => ({}) as never,
    put: async () => ({}) as never,
    del: async () => undefined,
  };
  const tools = await readDispatchTools(http);
  assert.deepEqual(tools.groups, [{ id: "grp_1", country: "SE", name: "Night", driverIds: ["D1"], version: 1 }]);
  assert.equal(tools.events[0]!.name, "Finale");
  assert.deepEqual(tools.presets, []);
  assert.ok(!toolsOf(emptyDispatchBook()).presets.some((preset) => preset.builtIn));
});

test("the server's refusals are said in the panel's words (contract.json#dispatchTools.reasons)", () => {
  for (const reason of contract.dispatchTools.reasons) assert.ok(toolRefusal({ status: 409, reason }), reason);
  assert.match(toolRefusal({ status: 409, code: "version_mismatch" }) ?? "", /Someone changed this/);
  assert.equal(toolRefusal({ status: 500, reason: "boom" }), null);
});

test("G4 checker: the running repeat is read from the server's trip (radarZoneSend), defensively", () => {
  const send = { sendId: "rzs_1", tripId: "T1", radarZoneId: "rz_1", ruleId: "rr_1", seconds: 20, maxDrivers: 5, repeat: true, active: true, rounds: 3, startedAt: "2026-10-31T09:00:00Z" };
  assert.deepEqual(radarRepeatOf({ tripId: "T1", radarZoneSend: send }), { sendId: "rzs_1", radarZoneId: "rz_1", seconds: 20, maxDrivers: 5, rounds: 3, startedAt: "2026-10-31T09:00:00Z" });
  assert.equal(radarRepeatOf({ tripId: "T1", radarZoneSend: { ...send, active: false } }), null, "stopped = nothing runs");
  assert.equal(radarRepeatOf({ tripId: "T1", radarZoneSend: null }), null);
  assert.equal(radarRepeatOf({ tripId: "T1", radarZoneSend: "junk" }), null);
  assert.equal(radarRepeatOf({ tripId: "T1" }), undefined, "an older server says nothing: the session's own state stands");
  assert.equal(radarRepeatOf(null), undefined);
});

test("G4 live fix: a save applies the server's answers to the list (201 item, 200 item, 204 nothing), so a deleted row goes and a new one shows at once", async () => {
  const before: DispatchTools = {
    ...none,
    presets: [{ id: "prs_1", name: "Nights", note: "", builtIn: false, values: zoneDefault("Z001"), country: "SE", version: 1 }],
    groups: [{ id: "grp_1", country: "SE", name: "Night", driverIds: ["D1"], version: 2 }, { id: "grp_2", country: "SE", name: "Old", driverIds: [], version: 1 }],
    radarZoneRules: [{ id: "rr_1", country: "SE", name: "Fast", radarZoneIds: "all", seconds: 20, maxDrivers: 5, repeat: true, version: 1 }],
  };
  const after: DispatchTools = { ...before, presets: [], groups: [{ ...before.groups[0]!, driverIds: ["D1", "D2"] }, { id: "G-new", country: "SE", name: "Airport", driverIds: ["D3"] }], radarZoneRules: [] };
  const calls = toolCalls(before, after);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "PUT", "DELETE", "DELETE", "DELETE"]);
  const sent: string[] = [];
  const http: ToolsHttp = {
    json: async () => { throw new Error("no list read is needed after a save"); },
    post: async <T,>(path: string, body: unknown) => { sent.push(`POST ${path}`); return { ...(body as object), groupId: "grp_9", version: 1, createdAt: "2026-10-31T09:00:00Z" } as T; },
    put: async <T,>(path: string, body: unknown) => { sent.push(`PUT ${path}`); const { expectedVersion, ...rest } = body as { expectedVersion: number }; return { ...rest, groupId: "grp_1", country: "SE", version: expectedVersion + 1 } as T; },
    // DELETE answers 204 with no body: that is not a missing record, the row is simply gone.
    del: async (path) => { sent.push(`DELETE ${path}`); return undefined; },
  };
  const applied = await sendToolCalls(http, calls, before);
  assert.ok(applied, "every answer was applied");
  assert.deepEqual(applied.groups, [{ id: "grp_1", country: "SE", name: "Night", driverIds: ["D1", "D2"], version: 3 }, { id: "grp_9", country: "SE", name: "Airport", driverIds: ["D3"], version: 1 }]);
  assert.deepEqual(applied.presets, []);
  assert.deepEqual(applied.radarZoneRules, []);
  assert.equal(sent.length, 5);
  // An older server that answers a POST without the item: the caller must read the lists instead.
  assert.equal(applyToolAnswer(before, calls[0]!, {}), null);
  assert.equal(applyToolAnswer(before, { method: "POST", path: "/admin/dispatch/unknown", body: {} }, { x: 1 }), null);
  // A delete of a preset, like the radar zone's, takes just that row out.
  assert.deepEqual(applyToolAnswer(before, { method: "DELETE", path: "/admin/dispatch/presets/prs_1?expectedVersion=1" }, undefined)?.presets, []);
  assert.deepEqual(applyToolAnswer(before, { method: "DELETE", path: "/admin/dispatch/radar-rules/rr_1?expectedVersion=1" }, undefined)?.radarZoneRules, []);
});

test("G4 live fix: a 201 that is not the whole item (only its id and version) is not applied; the lists are read instead of a crash", async () => {
  const before: DispatchTools = { ...none, groups: [{ id: "grp_1", country: "SE", name: "Night", driverIds: ["D1"], version: 1 }] };
  const post = { method: "POST" as const, path: "/admin/dispatch/groups", body: { country: "SE", name: "Airport", driverIds: ["D3"] } };
  assert.equal(applyToolAnswer(before, post, { groupId: "grp_9", version: 1, createdAt: "2026-10-31T09:00:00Z" }), null);
  assert.equal(applyToolAnswer(before, { ...post, path: "/admin/dispatch/radar-zones" }, { radarZoneId: "rz_9", version: 1, name: "x", zoneId: "Z001", country: "SE" }), null);
  assert.equal(applyToolAnswer(before, { ...post, path: "/admin/dispatch/events" }, { eventId: "ev_9", version: 1, name: "x", country: "SE" }), null);
  assert.equal(applyToolAnswer(before, { ...post, path: "/admin/dispatch/presets" }, { presetId: "prs_9", version: 1, name: "x", country: "SE" }), null);
  assert.equal(applyToolAnswer(before, { ...post, path: "/admin/dispatch/radar-rules" }, { ruleId: "rr_9", version: 1, name: "x", country: "SE", radarZoneIds: "all" }), null);
  // sendToolCalls then answers null (no throw) and the caller reads the server.
  const http: ToolsHttp = { json: async () => { throw new Error("not here"); }, post: async <T,>() => ({ groupId: "grp_9", version: 1 }) as T, put: async <T,>() => ({}) as T, del: async () => undefined };
  assert.equal(await sendToolCalls(http, [post], before), null);
});

test("owner bug 2026-11-01: a raise to drivers who already saw the ride and assign/radar refusals read in the admin's language", async () => {
  const { registerDictionary, setLanguage, trSentences } = await import("../i18n/core.ts");
  const { fr } = await import("../i18n/fr.ts");
  const { sv } = await import("../i18n/sv.ts");
  const { refreshedNotice } = await import("./liveAdminApi.ts");
  registerDictionary("fr", fr);
  registerDictionary("sv", sv);
  assert.equal(refreshedNotice(0, 2, true), null, "nobody kept an offer: the screen's own notice");
  try {
    setLanguage("fr");
    assert.equal(refreshedNotice(1, 0, true), "Prix augmenté pour 1 chauffeur qui voyait déjà la course.");
    assert.equal(refreshedNotice(1, 2, true), "Prix augmenté pour 1 chauffeur qui voyait déjà la course. Envoyé aussi à 2 nouveaux chauffeurs.");
    for (const reason of ["offer_already_open", "driver_on_trip", "driver_not_available"]) {
      const english = toolRefusal({ status: 409, code: "conflict", reason });
      assert.ok(english, reason);
      assert.notEqual(trSentences(english!), english, `${reason} is translated in French`);
    }
    assert.equal(trSentences(toolRefusal({ status: 409, reason: "offer_already_open" })!), "Le chauffeur voit déjà cette course.");
    setLanguage("sv");
    assert.equal(refreshedNotice(2, 0, true), "Priset höjt för 2 förare som redan såg resan.");
    assert.equal(trSentences(toolRefusal({ status: 409, reason: "driver_not_available" })!), "Ingen vald förare kan ta en resa nu (offline eller ingen ny position).");
  } finally {
    setLanguage("en");
  }
  assert.equal(refreshedNotice(1, 0, true), "Price raised for 1 driver who already saw the ride.");
});
