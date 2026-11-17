import { test } from "node:test";
import assert from "node:assert/strict";
import { countryRulesOf, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";

/**
 * U2 (Rules audits/impact/safe-config-saves.md, SAFETY): the Tips & limits Save rebuilt the `calls` block from the
 * panel's fixed list, so calls.adminCallRoles and calls.phoneProvider (contract.json CountryRules.calls) were dropped.
 * The block now starts from the stored block; the panel's own keys win. The same for chat, dontMatchAgain,
 * onTripOffers and driverBonus. Real path ("admin.pricing.saveCountry") against a server that stores what it is sent.
 */
type Row = { draftVersion: number; liveVersion: number; draft: Doc; live: Doc };
function server(document: Doc) {
  const rows = new Map<string, Row>([["country_rules:standard-SE", { draftVersion: 2, liveVersion: 1, draft: document, live: document }]]);
  const puts: Doc[] = [];
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      const url = new URL(`http://x${path}`);
      const doc = url.pathname.split("/")[3];
      const row = url.searchParams.get("zoneId") ? undefined : rows.get(`${doc}:standard-${url.searchParams.get("country")}`);
      if (!row) throw Object.assign(new Error("config_not_found"), { status: 404, reason: "config_not_found" });
      return { version: row.draftVersion, liveVersion: row.liveVersion, document: structuredClone(row.draft) } as T;
    },
    put: async <T,>(path: string, body: unknown) => {
      const input = body as { expectedVersion: number; document: Doc };
      const key = `${path.split("/")[3]}:standard-SE`;
      const row = rows.get(key) ?? { draftVersion: 1, liveVersion: 0, draft: {}, live: {} };
      rows.set(key, row);
      assert.equal(row.draftVersion, input.expectedVersion);
      if (key.startsWith("country_rules:")) puts.push(input.document);
      row.draft = structuredClone(input.document);
      row.draftVersion += 1;
      return { version: row.draftVersion } as T;
    },
    post: async <T,>(path: string) => {
      const row = rows.get(`${path.split("/")[3]}:standard-SE`)!;
      row.liveVersion += 1;
      row.live = { ...row.draft, version: row.liveVersion };
      row.draftVersion += 1;
      return { version: row.liveVersion } as T;
    },
  };
  return { http, puts, live: () => rows.get("country_rules:standard-SE")!.live };
}

type Zone = Record<string, unknown> & { calls: Record<string, unknown> };
type Book = { draftRev: number; countries: Record<string, unknown>; zones: Record<string, Zone> };
const CALLS = { on: true, mode: "in_app", callWindowAfterTripMin: 60, ringSeconds: 30, maxCallMin: 15, connectTimeoutSeconds: 25, adminCallRoles: ["safety"], phoneProvider: "x" };

async function saveWith(change: (zone: Zone) => Zone) {
  const rules: Doc = { ...countryRulesOf("SE", "SEK", { tips: [10, 20, 30], raiseSteps: [50, 100], driverBonus: { defaultLimit: 200, hardMax: 1000 }, onTripMinDonePct: 70, chainLateFreeCancelMin: 10, dontMatchAgain: { on: true, atStars: 2 } }, null), calls: CALLS };
  (rules["dontMatchAgain"] as Record<string, unknown>)["futureKey"] = 3;
  (rules["onTripOffers"] as Record<string, unknown>)["futureKey"] = 4;
  (rules["driverBonus"] as Record<string, unknown>)["futureKey"] = 5;
  const fake = server(rules);
  const settings = createLiveSettings(fake.http, () => "2026-11-17T08:00:00Z");
  const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as Book;
  const zones = (await settings.readSlice("countrySettingsZones", {})) as Book["zones"];
  const book = { ...countries, zones };
  const value: Book = { ...book, draftRev: book.draftRev + 1, zones: { ...book.zones, "standard-SE": change(book.zones["standard-SE"]!) } };
  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: "standard-SE" });
  assert.equal(fake.puts.length, 1, "the Save wrote country_rules");
  return { sent: fake.puts[0]!, live: fake.live() };
}

test("U2 safety: a Tips & limits Save after one tip change keeps calls.adminCallRoles and calls.phoneProvider", async () => {
  const { sent, live } = await saveWith((zone) => ({ ...zone, tips: [{ id: "t1", amount: 40, enabled: true }] }));
  for (const doc of [sent, live]) {
    const calls = doc["calls"] as Record<string, unknown>;
    assert.deepEqual(calls["adminCallRoles"], ["safety"]);
    assert.equal(calls["phoneProvider"], "x");
    assert.equal((doc["dontMatchAgain"] as Record<string, unknown>)["futureKey"], 3);
    assert.equal((doc["onTripOffers"] as Record<string, unknown>)["futureKey"], 4);
    assert.equal((doc["driverBonus"] as Record<string, unknown>)["futureKey"], 5);
  }
});

test("U2 mutation: the panel's ringSeconds edit and a switched-off calls block still win", async () => {
  const { sent, live } = await saveWith((zone) => ({ ...zone, calls: { ...zone.calls, ringSeconds: 45, on: false } }));
  for (const doc of [sent, live]) {
    const calls = doc["calls"] as Record<string, unknown>;
    assert.equal(calls["ringSeconds"], 45);
    assert.equal(calls["on"], false, "a cleared switch is written explicitly");
    assert.equal(calls["phoneProvider"], "x");
  }
});

test("U2 helper: countryRulesOf merges the panel's calls over the stored block", () => {
  const base: Doc = { country: "SE", currency: "SEK", calls: CALLS };
  const next = countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [50], driverBonus: { defaultLimit: 200, hardMax: 1000 }, calls: { on: false, mode: "in_app", callWindowAfterTripMin: 0, ringSeconds: 10, maxCallMin: 1, connectTimeoutSeconds: 10 } }, base);
  assert.deepEqual(next["calls"], { ...CALLS, on: false, callWindowAfterTripMin: 0, ringSeconds: 10, maxCallMin: 1, connectTimeoutSeconds: 10 });
  assert.notEqual(next["calls"], base["calls"], "a copy, not the stored object");
});
