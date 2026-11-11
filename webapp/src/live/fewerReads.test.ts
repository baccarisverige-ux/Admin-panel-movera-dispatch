import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi, DUE_PAYOUTS_LIST, OPEN_TICKETS_LIST, RIDE_CHECK_ALERTS_LIST, RIDE_CHECKS_OF_TRIP_LIST } from "./liveAdminApi.ts";
import { keyMatches } from "./adminEvents.ts";
import type { LiveClient } from "./session.ts";

/** Audit A15 (N9, N10, N12, N15, N20, §1): the admin reads one small filtered page where it used to read every page. */
function fakeClient(answer: (path: string) => unknown = () => ({ items: [], nextCursor: null })) {
  const reads: string[] = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1", role: "super", scope: { zones: "all" } }),
    subscribe: () => () => undefined,
    json: async (path: string) => { reads.push(path); return answer(path); },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, reads };
}
const params = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");

test("C4 (N15): a trip's ride checks are read with ?tripId=, never the whole list", async () => {
  const { client, reads } = fakeClient();
  await createLiveAdminApi(client).list(`${RIDE_CHECKS_OF_TRIP_LIST}T1`, null);
  assert.deepEqual(reads.map((path) => [path.split("?")[0], params(path).get("tripId")]), [["/admin/ride-checks", "T1"]]);
});

test("C4 (N15): alert checks use the answer filter, then both sides of only those trips", async () => {
  const row = (tripId: string, answer: string) => ({ tripId, checkId: "srv_1", side: "rider", trigger: "long_stop", answer, zoneId: "z1", shownAt: "2026-11-11T10:00:00Z" });
  const { client, reads } = fakeClient((path) => {
    const q = params(path);
    if (q.get("answer") === "need_help") return { items: [row("T1", "need_help")], nextCursor: null };
    if (q.get("answer") === "waiting") return { items: [row("T2", "waiting")], nextCursor: null };
    if (q.get("tripId")) return { items: [row(q.get("tripId")!, "ok")], nextCursor: null };
    return { items: [], nextCursor: null };
  });
  await createLiveAdminApi(client).list(RIDE_CHECK_ALERTS_LIST, null);
  const checks = reads.filter((path) => path.startsWith("/admin/ride-checks"));
  assert.equal(checks.every((path) => params(path).get("answer") || params(path).get("tripId")), true, "no unfiltered read");
  assert.deepEqual(checks.map((path) => params(path).get("answer")).filter(Boolean).sort(), ["need_help", "no_answer", "waiting"]);
  assert.ok(params(checks.find((path) => params(path).get("answer") === "no_answer")!).get("from"), "no_answer only for recent checks");
  assert.deepEqual(checks.map((path) => params(path).get("tripId")).filter(Boolean).sort(), ["T1", "T2"]);
});

test("C5 (N9): the trip page's audit is one page of 20 for that trip (GET /admin/audit?targetId=&limit=20)", async () => {
  const { client, reads } = fakeClient();
  await createLiveAdminApi(client).audit({ targetId: "T1", limit: 20 });
  assert.equal(reads.length, 1);
  assert.equal(reads[0]!.split("?")[0], "/admin/audit");
  assert.equal(params(reads[0]!).get("targetId"), "T1");
  assert.equal(params(reads[0]!).get("limit"), "20");
  assert.equal(params(reads[0]!).get("cursor"), null);
});

test("C6 (§1): the Dashboard audit card reads one page of 20 (GET /admin/audit?limit=20)", async () => {
  const { client, reads } = fakeClient(() => ({ items: [], nextCursor: "more" }));
  await createLiveAdminApi(client).audit({ limit: 20 });
  assert.deepEqual(reads, ["/admin/audit?limit=20"], "one page even when the server has more");
});

test("C7 (N12): the Dashboard counts read only open tickets and unpaid payouts (server status filter)", async () => {
  const { client, reads } = fakeClient();
  const api = createLiveAdminApi(client);
  await api.list(OPEN_TICKETS_LIST, null);
  await api.list(DUE_PAYOUTS_LIST, null);
  const tickets = reads.filter((path) => path.startsWith("/admin/tickets?"));
  const payouts = reads.filter((path) => path.startsWith("/admin/payouts?"));
  assert.deepEqual(tickets.map((path) => params(path).getAll("status")), [["open"]]);
  assert.deepEqual(payouts.map((path) => params(path).getAll("status").sort()), [["failed", "held", "pending", "pending_approval"]]);
});

test("C7 (N12): ticket.changed refreshes the open-ticket count", () => {
  assert.equal(keyMatches({ type: "ticket.changed" }, ["records", OPEN_TICKETS_LIST, "{}", "a1"]), true);
});

test("C8 (N10): a rider beyond the riders' pages is looked for once, not on every refresh of his trips", async () => {
  const { client, reads } = fakeClient((path) => (path.startsWith("/admin/trips?") ? { items: [{ tripId: "T9", riderId: "R_old", status: "completed", fare: { amountMinor: 0, currency: "SEK" }, zoneId: "z1", createdAt: "2026-01-01T00:00:00Z" }], nextCursor: null } : { items: [], nextCursor: null }));
  const api = createLiveAdminApi(client);
  await api.list("tripsOfRider:R_old", null);
  await api.list("tripsOfRider:R_old", null);
  await api.list("tripsOfRider:R_old", null);
  assert.equal(reads.filter((path) => path.startsWith("/admin/riders?")).length, 1);
  assert.equal(reads.filter((path) => path.startsWith("/admin/trips?")).length, 3);
});

test("C11 (N20): ridersOnline and zoneSupply at the same time share one GET /admin/live/drivers?limit=1", async () => {
  const { client, reads } = fakeClient((path) => (path.startsWith("/admin/live/drivers") ? { items: [], nextCursor: null, zones: [] } : { items: [], nextCursor: null }));
  const api = createLiveAdminApi(client);
  await Promise.all([api.list("ridersOnline", null, new AbortController().signal), api.list("zoneSupply", null, new AbortController().signal)]);
  assert.equal(reads.filter((path) => path.startsWith("/admin/live/drivers")).length, 1);
  await api.list("zoneSupply", null);
  assert.equal(reads.filter((path) => path.startsWith("/admin/live/drivers")).length, 2, "a later read is sent again");
});
