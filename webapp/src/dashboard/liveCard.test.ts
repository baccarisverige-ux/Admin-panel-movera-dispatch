import assert from "node:assert/strict";
import test from "node:test";
import { createLiveAdminApi } from "../live/liveAdminApi.ts";
import { setLiveData } from "../live/realData.ts";
import type { LiveClient } from "../live/session.ts";
import { liveDrivers } from "./live.ts";
import { LIVE_CARD_LIST, liveCardRows, onlineTileValue } from "./liveCard.ts";

/**
 * Rules A8/A10 (plan/FIX-PLAN-RERUN-2026-11-05.md "A10: proven cause", contract v0.18.34 §65): the Dashboard's live
 * card, map and "Drivers online now" tile come from GET /admin/live/drivers pages alone; the driver list only adds
 * details; a failed live read is an error, never 0; the old country's calls are cancelled.
 */

type Handler = (query: URLSearchParams) => unknown;
const id = (n: number) => `drv_${String(n).padStart(5, "0")}`;
const driverRow = (n: number) => ({ driverId: id(n), firstName: `Name${n}`, lastName: "L", accountStatus: "active", onlineStatus: "offline", zoneIds: ["Z001"], categoryIds: [], documents: [], version: 1 });
const liveRow = (n: number) => ({ driverId: id(n), firstName: `Name${n}`, onlineStatus: "online", stale: false, location: { lat: 59.3 + n / 1e5, lng: 18, measuredAt: "2026-11-05T15:40:00Z" }, lastFixAt: "2026-11-05T15:40:01Z", zoneId: "Z001" });

/** A server page of `rows` that honours limit / cursor like the real server. */
function pageOf(rows: Array<{ driverId: string }>, query: URLSearchParams, extra: Record<string, unknown> = {}) {
  const limit = query.get("limit") ? Number(query.get("limit")) : rows.length;
  const after = query.get("cursor");
  const rest = after ? rows.filter((row) => row.driverId > after) : rows;
  const items = rest.slice(0, limit);
  const nextCursor = rest.length > limit ? items[items.length - 1]!.driverId : null;
  return { items, nextCursor, total: rows.length, ...extra };
}

function fakeClient(handlers: { drivers: Handler; live: Handler }) {
  const calls: Array<{ path: string; signal: AbortSignal | undefined }> = [];
  const client = {
    baseUrl: "https://api.example.test",
    state: () => ({ accessToken: "a" }),
    admin: () => ({ adminId: "adm_1" }),
    subscribe: () => () => undefined,
    json: async (path: string, init: { signal?: AbortSignal } = {}) => {
      calls.push({ path, signal: init.signal });
      const [base, search = ""] = path.split("?");
      const query = new URLSearchParams(search);
      if (base === "/admin/drivers") return handlers.drivers(query);
      if (base === "/admin/live/drivers") return handlers.live(query);
      return { items: [], nextCursor: null };
    },
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  } as unknown as LiveClient;
  return { client, calls };
}

const fail = (): never => {
  throw new Error("Failed to fetch");
};
const liveAnswer = (rows: ReturnType<typeof liveRow>[]) => (query: URLSearchParams) => pageOf(rows, query, { staleAfterSeconds: 120, serverTime: "2026-11-05T15:41:00Z" });

async function cardCount(api: ReturnType<typeof createLiveAdminApi>, scope?: string, signal?: AbortSignal) {
  setLiveData(true);
  const list = api.list as (name: string, scope?: string, signal?: AbortSignal) => ReturnType<typeof api.list>;
  const rows = liveCardRows(await list(LIVE_CARD_LIST, scope, signal));
  return liveDrivers(rows, [], [], [], 0).length;
}

test("A10 proven: the driver list fails but /admin/live/drivers answers: the card still shows every online driver", async () => {
  const online = [1, 2, 3].map(liveRow);
  const { client } = fakeClient({ drivers: fail, live: liveAnswer(online) });
  assert.equal(await cardCount(createLiveAdminApi(client)), 3);
});

test("A10 proven: /admin/live/drivers fails: the card read is an error (not a list of offline drivers) and the tile says so, never 0", async () => {
  const { client } = fakeClient({ drivers: (query) => pageOf([1, 2, 3].map(driverRow), query), live: fail });
  await assert.rejects(cardCount(createLiveAdminApi(client)));
  assert.equal(onlineTileValue({ isLoading: false, error: new Error("Failed to fetch") }, 0, String), "Could not load, retrying");
  assert.equal(onlineTileValue({ isLoading: true, error: null }, 0, String), "…");
  assert.equal(onlineTileValue({ isLoading: false, error: null }, 7, String), "7");
});

test("A8 proven: online drivers past row 50 of the driver list are shown (rows 51-60 online → 10)", async () => {
  const { client } = fakeClient({ drivers: (query) => pageOf(Array.from({ length: 60 }, (_, i) => driverRow(i + 1)), query), live: liveAnswer(Array.from({ length: 10 }, (_, i) => liveRow(i + 51))) });
  assert.equal(await cardCount(createLiveAdminApi(client)), 10);
});

test("A8 + rule 33: 1,200 online drivers (more than one live page) are all on the card", async () => {
  const online = Array.from({ length: 1200 }, (_, i) => liveRow(i + 1));
  const { client } = fakeClient({ drivers: (query) => pageOf(online.map((_, i) => driverRow(i + 1)), query), live: liveAnswer(online) });
  assert.equal(await cardCount(createLiveAdminApi(client)), 1200);
});

test("A10: the card's calls carry the query's AbortSignal, so a country change cancels the old country's calls", async () => {
  const { client, calls } = fakeClient({ drivers: (query) => pageOf([driverRow(1)], query), live: liveAnswer([liveRow(1)]) });
  const controller = new AbortController();
  await cardCount(createLiveAdminApi(client), "Z001", controller.signal);
  assert.ok(calls.length > 0);
  for (const call of calls) assert.equal(call.signal, controller.signal, `${call.path} is not cancellable`);
});

test("A8: the driver list only adds details (full name) when loaded; the live facts and who is shown stay the live answer's", async () => {
  const { client } = fakeClient({ drivers: (query) => pageOf([driverRow(1)], query), live: liveAnswer([liveRow(1), liveRow(2)]) });
  const api = createLiveAdminApi(client);
  const presence = await api.list(LIVE_CARD_LIST, null);
  const details = await api.list("drivers", null);
  const rows = liveCardRows(presence, details);
  assert.deepEqual(rows.map((row) => [row.id, row.name, row.liveDriver?.onlineStatus]), [[id(1), "Name1 L", "online"], [id(2), "Name2", "online"]]);
  assert.deepEqual(liveCardRows(presence, undefined).map((row) => row.id), [id(1), id(2)]);
});
