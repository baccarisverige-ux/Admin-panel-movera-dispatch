import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countryRulesOf, readDraft, savePublish, type ConfigHttp, type Doc } from "./configDocs.ts";
import { createLiveSettings } from "./liveSettings.ts";
import { payoutSettingsOf } from "./payoutSettings.ts";

/**
 * F1 (Rules audits/impact/f1-tips-save-payout-mode.md, MONEY): a country's payout mode and payout schedule
 * (contract.json#payoutMode, payouts.schedule; Finance › Payouts settings) live in the SAME document as Tips & limits:
 * the country Standard's country_rules. The Tips & limits Save button ("admin.pricing.saveCountry" → saveCountries →
 * countryRulesOf → savePublish) rebuilds that document from a fixed list and the server stores what it is sent
 * (movera-server src/config/service.ts putDraft: "replace the draft"), so the two payout keys are dropped: a country on
 * MANUAL payouts silently goes back to AUTOMATIC with the default schedule (server src/admin/payouts.ts :285-286 reads
 * them from the live document; missing = automatic, weekly Monday 08:00).
 * These tests run the real save path against a server that stores what it is given, as the real one does.
 */
const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/config/${name}.json`, import.meta.url), "utf8")) as Doc;
type Row = { draftVersion: number; liveVersion: number; draft: Doc; live: Doc | null };
type Call = { method: string; path: string; body?: unknown };
const refuse = (status: number, reason: string) => Object.assign(new Error(reason), { status, reason });

/** The config documents in memory: PUT replaces the draft, publish makes the draft live (no merge), as the server. */
function server(seed: Record<string, { liveVersion: number; document: Doc }>) {
  const rows = new Map<string, Row>(Object.entries(seed).map(([key, item]) => [key, { draftVersion: item.liveVersion + 1, liveVersion: item.liveVersion, draft: item.document, live: item.document }]));
  const calls: Call[] = [];
  const keyOf = (doc: string, from: { zoneId?: string | null; country?: string | null }) => `${doc}:${from.zoneId ?? `standard-${from.country}`}`;
  const http: ConfigHttp = {
    json: async <T,>(path: string) => {
      calls.push({ method: "GET", path });
      const url = new URL(`http://x${path}`);
      const [, , , doc, tail] = url.pathname.split("/");
      if (!url.pathname.startsWith("/admin/config/") || tail) throw refuse(404, "not_found");
      const zoneId = url.searchParams.get("zoneId");
      const row = rows.get(keyOf(doc!, { zoneId, country: url.searchParams.get("country") }));
      if (row) return { version: row.draftVersion, liveVersion: row.liveVersion, ...(zoneId ? { usesStandard: false } : {}), document: structuredClone(row.draft) } as T;
      const standard = zoneId ? rows.get(`${doc}:standard-SE`) : undefined;
      if (standard?.live) return { version: 1, liveVersion: 0, usesStandard: true, document: structuredClone(standard.live) } as T;
      throw refuse(404, "config_not_found");
    },
    put: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "PUT", path, body });
      const input = body as { expectedVersion: number; zoneId?: string; country?: string; document: Doc };
      const key = keyOf(path.split("/")[3]!, input);
      const row = rows.get(key) ?? { draftVersion: 1, liveVersion: 0, draft: {}, live: null };
      if (row.draftVersion !== input.expectedVersion) throw refuse(409, "version_mismatch");
      rows.set(key, { ...row, draftVersion: row.draftVersion + 1, draft: structuredClone(input.document) });
      return { version: row.draftVersion + 1 } as T;
    },
    post: async <T,>(path: string, body: unknown) => {
      calls.push({ method: "POST", path, body });
      const [, , , doc, action] = path.split("/");
      const input = body as { expectedVersion: number; zoneId?: string; country?: string };
      const row = rows.get(keyOf(doc!, input));
      if (action !== "publish" || !row) throw refuse(404, "not_found");
      if (row.draftVersion !== input.expectedVersion) throw refuse(409, "draft_changed");
      row.liveVersion += 1;
      row.live = { ...row.draft, version: row.liveVersion };
      row.draft = row.live;
      row.draftVersion += 1;
      return { version: row.liveVersion } as T;
    },
  };
  return { http, calls, live: (key: string) => rows.get(key)?.live ?? null };
}

type Book = { draftRev: number; countries: Record<string, unknown>; zones: Record<string, { tips: Array<{ id?: string; amount: number; enabled?: boolean }> }> };
const MANUAL = { payoutMode: "manual", payoutSchedule: { frequency: "every_2_weeks", day: "thursday", time: "14:30" } } as const;

async function open(payout: Doc) {
  const rules = { ...countryRulesOf("SE", "SEK", { tips: [10, 20, 30], raiseSteps: [50, 100], driverBonus: { defaultLimit: 200, hardMax: 1000 } }, null), ...payout };
  const fake = server({
    "country_rules:standard-SE": { liveVersion: 1, document: rules },
    "rider_app_config:standard-SE": { liveVersion: 8, document: sample("rider_app_config") },
  });
  const settings = createLiveSettings(fake.http, () => "2026-11-16T05:18:42Z");
  const countries = (await settings.readSlice("countrySettings", { draftRev: 0, countries: {} })) as Book;
  const zones = (await settings.readSlice("countrySettingsZones", {})) as Book["zones"];
  fake.calls.length = 0;
  return { fake, settings, book: { ...countries, zones } };
}

/** What the Tips & limits panel sends when the admin changes one tip amount on the Standard and presses Save. */
async function saveTips(amount: number, payout: Doc) {
  const { fake, settings, book } = await open(payout);
  const shown = { ...book.zones["standard-SE"]!, tips: [{ id: "t1", amount, enabled: true }] };
  const value: Book = { ...book, draftRev: book.draftRev + 1, zones: { ...book.zones, "standard-SE": shown } };
  await settings.command("admin.pricing.saveCountry", { targetId: "SE tips and limits", value, scope: "standard-SE" });
  const put = fake.calls.find((c) => c.method === "PUT" && c.path.endsWith("/country_rules"));
  assert.ok(put, "the Save wrote the Standard's country_rules");
  assert.ok(fake.calls.some((c) => c.method === "POST" && c.path.endsWith("/country_rules/publish")), "and published it (the Save is live at once)");
  return { fake, sent: (put.body as { document: Doc }).document, live: fake.live("country_rules:standard-SE")! };
}

test("F1 money: a Tips & limits Save on a MANUAL country's Standard keeps the payout mode manual", async () => {
  const { sent, live } = await saveTips(40, MANUAL);
  assert.equal((live["tips"] as Array<{ amount: { amountMinor: number } | number }>).length, 1, "the tip change itself is live");
  assert.equal(sent["payoutMode"], "manual", "the document the Save sends still says manual");
  assert.equal(live["payoutMode"], "manual", "the live document still says manual: the payout job (server payouts.ts :286) waits for an admin");
  assert.equal(payoutSettingsOf(live).mode, "manual", "Finance › Payouts settings still shows Manual");
});

test("F1 money: a Tips & limits Save on a Standard keeps the country's payout schedule", async () => {
  const { sent, live } = await saveTips(40, MANUAL);
  assert.deepEqual(sent["payoutSchedule"], MANUAL.payoutSchedule, "the document the Save sends keeps the schedule");
  assert.deepEqual(live["payoutSchedule"], MANUAL.payoutSchedule, "the live document keeps every 2 weeks, Thursday 14:30");
  assert.deepEqual(payoutSettingsOf(live).schedule, MANUAL.payoutSchedule);
});

test("F1 money: the same with only a schedule stored (automatic country, own day and time)", async () => {
  const { live } = await saveTips(40, { payoutSchedule: { frequency: "weekly", day: "friday", time: "10:00" } });
  assert.deepEqual(live["payoutSchedule"], { frequency: "weekly", day: "friday", time: "10:00" });
  assert.equal("payoutMode" in live, false, "no mode is invented where none was stored");
});

test("F1 guard: the other way round already keeps (a Payout settings save keeps Tips & limits)", async () => {
  // liveAdminApi.ts "admin.payout.settings": the stored document with the two payout keys set (spread, nothing dropped).
  const { fake } = await open({});
  const draft = await readDraft(fake.http, "country_rules", "standard-SE");
  await savePublish(fake.http, "country_rules", "standard-SE", draft, { ...(draft?.document ?? {}), country: "SE", ...MANUAL });
  const live = fake.live("country_rules:standard-SE")!;
  assert.equal(live["payoutMode"], "manual");
  assert.equal((live["tips"] as unknown[]).length, 3);
  assert.ok(live["driverBonus"]);
});

test("F1 helper: countryRulesOf carries payoutMode and payoutSchedule over from the stored document", () => {
  const base: Doc = { version: 4, publishedAt: "2026-11-10T08:00:00.000Z", country: "SE", currency: "SEK", ...MANUAL };
  const next = countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [50], driverBonus: { defaultLimit: 200, hardMax: 1000 } }, base);
  assert.equal(next["payoutMode"], "manual");
  assert.deepEqual(next["payoutSchedule"], MANUAL.payoutSchedule);
});
