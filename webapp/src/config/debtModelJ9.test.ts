import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeCountrySettings, countrySettingsIssues, countrySettingsLines, defaultCountrySettings, PRICING_FIELDS } from "./countrySettings.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { errorText } from "../live/format.ts";
import { ApiError } from "../api/httpClient.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import type { LiveClient } from "../live/session.ts";

/**
 * S5 J9 (contract v0.18.84 debtModel; owner Q-M1, Q-S5-1 "Both", Q-S5-3/4/5, 2026-11-13 14:22 / 14:32 / 14:54 / 14:59 /
 * 15:00 / 15:01, decisions/session-2026-11-06.md:1240-1250): the admin part of the debt model. Pricing › Tips & limits
 * gets "Max rider debt" (any amount, > 0; SE 300 kr, FR 30 €, TN 84 DT) and "Driver owes-limit" (switch + amount;
 * shipped OFF, TN 150 DT stored), both on the country standard only and always sent on its save (a field left out is
 * dropped). New refusals in words, the payout line paid_to_movera, the list of drivers who owe Movera with "Driver paid
 * Movera", the wallet kinds fee / debt_paid and a negative wallet shown as owed. sv / fr / en.
 */
// Loaded lazily so this file runs (and fails per case) on a base without the J9 modules.
const settings: Record<string, unknown> = await import("./countrySettings.ts");
const owing: Record<string, unknown> = await import("../live/owingDrivers.ts").catch(() => ({}));
const trip: Record<string, unknown> = await import("../live/tripLive.ts");
const payouts: Record<string, unknown> = await import("../live/payoutLines.ts").catch(() => ({}));
const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
type Debt = { maxRiderDebt?: number; driverOwesLimit?: { enabled: boolean; max: number | null } };
const debtOf = (value: unknown) => value as Debt;

registerDictionary("sv", sv);
registerDictionary("fr", fr);

test("J9: defaults are the contract's configDefaults (max rider debt SE 300 / FR 30 / TN 84; owes-limit OFF, TN 150 DT stored)", () => {
  for (const country of ["SE", "FR", "TN"] as const) {
    const minor = country === "TN" ? 1000 : 100;
    const value = debtOf(defaultCountrySettings(country));
    assert.equal(value.maxRiderDebt, C.configDefaults.maxRiderDebt[country].amountMinor / minor, `${country} max rider debt`);
    const limit = C.configDefaults.driverOwesLimit[country];
    assert.deepEqual(value.driverOwesLimit, { enabled: false, max: limit.max ? limit.max.amountMinor / minor : null }, `${country} owes-limit`);
  }
  assert.deepEqual(debtOf(defaultCountrySettings("TN")).driverOwesLimit, { enabled: false, max: 150 });
  assert.ok((PRICING_FIELDS as readonly string[]).includes("maxRiderDebt") && (PRICING_FIELDS as readonly string[]).includes("driverOwesLimit"), "Pricing saves both");
});

test("J9: max rider debt is any amount above 0 (no upper bound); 0 or less is refused before Save", () => {
  const big = completeCountrySettings("SE", { maxRiderDebt: 5_000_000 });
  assert.equal(debtOf(big).maxRiderDebt, 5_000_000);
  assert.deepEqual(countrySettingsIssues("SE", big), [], "no upper bound");
  const zero = { ...defaultCountrySettings("FR"), maxRiderDebt: 0 } as never;
  assert.equal(countrySettingsIssues("FR", zero).length, 1);
  const decimals = { ...defaultCountrySettings("SE"), maxRiderDebt: 10.555 } as never;
  assert.equal(countrySettingsIssues("SE", decimals).length, 1, "at most the currency's decimals");
});

test("J9: the owes-limit switched ON needs an amount above 0 (the server's 400 owes_limit_needs_amount); OFF may keep it or have none", () => {
  const base = defaultCountrySettings("SE");
  assert.deepEqual(countrySettingsIssues("SE", { ...base, driverOwesLimit: { enabled: false, max: null } } as never), []);
  assert.equal(countrySettingsIssues("SE", { ...base, driverOwesLimit: { enabled: true, max: null } } as never).length, 1);
  assert.equal(countrySettingsIssues("SE", { ...base, driverOwesLimit: { enabled: true, max: 0 } } as never).length, 1);
  assert.deepEqual(countrySettingsIssues("SE", { ...base, driverOwesLimit: { enabled: true, max: 1500 } } as never), []);
  const kept = completeCountrySettings("TN", { driverOwesLimit: { enabled: true, max: 200 } });
  assert.deepEqual(debtOf(kept).driverOwesLimit, { enabled: true, max: 200 });
  assert.deepEqual(debtOf(completeCountrySettings("TN", { driverOwesLimit: "x" })).driverOwesLimit, { enabled: false, max: 150 }, "bad = default");
});

test("J9: a change of either is listed before Save", () => {
  const before = defaultCountrySettings("TN");
  const after = { ...before, maxRiderDebt: 100, driverOwesLimit: { enabled: true, max: 150 } } as never;
  const lines = countrySettingsLines("TN", before, after);
  assert.equal(lines.length, 2, JSON.stringify(lines));
});

test("J9: country_rules carries maxRiderDebt and driverOwesLimit in the country's money; left out = not in the document", () => {
  const input = { tips: [1], raiseSteps: [2], driverBonus: { defaultLimit: 20, hardMax: 300 } };
  const doc = countryRulesOf("TN", "TND", { ...input, maxRiderDebt: 84, driverOwesLimit: { enabled: false, max: 150 } } as never, null);
  assert.deepEqual(doc["maxRiderDebt"], { amountMinor: 84_000, currency: "TND" });
  assert.deepEqual(doc["driverOwesLimit"], { enabled: false, max: { amountMinor: 150_000, currency: "TND" } });
  const none = countryRulesOf("SE", "SEK", { ...input, maxRiderDebt: 300, driverOwesLimit: { enabled: false, max: null } } as never, null);
  assert.deepEqual(none["driverOwesLimit"], { enabled: false, max: null });
  const zone = countryRulesOf("SE", "SEK", input, null);
  assert.equal(zone["maxRiderDebt"], undefined);
  assert.equal(zone["driverOwesLimit"], undefined);
});

test("J9: the standard's document reads back (missing or another currency = the default); a zone never sends them", () => {
  const of = settings["debtSettingsOfRules"] as ((document: unknown, country: "SE" | "FR" | "TN") => Debt) | undefined;
  assert.equal(typeof of, "function", "countrySettings.ts exports debtSettingsOfRules");
  assert.deepEqual(of!({ maxRiderDebt: { amountMinor: 50_000, currency: "SEK" }, driverOwesLimit: { enabled: true, max: { amountMinor: 200_000, currency: "SEK" } } }, "SE"), { maxRiderDebt: 500, driverOwesLimit: { enabled: true, max: 2000 } });
  assert.deepEqual(of!({ maxRiderDebt: { amountMinor: 50_000, currency: "EUR" } }, "SE"), {}, "another currency = the default");
  assert.deepEqual(of!({ driverOwesLimit: { enabled: false, max: null } }, "TN"), { driverOwesLimit: { enabled: false, max: null } });
  const source = readFileSync(new URL("../live/liveSettings.ts", import.meta.url), "utf8");
  assert.match(source, /standardKey\(market\.id\) \? \{[^}]*maxRiderDebt: next\.maxRiderDebt, driverOwesLimit: next\.driverOwesLimit/, "saved on the standard only, every time");
  assert.match(source, /debtSettingsOfRules\(/, "read back from the document");
});

test("J9: Tips & limits shows Max rider debt (no max) and the owes-limit switch + amount beside the wallet limit", () => {
  const panel = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /tr\("Max rider debt"\)/);
  assert.match(panel, /aria-label=\{tr\("Driver owes-limit on"\)\}/);
  assert.match(panel, /tr\("Over the limit the driver gets no cash trips; he can still go online\."\)/);
  assert.ok(panel.indexOf("Max rider debt") > panel.indexOf("Largest Add money to wallet at one time"), "beside walletCreditMax");
});

test("J9: the new refusals in words (sv / fr / en), with the amounts from details", () => {
  const conflict = (reason: string, details: string[] = []) => new ApiError(409, "x", { code: "conflict", reason, details });
  const bad = (reason: string) => new ApiError(400, "x", { code: "invalid_request", reason });
  for (const lang of ["en", "sv", "fr"] as const) {
    setLanguage(lang);
    const owes = errorText(conflict("driver_owes_movera", ["owed:180000 TND", "limit:150000 TND"]));
    assert.notEqual(owes, "x", `${lang} driver_owes_movera`);
    assert.match(owes, /180[.,\s\u202f\u00a0]?000/, `${lang} owed amount`);
    assert.match(owes, /150[.,\s\u202f\u00a0]?000/, `${lang} limit`);
    assert.match(errorText(conflict("rider_debt_above_max", ["debt:35000 SEK", "max:30000 SEK"])), /350/, `${lang} rider debt`);
    for (const reason of ["owes_limit_needs_amount", "paid_above_owed"]) assert.notEqual(errorText(bad(reason)), "x", `${lang} ${reason}`);
    assert.notEqual(errorText(conflict("owed_changed")), "x", `${lang} owed_changed`);
    assert.notEqual(errorText(conflict("fee_on_running_trip")), "x", "kept for an older server (Rule 21)");
  }
  setLanguage("sv");
  assert.equal(errorText(bad("owes_limit_needs_amount")), sv["Set an amount above 0 to switch the driver owes-limit on." as keyof typeof sv]);
  setLanguage("en");
});

test("J9: the payout line paid_to_movera is \"Paid to Movera\" (contract texts.paidMoveraLabel, sv / fr / en)", () => {
  const label = payouts["payoutLineLabel"] as ((code: string) => string) | undefined;
  assert.equal(typeof label, "function", "payoutLines.ts exports payoutLineLabel");
  for (const lang of ["en", "sv", "fr"] as const) {
    setLanguage(lang);
    assert.equal(label!("paid_to_movera"), C.debtModel.texts.paidMoveraLabel[lang], lang);
  }
  setLanguage("en");
});

test("J9: wallet kinds fee / debt_paid have labels (contract texts.walletFee / walletDebtPaid) and a negative balance shows as owed", () => {
  const kind = trip["walletKindLabel"] as ((kind: string) => string) | undefined;
  assert.equal(typeof kind, "function", "tripLive.ts exports walletKindLabel");
  for (const lang of ["en", "sv", "fr"] as const) {
    setLanguage(lang);
    assert.equal(kind!("fee"), C.debtModel.texts.walletFee[lang], `${lang} fee`);
    assert.equal(kind!("debt_paid"), C.debtModel.texts.walletDebtPaid[lang], `${lang} debt_paid`);
  }
  setLanguage("en");
  const walletText = trip["walletText"] as (balances: { amountMinor: number; currency: string }[], fallback: string) => string;
  assert.match(walletText([{ amountMinor: -5000, currency: "SEK" }], "SEK"), /^Owes 50/);
  assert.match(walletText([{ amountMinor: 5000, currency: "SEK" }], "SEK"), /^50/);
  assert.equal(en["Owes {0}" as keyof typeof en], "Owes {0}");
});

/** A server with drivers who owe Movera (GET /admin/drivers-owing) and POST paid-movera. */
function owingServer(opts: { stale?: boolean } = {}) {
  const reads: string[] = [];
  const posts: { path: string; body: unknown }[] = [];
  const row = (n: number) => ({ driverId: `D${n}`, driverName: `Driver ${n}`, zoneId: "Z001", country: "TN", owed: { amountMinor: 200_000 - n, currency: "TND" }, limit: null, overLimit: false });
  const client = {
    json: async (path: string) => {
      reads.push(path);
      const q = new URLSearchParams(path.split("?")[1] ?? "");
      const from = Number(q.get("cursor") ?? 0);
      const end = from + Number(q.get("limit"));
      return { items: Array.from({ length: Math.min(end, 70) - from }, (_, i) => row(from + i)), nextCursor: end < 70 ? String(end) : null, ...(q.get("cursor") ? {} : { total: 70 }) };
    },
    post: async (path: string, body: unknown) => {
      posts.push({ path, body });
      if (opts.stale) throw new ApiError(409, "changed", { code: "conflict", reason: "owed_changed", projection: { ...row(1), owed: { amountMinor: 120_000, currency: "TND" } } });
      return { ...row(1), owed: { amountMinor: 100_000, currency: "TND" } };
    },
  } as unknown as LiveClient;
  return { client, reads, posts };
}

test("J9: the owing list reads GET /admin/drivers-owing (50 a page, the zone filter, cursor; never total) in its own module", async () => {
  const read = owing["readOwingDrivers"] as ((client: LiveClient, params: [string, string][], cursor: string | null) => Promise<{ items: unknown[]; nextCursor: string | null; total?: number }>) | undefined;
  assert.equal(typeof read, "function", "owingDrivers.ts exports readOwingDrivers");
  const { client, reads } = owingServer();
  const first = await read!(client, [["zoneIds", "Z001"]], null);
  assert.equal(first.items.length, 50);
  assert.equal(first.total, 70);
  const second = await read!(client, [["zoneIds", "Z001"]], first.nextCursor);
  assert.equal(second.items.length, 20);
  assert.equal(second.nextCursor, null);
  for (const path of reads) {
    const q = new URLSearchParams(path.split("?")[1]);
    assert.ok(path.startsWith("/admin/drivers-owing?"), path);
    assert.equal(q.get("limit"), "50");
    assert.equal(q.get("zoneIds"), "Z001");
    assert.equal(q.has("total"), false, "not one of the total lists");
  }
  const api = readFileSync(new URL("../live/liveAdminApi.ts", import.meta.url), "utf8");
  assert.ok(!api.includes("drivers-owing") && !api.includes("paid-movera"), "liveAdminApi.ts does not grow (Rule 25)");
});

test("J9: Driver paid Movera posts { expectedOwed, amount, reason }; checks before the call; 409 owed_changed gives the fresh owed", async () => {
  const pay = owing["payMovera"] as ((client: LiveClient, row: unknown, amountMinor: number, reason: string) => Promise<{ ok: boolean; row: { owed: { amountMinor: number } } }>) | undefined;
  const problem = owing["paidMoveraProblem"] as ((owedMinor: number, amountMinor: number | null, reason: string) => string | null) | undefined;
  assert.equal(typeof pay, "function", "owingDrivers.ts exports payMovera");
  assert.equal(typeof problem, "function", "owingDrivers.ts exports paidMoveraProblem");
  assert.equal(problem!(200_000, 50_000, "Paid by bank"), null);
  assert.notEqual(problem!(200_000, 0, "Paid by bank"), null, "above 0");
  assert.notEqual(problem!(200_000, null, "Paid by bank"), null, "a number");
  assert.notEqual(problem!(200_000, 200_001, "Paid by bank"), null, "at most the owed");
  assert.notEqual(problem!(200_000, 1000, "  "), null, "a reason");
  assert.notEqual(problem!(200_000, 1000, "x".repeat(301)), null, "at most 300");
  const row = { driverId: "D1", owed: { amountMinor: 200_000, currency: "TND" }, limit: null, overLimit: false };
  const ok = owingServer();
  const done = await pay!(ok.client, row, 100_000, " Paid by Swish ");
  assert.deepEqual(ok.posts, [{ path: "/admin/drivers/D1/paid-movera", body: { expectedOwed: { amountMinor: 200_000, currency: "TND" }, amount: { amountMinor: 100_000, currency: "TND" }, reason: "Paid by Swish" } }]);
  assert.equal(done.ok, true);
  assert.equal(done.row.owed.amountMinor, 100_000);
  const stale = owingServer({ stale: true });
  const again = await pay!(stale.client, row, 100_000, "Paid by Swish");
  assert.equal(again.ok, false, "nothing written");
  assert.equal(again.row.owed.amountMinor, 120_000, "the fresh owed from the 409");
});

test("J9: the Drivers page has a lazy \"Drivers who owe Movera\" tab (finance.read), the new module stays out of the first load", () => {
  const page = readFileSync(new URL("../pages/DriversPage.tsx", import.meta.url), "utf8");
  assert.match(page, /lazy\(\(\) => import\("\.\.\/live\/LiveOwingDrivers"\)/);
  assert.match(page, /can\("finance\.read"\)/);
  const view = readFileSync(new URL("../live/LiveOwingDrivers.tsx", import.meta.url), "utf8");
  assert.match(view, /tr\("Driver paid Movera"\)/);
  assert.match(view, /listCountText\(/, "\"50 of N\"");
});
