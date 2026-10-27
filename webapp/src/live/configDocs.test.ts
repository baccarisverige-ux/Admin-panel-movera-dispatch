import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyPricingStore, publishZones, zoneBook } from "../pricing/zonePricing.ts";
import { emptyDispatchBook, liveRules, publish, zoneDefault } from "../dispatch/rules.ts";
import { SettingsChanged, bookOfPricing, notifyDriversOf, countryRulesOf, dispatchDocumentOf, pricingDocumentOf, rulesOfDispatch, savePublish, withOwned, zoneFacts, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings, standardMarks } from "./liveSettings.ts";

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
  const doc = pricingDocumentOf(book, "Z001", { surge: { maxMultiplier: 3 }, stopFreeWaitMin: 3 }, { notifyDrivers: true });
  const fixture = sample("pricing_document");
  // v0.7.1 (owner 2026-10-27): no free minutes at a stop and no separate surge maximum (the slider is the maximum).
  const gone = new Set(["stopFreeWaitMin"]);
  assert.deepEqual(Object.keys(doc).sort(), Object.keys(fixture).filter((k) => !gone.has(k)).sort());
  assert.ok(!("stopFreeWaitMin" in doc));
  const surge = doc["surge"] as Doc;
  assert.ok(!("maxMultiplier" in surge));
  assert.equal(surge["notifyDrivers"], true);
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
  assert.equal(notifyDriversOf(doc), true);
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
  assert.equal(back.riderCancel.driverSharePct, 60);
  assert.deepEqual(back.radar, zone.radar);
});

test("a page writes only its own parts of an app document; the waiting money stays the server's", () => {
  const server = { version: 4, offers: { radarSeconds: 15 }, texts: { byLanguage: { sv: { hi: "Hej" } } }, waiting: { perMin: { amountMinor: 1226, currency: "SEK" }, driverSharePct: 80 } };
  const built = { offers: { radarSeconds: 20 }, texts: { byLanguage: {} }, waiting: { perMin: { amountMinor: 1, currency: "SEK" }, driverSharePct: 70, driverShareWaitPct: 100 } };
  const next = withOwned(server, built, ["offers", "waiting"]);
  assert.deepEqual(next["offers"], { radarSeconds: 20 });
  assert.deepEqual(next["texts"], server.texts);
  assert.deepEqual((next["waiting"] as Doc)["perMin"], server.waiting.perMin);
  assert.equal((next["waiting"] as Doc)["driverSharePct"], 70);
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
