/**
 * Contract 0.18.82 sync, S5 J4a (movera-contracts v0.18.82 #124, contract.json#moneyBase.versionGuard; owner Sitting 3
 * item 106 "refuse a second click", decisions/session-2026-11-06.md; Q-S5-6 re-confirmed 2026-11-13: Tunisia tip max
 * 30 DT, driver pay change max 100 DT, it limits the change). "Add money to wallet" sends the rider's version and
 * "Change the driver's pay" the trip's version; a second click (same version) gets 409 version_mismatch: the page
 * reloads and says so; the button is off while a request is sending. Rule 36: written before the code.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ApiError } from "../api/httpClient.ts";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { DRIVER_PAY_CHANGE_MAX, TIP_CUSTOM_MAX } from "../config/countrySettings.ts";
import { createLiveAdminApi } from "../live/liveAdminApi.ts";
import { driverPayBody, singleFlight } from "../live/moneyGuard.ts";
import type { LiveClient } from "../live/session.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const STALE = "Someone else changed this record. It was reloaded; check it and try again.";
type Money = { amountMinor: number; currency: string };
const DIGITS: Record<string, number> = { SEK: 100, EUR: 100, TND: 1000 };
const major = (money: Money) => money.amountMinor / DIGITS[money.currency]!;

test("the admin pins the contract it carries (0.18.82)", () => {
  assert.equal(C.version, "0.18.82");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("TN-1: the country defaults are the contract's (TN driver pay change 100 DT, typed tip 30 DT; SE/FR unchanged)", () => {
  for (const country of ["SE", "FR", "TN"] as const) {
    assert.equal(DRIVER_PAY_CHANGE_MAX[country], major(C.configDefaults.driverPayChangeMax[country]), `driverPayChangeMax ${country}`);
    assert.equal(TIP_CUSTOM_MAX[country], major(C.configDefaults.tipRules.customMax[country]), `tip customMax ${country}`);
  }
  assert.equal(DRIVER_PAY_CHANGE_MAX.TN, 100);
  assert.equal(TIP_CUSTOM_MAX.TN, 30);
  const fixture = JSON.parse(readFileSync(new URL("../config/__fixtures__/rider_app_config.TN-TC.json", import.meta.url), "utf8"));
  assert.deepEqual(fixture.tipRules.customMax, { amountMinor: 30_000, currency: "TND" });
});

function fakeClient(answer: (path: string, body: unknown) => unknown, riders: unknown[] = []) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => ({ items: riders, nextCursor: null }),
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return answer(path, body); },
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, posts };
}
const base = { before: "", after: "" };
const RIDER = { riderId: "rdr_1", firstName: "Ida", phone: "+46700000001", status: "active", outstanding: null };

for (const amount of [{ amountMinor: 5_000, currency: "SEK" }, { amountMinor: 5_000, currency: "EUR" }, { amountMinor: 5_000, currency: "TND" }]) {
  test(`J4a: Add money to wallet sends the rider version the page shows (${amount.currency})`, async () => {
    const { client, posts } = fakeClient(() => ({ ...RIDER, version: 5, wallet: amount }));
    const api = createLiveAdminApi(client);
    await api.command({ ...base, action: "admin.rider.walletCredit", targetId: "rdr_1", reason: "Long wait", value: { expectedVersion: 4, amount } });
    assert.deepEqual(posts, [{ path: "/admin/riders/rdr_1/wallet-credit", body: { expectedVersion: 4, amount, reason: "Long wait" } }]);
  });
}

test("J4a: without a version from the page, the rider's version is read first (never sent without one)", async () => {
  const amount = { amountMinor: 5_000, currency: "SEK" };
  const { client, posts } = fakeClient(() => ({ ...RIDER, version: 8 }), [{ ...RIDER, version: 7 }]);
  const api = createLiveAdminApi(client);
  await api.command({ ...base, action: "admin.rider.walletCredit", targetId: "rdr_1", reason: "Goodwill", value: { amount } });
  assert.deepEqual(posts.map((p) => (p.body as { expectedVersion?: number }).expectedVersion), [7]);
});

test("J4a: a second click (409 version_mismatch) says the record was reloaded, in sv / fr / en", async () => {
  const amount = { amountMinor: 5_000, currency: "TND" };
  let stale = true;
  const { client, posts } = fakeClient(() => {
    if (!stale) return { ...RIDER, version: 6, wallet: amount };
    stale = false;
    throw new ApiError(409, "The rider changed since you last saw them.", { code: "version_mismatch", projection: { ...RIDER, version: 5, wallet: amount } });
  });
  const api = createLiveAdminApi(client);
  await assert.rejects(api.command({ ...base, action: "admin.rider.walletCredit", targetId: "rdr_1", reason: "Long wait", value: { expectedVersion: 4, amount } }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "version_mismatch");
    assert.equal(error.message, STALE);
    return true;
  });
  // The fresh rider from the 409 is kept: the next click (no page version yet) carries version 5, not the stale 4.
  await api.command({ ...base, action: "admin.rider.walletCredit", targetId: "rdr_1", reason: "Long wait", value: { amount } });
  assert.deepEqual(posts.map((p) => (p.body as { expectedVersion?: number }).expectedVersion), [4, 5]);
  for (const [lang, dictionary] of [["en", en], ["fr", fr], ["sv", sv]] as const) {
    assert.ok((dictionary as Record<string, string>)[STALE], `${lang} has the reload text`);
  }
});

test("J4a: Change the driver's pay sends the trip version the page shows (SEK, EUR, TND 3 decimals)", () => {
  assert.deepEqual(driverPayBody({ version: 3 }, 10_000, "SEK", " Long wait "), { expectedVersion: 3, change: { amountMinor: 10_000, currency: "SEK" }, reason: "Long wait" });
  assert.deepEqual(driverPayBody({ version: 9 }, -1_000, "EUR", "Wrong waiting"), { expectedVersion: 9, change: { amountMinor: -1_000, currency: "EUR" }, reason: "Wrong waiting" });
  assert.deepEqual(driverPayBody({ version: 2 }, 5_000, "TND", "Attente"), { expectedVersion: 2, change: { amountMinor: 5_000, currency: "TND" }, reason: "Attente" });
});

test("J4a: a money button sends one request at a time (a double click while sending sends nothing more)", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const once = singleFlight();
  const first = once(async () => { calls += 1; await gate; });
  const second = once(async () => { calls += 1; });
  assert.equal(once.busy(), true);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(once.busy(), false);
  await once(async () => { calls += 1; });
  assert.equal(calls, 2, "after the answer the button works again");
});
