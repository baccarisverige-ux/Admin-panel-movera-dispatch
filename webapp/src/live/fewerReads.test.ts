import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveAdminApi, RIDE_CHECK_ALERTS_LIST, RIDE_CHECKS_OF_TRIP_LIST } from "./liveAdminApi.ts";
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
