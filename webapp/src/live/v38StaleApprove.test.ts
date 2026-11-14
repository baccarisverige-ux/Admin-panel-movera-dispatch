import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi } from "./liveAdminApi.ts";
import type { LiveClient } from "./session.ts";
import { ApiError } from "../api/httpClient.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { approveRunValue, freshRunCard } from "./payoutRunGuard.ts";

/**
 * BQ-V38 stale-approve guard (contract v0.18.102, contract.json#payoutMode.approveGuard; owner item 105 / Q-M8
 * "Refresh, approve again (Rec.)", Rules decisions/session-2026-11-06.md:1119): Approve run sends the count and the total
 * of the run the admin sees; when the server answers 409 run_changed, the admin says why with the server's fresh count and
 * total (in the admin's language), keeps that card, and the next Approve sends the fresh numbers.
 */

const base = { before: "", after: "" };
function fakeClient(answer: (body: unknown) => unknown) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async () => ({ items: [], nextCursor: null }),
    post: async (path: string, body: unknown) => { posts.push({ path, body }); return answer(body); },
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, posts };
}
const changed = (card: unknown) => () => { throw new ApiError(409, "The run changed.", { code: "conflict", reason: "run_changed", projection: card, requestId: "req_1", retryable: false }); };

test("V38 SEK: Approve run sends the count and total the admin saw; without them nothing is sent", async () => {
  const { client, posts } = fakeClient(() => ({ country: "SE", periodEnd: "2026-11-02T07:00:00.000Z", approved: 1, total: [{ amountMinor: 10_000, currency: "SEK" }] }));
  const api = createLiveAdminApi(client);
  const run = { country: "SE", periodEnd: "2026-11-02T07:00:00.000Z" };
  await assert.rejects(api.command({ ...base, action: "admin.payout.approveRun", targetId: "SE", reason: "Bank file checked", value: run }));
  assert.equal(posts.length, 0, "no blind approve");
  const value = approveRunValue(run, [{ amount: { amountMinor: 10_000, currency: "SEK" } }], null);
  await api.command({ ...base, action: "admin.payout.approveRun", targetId: "SE", reason: "Bank file checked", value });
  assert.deepEqual(posts, [{ path: "/admin/payouts/runs/approve", body: { ...run, expectedCount: 1, expectedTotal: [{ amountMinor: 10_000, currency: "SEK" }], reason: "Bank file checked" } }]);
});

test("V38 SEK: a stale total gets 409 run_changed: the admin shows why with the fresh count and total (sv), and the next Approve sends the fresh card", async () => {
  registerDictionary("sv", sv);
  setLanguage("sv");
  try {
    const run = { country: "SE", periodEnd: "2026-11-02T07:00:00.000Z" };
    const card = { ...run, count: 2, total: [{ amountMinor: 15_000, currency: "SEK" }] };
    const { client, posts } = fakeClient(changed(card));
    const api = createLiveAdminApi(client);
    const value = approveRunValue(run, [{ amount: { amountMinor: 10_000, currency: "SEK" } }], null);
    const error = await api.command({ ...base, action: "admin.payout.approveRun", targetId: "SE", reason: "Bank file checked", value }).then(() => null, (e: unknown) => e);
    assert.ok(error instanceof ApiError, "refused");
    assert.equal(error.status, 409);
    assert.equal(error.reason, "run_changed");
    assert.equal(error.message, "Körningen ändrades medan du tittade. Utbetalningar nu: 2. Att betala nu: 150,00 kr. Den laddades om; kontrollera och godkänn igen.");
    assert.equal(posts.length, 1);
    // The card the admin was just shown is what the next Approve sends (the list may still be the old one).
    const fresh = freshRunCard(error);
    assert.deepEqual(fresh, card);
    assert.deepEqual(approveRunValue(run, [{ amount: { amountMinor: 10_000, currency: "SEK" } }], fresh), { ...run, expectedCount: 2, expectedTotal: [{ amountMinor: 15_000, currency: "SEK" }] });
    // A card of another run is never used.
    assert.deepEqual(approveRunValue({ ...run, periodEnd: "2026-11-09T07:00:00.000Z" }, [{ amount: { amountMinor: 700, currency: "SEK" } }], fresh), { ...run, periodEnd: "2026-11-09T07:00:00.000Z", expectedCount: 1, expectedTotal: [{ amountMinor: 700, currency: "SEK" }] });
  } finally {
    setLanguage("en");
  }
});

test("V38 TND: the fresh total keeps the dinar's 3 decimals (fr), kr and DT are never added", async () => {
  registerDictionary("fr", fr);
  setLanguage("fr");
  try {
    const run = { country: "TN", periodEnd: "2026-11-02T07:00:00.000Z" };
    const card = { ...run, count: 1, total: [{ amountMinor: 12_350, currency: "TND" }] };
    const { client } = fakeClient(changed(card));
    const api = createLiveAdminApi(client);
    const value = approveRunValue(run, [{ amount: { amountMinor: 12_300, currency: "TND" } }], null);
    assert.deepEqual(value, { ...run, expectedCount: 1, expectedTotal: [{ amountMinor: 12_300, currency: "TND" }] });
    const error = await api.command({ ...base, action: "admin.payout.approveRun", targetId: "TN", reason: "Vérifié", value }).then(() => null, (e: unknown) => e);
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, "Le lot a changé pendant que vous le regardiez. Versements maintenant : 1. À payer maintenant : 12.350 DT. Il a été rechargé ; vérifiez et approuvez à nouveau.");
    assert.deepEqual(freshRunCard(error), card);
    // Two currencies stay two lines of the total.
    assert.deepEqual(approveRunValue(run, [{ amount: { amountMinor: 12_300, currency: "TND" } }, { amount: { amountMinor: 500, currency: "EUR" } }, { amount: { amountMinor: 50, currency: "TND" } }], null).expectedTotal, [{ amountMinor: 12_350, currency: "TND" }, { amountMinor: 500, currency: "EUR" }]);
  } finally {
    setLanguage("en");
  }
});

test("V38: any other refusal is not a fresh card", () => {
  assert.equal(freshRunCard(new ApiError(409, "x", { code: "invalid_transition", reason: "nothing_to_approve" })), null);
  assert.equal(freshRunCard(new Error("x")), null);
});
