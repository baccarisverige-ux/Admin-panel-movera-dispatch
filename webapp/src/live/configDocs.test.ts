import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyPricingStore, publishZones, zoneBook } from "../pricing/zonePricing.ts";
import { emptyDispatchBook, liveRules, publish, zoneDefault } from "../dispatch/rules.ts";
import { SettingsChanged, bookOfPricing, countryRulesOf, dispatchDocumentOf, pricingDocumentOf, rulesOfDispatch, savePublish, withOwned, zoneFacts, type ConfigHttp, type Doc } from "./configDocs.ts";
import { type SettingsAnswer, createLiveSettings, standardMarks } from "./liveSettings.ts";

/** A settings command's words (a save of the dispatch tools answers with the slice too). */
const said = (answer: string | SettingsAnswer | null) => (typeof answer === "string" ? answer : answer?.message ?? "");

/** Contract v0.8.0 settings flow (owner 2026-10-27): exporters, the Standard per country, publish without a second admin. */

const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;

type Call = { method: string; path: string; body?: unknown };
function fakeServer(drafts: Record<string, Doc & { version: number; liveVersion: number; usesStandard?: boolean; document: Doc }>, options: { conflict?: boolean } = {}) {
  const calls: Call[] = [];
  const keyOf = (path: string) => {
    const url = new URL(`http://x${path}`);
    const doc = url.pathname.split("/")[3]!;
    return `${doc}:${url.searchParams.get("zoneId") ?? `standard-${url.searchParams.get("country")}`}`;
  };
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      const found = drafts[keyOf(path)];
      if (!found) throw Object.assign(new Error("not found"), { status: 404 });
      return structuredClone(found) as T;
    },
    put: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "PUT", path, body });
      if (options.conflict) throw Object.assign(new Error("changed"), { status: 409 });
      return { version: ((body as { expectedVersion: number }).expectedVersion) + 1 } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "POST", path, body });
      return { version: 7 } as T;
    },
  };
  return { http, calls };
}

test("PricingDocument from the Pricing page: minor units, ONE seat fee on Child Seat only (v0.7.1), the contract sample's keys", () => {
  const store = emptyPricingStore();
  const book = zoneBook(store, "Z001");
  const doc = pricingDocumentOf(book, "Z001", { surge: { maxMultiplier: 3, notifyDrivers: true }, stopFreeWaitMin: 3 });
  const fixture = sample("pricing_document");
  // v0.7.1 (owner 2026-10-27): no free minutes at a stop and no separate surge maximum (the slider is the maximum).
  const gone = new Set(["stopFreeWaitMin"]);
  assert.deepEqual(Object.keys(doc).sort(), Object.keys(fixture).filter((k) => !gone.has(k)).sort());
  assert.ok(!("stopFreeWaitMin" in doc));
  const surge = doc["surge"] as Doc;
  assert.ok(!("maxMultiplier" in surge));
  // v0.7.2 (owner 2026-10-28): no surge notice; an old notifyDrivers on the server is not written back.
  assert.ok(!("notifyDrivers" in surge));
  assert.deepEqual(Object.keys(surge).sort(), ["scheduled", "smart"]);
  const categories = doc["categories"] as Record<string, Doc>;
  assert.deepEqual(categories["economy"]!["base"], { amountMinor: Math.round(book.prices["economy"]!.base * 100), currency: "SEK" });
  for (const [id, category] of Object.entries(categories)) {
    assert.ok(!("babySeatFee" in category), `${id} has no baby seat fee`);
    assert.equal("childSeatFee" in category, id === "child_seat", `${id}: seat fee only on Child Seat`);
  }
  assert.deepEqual(categories["child_seat"]!["childSeatFee"], { amountMinor: 1500, currency: "SEK" });
  // The admin's contract copy is older (seat fees on every category there); the other keys match.
  const seat = new Set(["babySeatFee", "childSeatFee"]);
  assert.deepEqual(Object.keys(categories["economy"]!).sort(), Object.keys((fixture["categories"] as Record<string, Doc>)["economy"]!).filter((k) => !seat.has(k)).sort());
  // Back to the page: the same book.
  assert.deepEqual(bookOfPricing(doc, zoneBook(emptyPricingStore(), "Z001")), { ...book, version: 1 });
});

test("the Standard of a country is a scope of its own, in the country's money", () => {
  assert.deepEqual(zoneFacts("standard-FR"), { id: "standard-FR", currency: "EUR", country: "FR", timeZone: "Europe/Paris", factor: 100 });
  const doc = pricingDocumentOf(zoneBook(emptyPricingStore(), "standard-FR"), "standard-FR", null);
  assert.equal(doc["zoneId"], "standard-FR");
  assert.equal(doc["currency"], "EUR");
});

test("DispatchDocument from the zone's rules, the same keys as the contract sample, and back", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  assert.deepEqual(Object.keys(doc).sort(), Object.keys(sample("dispatch_document")).sort());
  const back = rulesOfDispatch(doc, { offers: { autoOffline: { on: true, missedExclusive: 10 } }, cancelFees: { driverSharePct: 60 } }, zoneDefault("Z001"));
  assert.equal(back.autoOffline.after, 10);
  assert.equal(back.autoOffline.noFixMinutes, 5, "G3-R1: without the key the default 5 minutes stays");
  const fromServer = rulesOfDispatch(doc, { offers: { autoOffline: { on: true, missedExclusive: 10, noFixMinutes: 0 } } }, zoneDefault("Z001"));
  assert.equal(fromServer.autoOffline.noFixMinutes, 0, "G3-R1: 0 = never is read back from driver_app_config");
  assert.equal(back.riderCancel.driverSharePct, 60);
  assert.deepEqual(back.radar, zone.radar);
  // v0.18.7 (G5): the cancel-after-arrived switch and the pickup move limit come back from the driver document.
  assert.equal(back.pickupWait.cancelAfterArrivedIsNoShow, true, "default on");
  assert.equal(back.pickupMove.maxMeters, 200, "contract default 200 m");
  const g5 = rulesOfDispatch(doc, { waiting: { cancelAfterArrivedIsNoShow: false }, booking: { maxStops: 3, maxPickupMoveMeters: 350 } }, zoneDefault("Z001"));
  assert.equal(g5.pickupWait.cancelAfterArrivedIsNoShow, false);
  assert.equal(g5.pickupMove.maxMeters, 350);
  const bad = rulesOfDispatch(doc, { waiting: { cancelAfterArrivedIsNoShow: "yes" }, booking: { maxPickupMoveMeters: 5000 } }, zoneDefault("Z001"));
  assert.equal(bad.pickupWait.cancelAfterArrivedIsNoShow, true, "a bad value keeps the default");
  assert.equal(bad.pickupMove.maxMeters, 200, "outside 0–2000 keeps the default");
});

test("a page writes only its own parts of an app document; the waiting money stays the server's", () => {
  const server = { version: 4, offers: { radarSeconds: 15 }, texts: { byLanguage: { sv: { hi: "Hej" } } }, waiting: { perMin: { amountMinor: 1226, currency: "SEK" }, driverSharePct: 80 } };
  const built = { offers: { radarSeconds: 20 }, texts: { byLanguage: {} }, waiting: { perMin: { amountMinor: 1, currency: "SEK" }, driverSharePct: 70, driverShareWaitPct: 100 } };
  const next = withOwned(server, built, ["offers", "waiting"]);
  assert.deepEqual(next["offers"], { radarSeconds: 20 });
  assert.deepEqual(next["texts"], server.texts);
  assert.deepEqual((next["waiting"] as Doc)["perMin"], server.waiting.perMin);
  assert.equal((next["waiting"] as Doc)["driverSharePct"], 70);
  // v0.18.7 (G5 Q2): the admin's switch is written with the waiting part; the money still stays the server's.
  const withSwitch = withOwned({ ...server, waiting: { ...server.waiting, cancelAfterArrivedIsNoShow: true } }, { ...built, waiting: { ...built.waiting, cancelAfterArrivedIsNoShow: false } }, ["waiting"]);
  assert.equal((withSwitch["waiting"] as Doc)["cancelAfterArrivedIsNoShow"], false);
  assert.deepEqual((withSwitch["waiting"] as Doc)["perMin"], server.waiting.perMin);
});

test("v0.18.8 (G6): the stop free wait and the Rider PIN switch are read from and written to the driver document", () => {
  const doc = dispatchDocumentOf(zoneDefault("Z001"), "Z001", null);
  const read = rulesOfDispatch(doc, { waiting: { stopFreeWaitMin: 4 }, pickupPin: { required: true, maxAttempts: 3, lockMinutes: 10 } }, zoneDefault("Z001"));
  assert.equal(read.stops.freeWaitMin, 4);
  assert.deepEqual(read.pickupPin, { required: true, maxAttempts: 3, lockMinutes: 10 });
  const bad = rulesOfDispatch(doc, { waiting: { stopFreeWaitMin: 99 }, pickupPin: { required: "yes", maxAttempts: 50, lockMinutes: 0 } }, zoneDefault("Z001"));
  assert.equal(bad.stops.freeWaitMin, 3, "outside 0–20 keeps the zone's value");
  assert.deepEqual(bad.pickupPin, { required: false, maxAttempts: 5, lockMinutes: 5 }, "bad values keep the defaults, never switch it on");
  const next = withOwned({ waiting: { perMin: { amountMinor: 1226, currency: "SEK" } } }, { waiting: { stopFreeWaitMin: 3 }, pickupPin: { required: true, maxAttempts: 5, lockMinutes: 5 } }, ["waiting", "pickupPin"]);
  assert.equal((next["waiting"] as Doc)["stopFreeWaitMin"], 3);
  assert.deepEqual(next["pickupPin"], { required: true, maxAttempts: 5, lockMinutes: 5 });
});

test("save and publish: nothing when equal, at once when changed (no second admin), a 409 asks to reload", async () => {
  const doc = pricingDocumentOf(zoneBook(emptyPricingStore(), "Z001"), "Z001", null);
  const same = fakeServer({});
  assert.equal(await savePublish(same.http, "pricing", "Z001", { version: 3, liveVersion: 2, document: doc }, doc), null);
  assert.equal(same.calls.length, 0);
  // A zone that uses the Standard gets its own document when the admin publishes it, even with equal values.
  const own = fakeServer({});
  assert.deepEqual(await savePublish(own.http, "pricing", "Z001", { version: 1, liveVersion: 0, usesStandard: true, document: doc }, doc), { version: 7 });
  assert.deepEqual(own.calls.map((c) => `${c.method} ${c.path}`), ["PUT /admin/config/pricing", "POST /admin/config/pricing/publish"]);
  assert.deepEqual(own.calls[1]!.body, { expectedVersion: 2, zoneId: "Z001" });
  const standard = fakeServer({});
  await savePublish(standard.http, "pricing", "standard-SE", null, { ...doc, zoneId: "standard-SE" });
  assert.deepEqual(standard.calls[1]!.body, { expectedVersion: 2, country: "SE" });
  const conflict = fakeServer({}, { conflict: true });
  await assert.rejects(savePublish(conflict.http, "pricing", "Z001", { version: 3, liveVersion: 2, document: doc }, { ...doc, fleetCommissionPct: 9 }), SettingsChanged);
});

test("country rules: tips, raise steps and the driver bonus limit in the country's money", () => {
  const doc = countryRulesOf("FR", "EUR", { tips: [1, 2.5], raiseSteps: [2], driverBonus: { defaultLimit: 20, hardMax: 95 } }, null);
  assert.deepEqual(doc["tips"], [{ amount: { amountMinor: 100, currency: "EUR" }, enabled: true }, { amount: { amountMinor: 250, currency: "EUR" }, enabled: true }]);
  assert.deepEqual(doc["driverBonus"], { defaultLimit: { amountMinor: 2000, currency: "EUR" }, hardMax: { amountMinor: 9500, currency: "EUR" } });
});

test("live Pricing: reading marks 'Uses standard'; publishing sends the changed zones at once; Go back to Standard", async () => {
  const z1 = pricingDocumentOf(zoneBook(emptyPricingStore(), "Z001"), "Z001", null);
  const server = fakeServer({
    "pricing:Z001": { version: 1, liveVersion: 0, usesStandard: true, document: z1 },
    "pricing:Z002": { version: 3, liveVersion: 2, usesStandard: false, document: { ...z1, zoneId: "Z002", fleetCommissionPct: 7 } },
  });
  const settings = createLiveSettings(server.http, () => "2026-10-27T10:00:00Z");
  const store = (await settings.readSlice("zonePricing", null)) as ReturnType<typeof emptyPricingStore>;
  assert.equal(standardMarks.get("pricing", "Z001"), true);
  assert.equal(standardMarks.get("pricing", "Z002"), false);
  assert.equal(store.zones["Z002"]!.fleetCommissionPct, 7);
  const edited = { ...zoneBook(store, "Z002"), fleetCommissionPct: 8 };
  const published = publishZones(store, { Z002: edited }, "A1", "Pricing update", "2026-10-27T10:00:00Z");
  server.calls.length = 0;
  assert.equal(await settings.command("admin.pricing.publish", { targetId: "pricing", value: published.store }), "Published.");
  const put = server.calls.find((c) => c.method === "PUT")!;
  assert.equal(((put.body as { document: Doc }).document)["fleetCommissionPct"], 8);
  assert.equal((put.body as { expectedVersion: number }).expectedVersion, 3);
  server.calls.length = 0;
  await settings.command("admin.config.useStandard", { targetId: "Z002", value: { docs: ["pricing"] } });
  assert.deepEqual(server.calls.at(-1), { method: "POST", path: "/admin/config/pricing/use-standard", body: { zoneId: "Z002", expectedVersion: 3 } });
  assert.equal(standardMarks.get("pricing", "Z002"), true);
});

test("live Dispatch publishes big changes at once: no second admin", () => {
  const book = emptyDispatchBook();
  const zone = { ...liveRules(book, "Z001"), choose: { ...liveRules(book, "Z001").choose, how: "manual" as const, main: "exclusive" as const } };
  const demo = publish(book, { Z001: zone }, {}, ["Z001"], "A1", "2026-10-27T10:00:00Z", "");
  const live = publish(book, { Z001: zone }, {}, ["Z001"], "A1", "2026-10-27T10:00:00Z", "", { direct: true });
  assert.deepEqual(live.waiting, []);
  assert.deepEqual(live.live, ["Z001"]);
  assert.equal(live.book.approvals.length, 0);
  // The demo keeps its second-admin step for the same change.
  assert.deepEqual(demo.waiting, ["Z001"]);
});

test("publish scope (owner 2026-10-27): only the zones chosen at the top; the Standard only when chosen", async () => {
  const { resolveScope, publishTargets, zoneAllowed } = await import("../markets/scope.ts");
  const all = { zones: "all" as const };
  assert.deepEqual(publishTargets(resolveScope(all, { scope: "Z002" })), ["Z002"]);
  const every = publishTargets(resolveScope(all, { country: "SE" }));
  assert.ok(every.includes("Z001") && every.includes("BMA") && !every.includes("standard-SE"));
  const withStandard = publishTargets(resolveScope(all, { scope: "all,standard-SE" }));
  assert.ok(withStandard.includes("standard-SE") && withStandard.includes("Z009"));
  assert.deepEqual(publishTargets(resolveScope(all, { scope: "standard-FR" })), ["standard-FR"]);
  // A zone admin of Sweden may work on Sweden's Standard, not on France's.
  assert.equal(zoneAllowed({ zones: ["Z001"] }, "standard-SE"), true);
  assert.equal(zoneAllowed({ zones: ["Z001"] }, "standard-FR"), false);
});

test("live Settings publishes only to the chosen zones; a chosen zone on the Standard gets its own", async () => {
  const doc = { ...sample("rider_app_config"), zoneId: "Z002" };
  const server = fakeServer({
    "rider_app_config:Z002": { version: 1, liveVersion: 0, usesStandard: true, document: doc },
    "driver_app_config:Z002": { version: 1, liveVersion: 0, usesStandard: true, document: { ...sample("driver_app_config"), zoneId: "Z002" } },
    "rider_app_config:Z003": { version: 2, liveVersion: 1, usesStandard: false, document: { ...doc, zoneId: "Z003" } },
  });
  const settings = createLiveSettings(server.http, () => "2026-10-27T10:00:00Z");
  await settings.command("admin.config.publish", { targetId: "configuration", value: null, scope: "Z002" });
  const written = server.calls.filter((c) => c.method !== "GET").map((c) => (c.body as { zoneId?: string }).zoneId);
  assert.ok(written.length > 0 && written.every((zone) => zone === "Z002"));
  await assert.rejects(settings.command("admin.config.publish", { targetId: "configuration", value: null, scope: "" })!);
});

test("live Tips & limits (v0.8.1, owner 2026-10-28): read per zone, saved only to the zones chosen at the top", async () => {
  const rules = (tip: number) => countryRulesOf("SE", "SEK", { tips: [tip], raiseSteps: [20], driverBonus: { defaultLimit: 150, hardMax: 1000 } }, null);
  const server = fakeServer({
    "country_rules:standard-SE": { version: 2, liveVersion: 1, usesStandard: false, document: rules(10) },
    "country_rules:Z001": { version: 1, liveVersion: 0, usesStandard: true, document: rules(10) },
    "country_rules:Z002": { version: 4, liveVersion: 3, usesStandard: false, document: rules(35) },
  });
  const settings = createLiveSettings(server.http, () => "2026-10-28T10:00:00Z");
  const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as { draftRev: number; countries: Record<string, { tips: Array<{ amount: number }> }> };
  // The zones' own are read only when the Tips & limits tab asks (the panel's first load does not wait for them).
  const zones = (await settings.readSlice("countrySettingsZones", {})) as Record<string, { tips: Array<{ amount: number }> }>;
  const book = { ...countries, zones };
  assert.equal(book.zones["Z002"]!.tips[0]!.amount, 35);
  assert.equal(book.zones["Z001"]!.tips[0]!.amount, 10);
  assert.equal(standardMarks.get("country_rules", "Z001"), true);
  assert.equal(standardMarks.get("country_rules", "Z002"), false);

  server.calls.length = 0;
  const shown = { ...book.zones["Z002"]!, tips: [{ id: "t1", amount: 40, enabled: true }] };
  const value = { ...book, draftRev: 1, zones: { ...book.zones, Z001: shown, Z002: shown } };
  assert.equal(await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: "Z001,Z002" }), "Saved for the chosen zones.");
  const puts = server.calls.filter((c) => c.method === "PUT");
  assert.deepEqual(puts.map((c) => (c.body as { zoneId?: string }).zoneId), ["Z001", "Z002"]);
  assert.deepEqual(((puts[0]!.body as { document: Doc }).document)["tips"], [{ amount: { amountMinor: 4000, currency: "SEK" }, enabled: true }]);
  // Nothing went to the Standard or another zone, and nothing goes without a choice at the top.
  assert.equal(server.calls.some((c) => c.path.includes("country=SE") && c.method !== "GET"), false);
  await assert.rejects(Promise.resolve(settings.command("admin.pricing.saveCountry", { targetId: "x", value, scope: "" })), /Choose the zones/);
});

test("live Dispatch (owner 2026-10-28): Spara utkast keeps a server draft; Ångra puts the zone's version before back", async () => {
  const base = dispatchDocumentOf(liveRules(emptyDispatchBook(), "Z001"), "Z001", null);
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const history = [
    { version: 5, publishedAt: "2026-10-28T09:00:00Z", publishedBy: "A2", action: "publish", document: { ...base, version: 5 } },
    { version: 4, publishedAt: "2026-10-27T09:00:00Z", publishedBy: "A1", action: "publish", document: { ...base, version: 4 } },
  ];
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      if (path.startsWith("/admin/config/dispatch/history?zoneId=Z001")) return { items: history } as T;
      if (path.startsWith("/admin/config/dispatch?zoneId=Z001")) return { version: 6, liveVersion: 5, usesStandard: false, document: { ...base, version: 5 } } as T;
      throw Object.assign(new Error("not found"), { status: 404 });
    },
    put: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "PUT", path, body });
      return { version: 7 } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "POST", path, body });
      return { version: 6 } as T;
    },
  };
  const settings = createLiveSettings(http, () => "2026-10-28T10:00:00Z");
  const book = (await settings.readSlice("dispatchRules", null)) as ReturnType<typeof emptyDispatchBook>;
  assert.deepEqual(book.versions.map((v) => [v.rev, v.zoneIds[0]]), [[2, "Z001"], [1, "Z001"]]);

  const edited = { ...book, draft: { Z001: { ...liveRules(book, "Z001"), radar: { ...liveRules(book, "Z001").radar, seconds: 33 } } } };
  calls.length = 0;
  assert.match(said(await settings.command("admin.dispatch.saveDraft", { targetId: "dispatch draft", value: edited })), /Draft saved/);
  assert.deepEqual(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`), ["PUT /admin/config/dispatch"]);

  calls.length = 0;
  assert.match(said(await settings.command("admin.dispatch.undo", { targetId: "version 2" })), /Undone/);
  assert.deepEqual(calls.at(-1), { method: "POST", path: "/admin/config/dispatch/restore", body: { zoneId: "Z001", version: 4, expectedVersion: 5 } });
  await assert.rejects(Promise.resolve(settings.command("admin.dispatch.undo", { targetId: "version 1" })), /no earlier version/);
});

// G3 (owner 2026-10-30: "every admin setting must work on live"). On live the zones' driver_app_config drafts were
// "version 3" against "live version 1": a draft that already held a change was compared with itself and skipped, a
// scope with nothing on the server was skipped, and a zone's own app document hid every Standard publish.
test("G3: app settings are published when they differ from what is LIVE, also when the draft already holds them", async () => {
  const { savePublishLive, unpublishedKeys } = await import("./configDocs.ts");
  const live: Doc = { ...sample("driver_app_config"), zoneId: "Z001" };
  const changed = { ...live, features: { ...(live["features"] as Doc), newThing: true } };
  const draft = { version: 3, liveVersion: 1, usesStandard: false, document: changed };
  const server = fakeServer({});
  assert.deepEqual(await savePublishLive(server.http, "driver_app_config", "Z001", draft, changed, live), { version: 7 }, "the draft holds the change, drivers still have v1: publish");
  assert.deepEqual(server.calls.map((c) => `${c.method} ${c.path}`), ["PUT /admin/config/driver_app_config", "POST /admin/config/driver_app_config/publish"]);
  assert.equal((server.calls[0]!.body as { expectedVersion: number }).expectedVersion, 3);
  const same = fakeServer({});
  assert.equal(await savePublishLive(same.http, "driver_app_config", "Z001", { ...draft, document: live }, live, live), null, "same as live: nothing sent");
  assert.deepEqual(unpublishedKeys(changed, live), ["features"]);
  assert.deepEqual(unpublishedKeys({ ...live, version: 9, publishedAt: "x" }, live), []);
});

test("G3: live Settings publish reaches a zone whose draft already holds the change and a scope with nothing on the server", async () => {
  const live = { ...sample("driver_app_config"), zoneId: "Z002" };
  // What the Settings exporter builds for Z002 is already the draft; live is still the older document.
  const probe = fakeServer({ "driver_app_config:Z002": { version: 1, liveVersion: 0, usesStandard: true, document: live } });
  await createLiveSettings(probe.http, () => "2026-10-27T10:00:00Z").command("admin.config.publish", { targetId: "configuration", value: null, scope: "Z002" });
  const built = (probe.calls.find((c) => c.method === "PUT" && c.path.includes("driver_app_config"))!.body as { document: Doc }).document;
  const server = fakeServer({ "driver_app_config:Z002": { version: 3, liveVersion: 1, usesStandard: false, document: built } });
  const http = { ...server.http, json: async <T,>(path: string) => (path.includes("/history") ? ({ items: [{ version: 1, publishedAt: "2026-10-25T23:13:11Z", action: "publish", document: { ...built, features: {} } }] } as T) : server.http.json<T>(path)) };
  await createLiveSettings(http, () => "2026-10-27T10:00:00Z").command("admin.config.publish", { targetId: "configuration", value: null, scope: "Z002" });
  assert.ok(server.calls.some((c) => c.method === "POST" && c.path === "/admin/config/driver_app_config/publish"), "published although the draft equals the built document");
  // Nothing on the server for the scope (not even a Standard): the admin's document is published, not skipped.
  const empty = fakeServer({});
  await createLiveSettings(empty.http, () => "2026-10-27T10:00:00Z").command("admin.config.publish", { targetId: "configuration", value: null, scope: "Z003" });
  assert.ok(empty.calls.some((c) => c.method === "POST" && c.path === "/admin/config/driver_app_config/publish"), "first document published");
});

test("G3: a Standard Dispatch publish reaches the drivers of zones that follow the Standard rules but have their own app document", async () => {
  const book0 = emptyDispatchBook();
  const book = { ...book0, draftRev: 9, versions: [{ rev: 9, at: "2026-10-30T10:00:00Z", actorId: "A1", note: "", zoneIds: ["standard-SE"], lines: [], live: book0.live, liveCountries: book0.liveCountries }, ...book0.versions] };
  const rules = (id: string) => dispatchDocumentOf(liveRules(book0, id), id, null);
  const app = (id: string) => ({ ...sample("driver_app_config"), zoneId: id });
  const server = fakeServer({
    "dispatch:standard-SE": { version: 2, liveVersion: 1, document: rules("standard-SE") },
    "driver_app_config:standard-SE": { version: 4, liveVersion: 2, document: { ...app("standard-SE"), offers: { changed: true } } },
    "dispatch:Z001": { version: 1, liveVersion: 0, usesStandard: true, document: rules("Z001") },
    "driver_app_config:Z001": { version: 3, liveVersion: 1, usesStandard: false, document: app("Z001") },
    "dispatch:Z002": { version: 2, liveVersion: 1, usesStandard: false, document: rules("Z002") },
    "driver_app_config:Z002": { version: 3, liveVersion: 1, usesStandard: false, document: app("Z002") },
  });
  const settings = createLiveSettings(server.http, () => "2026-10-30T10:00:00Z");
  await settings.command("admin.dispatch.publish", { targetId: "dispatch", value: book });
  const published = server.calls.filter((c) => c.method === "POST").map((c) => `${c.path} ${JSON.stringify(c.body)}`);
  assert.ok(published.some((line) => line.startsWith("/admin/config/driver_app_config/publish") && line.includes('"country":"SE"')), published.join("\n"));
  assert.ok(published.some((line) => line.startsWith("/admin/config/driver_app_config/publish") && line.includes('"zoneId":"Z001"')), "Z001 follows the Standard rules: its drivers get them");
  assert.ok(!published.some((line) => line.includes('"zoneId":"Z002"')), "Z002 has its own rules: untouched");
});

test("G3: a Settings publish to the Standard names the zones that keep their own driver app settings", async () => {
  const app = (id: string) => ({ ...sample("driver_app_config"), zoneId: id });
  const server = fakeServer({
    "driver_app_config:standard-SE": { version: 4, liveVersion: 2, document: app("standard-SE") },
    "rider_app_config:standard-SE": { version: 4, liveVersion: 2, document: { ...sample("rider_app_config"), zoneId: "standard-SE" } },
    "driver_app_config:Z001": { version: 3, liveVersion: 1, usesStandard: false, document: app("Z001") },
    "driver_app_config:Z002": { version: 1, liveVersion: 0, usesStandard: true, document: app("Z002") },
  });
  const message = said((await createLiveSettings(server.http, () => "2026-10-30T10:00:00Z").command("admin.config.publish", { targetId: "configuration", value: null, scope: "standard-SE" }))!);
  assert.match(message, /own driver app settings and did not get it: Norrmalm\./);
  assert.ok(!/Södermalm/.test(message), "Z002 uses the Standard: it got the change");
});

test("G3: reading Dispatch tells which parts of a zone's driver app settings are saved but not live", async () => {
  const { unpublishedMarks } = await import("./liveSettings.ts");
  const live = { ...sample("driver_app_config"), zoneId: "Z001" };
  const server = fakeServer({
    "dispatch:Z001": { version: 2, liveVersion: 1, usesStandard: false, document: dispatchDocumentOf(liveRules(emptyDispatchBook(), "Z001"), "Z001", null) },
    "driver_app_config:Z001": { version: 3, liveVersion: 1, usesStandard: false, document: { ...live, offers: { changed: true } } },
    "driver_app_config:Z002": { version: 3, liveVersion: 1, usesStandard: false, document: { ...live, zoneId: "Z002" } },
    "dispatch:Z002": { version: 2, liveVersion: 1, usesStandard: false, document: dispatchDocumentOf(liveRules(emptyDispatchBook(), "Z002"), "Z002", null) },
  });
  const http = { ...server.http, json: async <T,>(path: string) => {
    if (path.startsWith("/admin/config/driver_app_config/history?zoneId=Z001")) return { items: [{ version: 1, publishedAt: "2026-10-25T23:13:11Z", action: "publish", document: live }] } as T;
    if (path.startsWith("/admin/config/driver_app_config/history?zoneId=Z002")) return { items: [{ version: 1, publishedAt: "2026-10-25T23:13:11Z", action: "publish", document: { ...live, zoneId: "Z002" } }] } as T;
    return server.http.json<T>(path);
  } };
  await createLiveSettings(http, () => "2026-10-30T10:00:00Z").readSlice("dispatchRules", null);
  assert.deepEqual(unpublishedMarks.get("driver_app_config", "Z001"), ["offers"]);
  assert.deepEqual(unpublishedMarks.get("driver_app_config", "Z002"), [], "draft version 3 vs live 1 with the same content: nothing waiting");
});

test("G3: Publish to drivers publishes the zone's saved driver app draft as it is", async () => {
  const { unpublishedMarks } = await import("./liveSettings.ts");
  const server = fakeServer({ "driver_app_config:Z001": { version: 3, liveVersion: 1, usesStandard: false, document: { ...sample("driver_app_config"), zoneId: "Z001" } } });
  const settings = createLiveSettings(server.http, () => "2026-10-30T10:00:00Z");
  assert.match(said(await settings.command("admin.config.publishAppDraft", { targetId: "Z001" })), /Published/);
  assert.deepEqual(server.calls.filter((c) => c.method !== "GET"), [{ method: "POST", path: "/admin/config/driver_app_config/publish", body: { expectedVersion: 3, zoneId: "Z001" } }]);
  assert.deepEqual(unpublishedMarks.get("driver_app_config", "Z001"), []);
  await assert.rejects(Promise.resolve(settings.command("admin.config.publishAppDraft", { targetId: "standard-SE" })));
});

// Owner G3-D8 (2026-10-30): "Keep each zone own setting and add copy all zone botton".
test("G3-D8: Copy to all zones copies the driver app settings to every zone of the country and publishes; zones keep their own", async () => {
  const live = await import("./liveSettings.ts");
  const app = (id: string, extra: Doc = {}) => ({ ...sample("driver_app_config"), zoneId: id, ...extra });
  const server = fakeServer({
    "driver_app_config:Z001": { version: 3, liveVersion: 1, usesStandard: false, document: app("Z001", { offers: { source: true }, features: { wallet: false } }) },
    "driver_app_config:Z002": { version: 3, liveVersion: 1, usesStandard: false, document: app("Z002") },
    "driver_app_config:Z003": { version: 1, liveVersion: 0, usesStandard: true, document: app("Z003") },
  });
  const settings = createLiveSettings(server.http, () => "2026-10-30T10:00:00Z");
  assert.ok(live.copyTargets("Z001").includes("Z002") && !live.copyTargets("Z001").includes("Z001") && !live.copyTargets("Z001").includes("FR-PC"));
  assert.match(said(await settings.command("admin.config.copyAppToZones", { targetId: "Z001" })), /Copied/);
  const puts = server.calls.filter((c) => c.method === "PUT").map((c) => c.body as { zoneId: string; document: Doc });
  for (const zone of ["Z002", "Z003"]) {
    const sent = puts.find((b) => b.zoneId === zone)!;
    assert.deepEqual([sent.document["offers"], sent.document["features"], sent.document["zoneId"]], [{ source: true }, { wallet: false }, zone]);
  }
  assert.ok(!puts.some((b) => b.zoneId === "Z001"));
  assert.ok(server.calls.some((c) => c.method === "POST" && (c.body as { zoneId?: string }).zoneId === "Z003"), "published to the drivers");
  assert.ok(!server.calls.some((c) => c.path.includes("use-standard")), "no zone is set back to the Standard");
});

test("G4 live fix: the dispatch tools read for one admin are forgotten on forget() (sign-out, another admin), and reused within 10 s otherwise", async () => {
  const { DISPATCH_KEY, emptyDispatchBook: empty } = await import("../dispatch/rules.ts");
  let groups = [{ groupId: "grp_se", country: "SE", name: "SE night", driverIds: [], version: 1 }];
  let reads = 0;
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      if (path === "/admin/dispatch/groups") { reads += 1; return { items: groups } as T; }
      if (path.startsWith("/admin/dispatch/")) return { items: [] } as T;
      throw Object.assign(new Error("not found"), { status: 404 });
    },
    put: async <T,>() => ({}) as T,
    post: async <T,>() => ({}) as T,
    del: async () => undefined,
  };
  const settings = createLiveSettings(http, () => "2026-10-31T10:00:00Z");
  const first = (await settings.readSlice(DISPATCH_KEY, empty())) as { groups: { id: string }[] };
  assert.deepEqual(first.groups.map((g) => g.id), ["grp_se"]);
  // A second read right after reuses the state (the page's re-read after a save).
  await settings.readSlice(DISPATCH_KEY, empty());
  assert.equal(reads, 1);
  // The next admin must not see it.
  groups = [{ groupId: "grp_fr", country: "FR", name: "Paris nuit", driverIds: [], version: 1 }];
  settings.forget();
  const next = (await settings.readSlice(DISPATCH_KEY, empty())) as { groups: { id: string }[] };
  assert.equal(reads, 2);
  assert.deepEqual(next.groups.map((g) => g.id), ["grp_fr"]);
});

test("checker HIGH (live 2026-11-01): a zone loaded with Exclusive off and 0 s gets the defaults, a note, and publishes", async () => {
  const { rulesOfDispatch } = await import("./configDocs.ts");
  const { zoneIssues } = await import("../dispatch/rules.ts");
  const base = liveRules(emptyDispatchBook(), "Z001");
  const loaded = rulesOfDispatch({ radar: { ...base.radar, seconds: 0 }, exclusive: { ...base.exclusive, on: false, seconds: 0 } } as never, null, base);
  assert.equal(loaded.exclusive.seconds, 30);
  assert.equal(loaded.radar.seconds, 15);
  assert.deepEqual(loaded.secondsDefaulted, ["radar", "exclusive"]);
  assert.deepEqual(zoneIssues(loaded).filter((issue) => /seconds/.test(issue)), []);
  // The strict check stays while the mode is on.
  assert.ok(zoneIssues({ ...loaded, exclusive: { ...loaded.exclusive, on: true, seconds: 3 } }).some((issue) => issue.startsWith("Exclusive:")));
  assert.ok(!zoneIssues({ ...loaded, exclusive: { ...loaded.exclusive, on: false, seconds: 3 } }).some((issue) => issue.startsWith("Exclusive:")));
});
