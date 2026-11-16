import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "./engine.ts";
import { alertsFromServer, emptyAlertBook, openAlerts, type FoundAlert } from "./engine.ts";

/**
 * Q131 (owner W2 answer "Yes, newest first (Rec.)", 2026-11-15; Rules plan/S7-W2-RECHECK-2026-11-15.md row 1,
 * decisions/session-2026-11-06.md "Sitting W2"): the alert list shows critical first, then the NEWEST first inside each
 * level, with pages; green (solved) alerts stay. Safety kinds (sos, car_lost, ride_check, sos_slow) stay on top inside
 * a level, as the server orders the book (alert cap, server 1865554: open before solved, safety first, newest first).
 */
const now = Date.parse("2026-11-16T12:00:00Z");
const at = (min: number) => new Date(now - min * 60_000).toISOString();
function found(id: string, kind: FoundAlert["kind"], level: FoundAlert["level"], sinceMin: number, extra: Partial<FoundAlert> = {}): FoundAlert {
  return { alertId: id, kind, level, title: id, zoneId: "Z001", since: at(sinceMin), state: "open", ...extra } as FoundAlert;
}
const order = (rows: FoundAlert[]) => openAlerts(alertsFromServer(rows, [{ id: "Z001" }]), emptyAlertBook(), now, () => null).map((a) => a.id);

test("Q131: a new SOS shows above the older ones of the same level", () => {
  const ids = order([found("sos:old", "sos", "critical", 90, { ref: { incidentId: "I1" } }), found("sos:mid", "sos", "critical", 30, { ref: { incidentId: "I2" } }), found("sos:new", "sos", "critical", 1, { ref: { incidentId: "I3" } })]);
  assert.deepEqual(ids, ["sos:new", "sos:mid", "sos:old"]);
});

test("Q131: newest first inside a level, critical before important before info", () => {
  const ids = order([found("info:new", "ticket_open", "info", 1), found("imp:old", "long_wait", "important", 60), found("crit:old", "no_driver", "critical", 120), found("imp:new", "rider_cancels", "important", 2), found("crit:new", "few_drivers", "critical", 5)]);
  assert.deepEqual(ids, ["crit:new", "crit:old", "imp:new", "imp:old", "info:new"]);
});

test("Q131: safety kinds first inside a level, even when another alert is newer", () => {
  const ids = order([
    found("no_driver:new", "no_driver", "critical", 1),
    found("sos:old", "sos", "critical", 50, { ref: { incidentId: "I1" } }),
    found("ride_check:mid", "ride_check", "critical", 20, { ref: { incidentId: "I2" } }),
    found("car_lost:x", "car_lost", "critical", 40, { ref: { incidentId: "I3" } }),
    found("sos_slow:imp", "sos_slow", "important", 45),
    found("long_wait:imp", "long_wait", "important", 2),
  ]);
  assert.deepEqual(ids, ["ride_check:mid", "car_lost:x", "sos:old", "no_driver:new", "sos_slow:imp", "long_wait:imp"]);
});

test("Q131: solved (green) alerts are kept, after the open ones of their level, newest solved first", () => {
  const ids = order([
    found("solved:early", "long_wait", "important", 100, { state: "solved", solvedAt: at(80) }),
    found("open:old", "long_wait", "important", 90),
    found("solved:late", "rider_cancels", "important", 70, { state: "solved", solvedAt: at(5) }),
    found("open:new", "rider_cancels", "important", 10),
    // Round 2 (SF-1c): came in last of the solved ones but was solved before solved:late, so the order by solved time
    // and the order by "since" differ: sorting solved alerts by "since" puts it first.
    found("solved:cameLate", "long_wait", "important", 20, { state: "solved", solvedAt: at(60) }),
  ]);
  assert.deepEqual(ids, ["open:new", "open:old", "solved:late", "solved:cameLate", "solved:early"]);
});

test("Q131: paging: the first page, then Show more until everything is shown", () => {
  const pageAlerts = (engine as Record<string, unknown>).pageAlerts as undefined | (<T>(list: readonly T[], pages: number) => { rows: T[]; left: number });
  const size = (engine as Record<string, unknown>).ALERT_PAGE as number | undefined;
  assert.equal(typeof pageAlerts, "function", "engine.ts has no pageAlerts: the alert list has no pages");
  assert.ok(size && size > 0);
  const list = Array.from({ length: size * 2 + 3 }, (_, i) => i);
  assert.deepEqual(pageAlerts!(list, 1), { rows: list.slice(0, size), left: size + 3 });
  assert.deepEqual(pageAlerts!(list, 2), { rows: list.slice(0, size * 2), left: 3 });
  assert.deepEqual(pageAlerts!(list, 3), { rows: list, left: 0 });
  assert.deepEqual(pageAlerts!([], 1), { rows: [], left: 0 });
});

// Round 2 (supervisor SF-1a, b): the screen's list is built by pure functions that OpenView draws as they are (no
// source-text test): alertListView gives the rows to draw (filtered, then one page at a time) and pagesFor brings a
// new filter back to page 1.
type ListApi = {
  alertListView: (list: readonly engine.OpenAlert[], filter: Filter, me: string | undefined, pages: number, selected?: string | null) => { rows: engine.OpenAlert[]; left: number; total: number; current: engine.OpenAlert | null };
  alertFilterKey: (old: boolean, filter: Filter) => string;
  pagesFor: (paging: { key: string; pages: number }, key: string) => number;
};
type Filter = { quick: "all" | engine.Level | "mine" | "new"; group: engine.GroupId | "all"; zone: string; state: "open" | "snoozed" | "muted" };
const ALL: Filter = { quick: "all", group: "all", zone: "all", state: "open" };
function listApi(): ListApi {
  const mod = engine as unknown as Partial<ListApi>;
  assert.equal(typeof mod.alertListView, "function", "engine.ts has no alertListView: OpenView builds (and may draw) the whole list itself");
  assert.equal(typeof mod.pagesFor, "function", "engine.ts has no pagesFor: a new filter is not brought back to page 1");
  return mod as ListApi;
}
const many = (count: number, level: FoundAlert["level"] = "important", from = 0) => Array.from({ length: count }, (_, i) => found(`a${from + i}`, "long_wait", level, from + i + 1, { zoneId: i % 2 ? "Z002" : "Z001" }));
const opened = (rows: FoundAlert[]) => openAlerts(alertsFromServer(rows, [{ id: "Z001" }, { id: "Z002" }]), emptyAlertBook(), now, () => null);

test("Q131 round 2: the screen draws one page of the filtered list, then Show more, never the whole list at once", () => {
  const { alertListView } = listApi();
  const list = opened(many(120));
  const first = alertListView(list, ALL, "me", 1);
  assert.equal(first.rows.length, engine.ALERT_PAGE, "the whole list is drawn: no pages");
  assert.deepEqual(first.rows.map((a) => a.id), list.slice(0, engine.ALERT_PAGE).map((a) => a.id), "the first page is the top of the ordered list");
  assert.deepEqual([first.left, first.total], [120 - engine.ALERT_PAGE, 120]);
  assert.deepEqual([alertListView(list, ALL, "me", 2).rows.length, alertListView(list, ALL, "me", 3).left], [engine.ALERT_PAGE * 2, 0]);
  // The filter comes before the page: one zone of 120 alerts is 60, so 50 drawn and 10 left.
  const zone = alertListView(list, { ...ALL, zone: "Z002" }, "me", 1);
  assert.ok(zone.rows.every((a) => a.zoneId === "Z002"));
  assert.deepEqual([zone.rows.length, zone.left, zone.total], [engine.ALERT_PAGE, 10, 60]);
  // A level filter: 3 critical among 120.
  const mixed = [...list, ...opened(many(3, "critical", 500))];
  const critical = alertListView(mixed, { ...ALL, quick: "critical" }, "me", 1);
  assert.deepEqual([critical.rows.length, critical.left], [3, 0]);
  // The open alert chosen for the side panel is found in the whole filtered list, not only in the drawn page.
  assert.equal(alertListView(list, ALL, "me", 1, list[100].id).current?.id, list[100].id);
});

test("Q131 round 2: a new filter starts again on page 1; the same filter keeps the pages shown", () => {
  const { alertFilterKey, pagesFor } = listApi();
  const key = alertFilterKey(false, ALL);
  assert.equal(pagesFor({ key, pages: 3 }, key), 3, "Show more is lost without a filter change");
  const changes: [string, string][] = [
    ["Old tab", alertFilterKey(true, ALL)],
    ["level", alertFilterKey(false, { ...ALL, quick: "critical" })],
    ["mine", alertFilterKey(false, { ...ALL, quick: "mine" })],
    ["kind", alertFilterKey(false, { ...ALL, group: "money" })],
    ["zone", alertFilterKey(false, { ...ALL, zone: "Z002" })],
    ["snoozed", alertFilterKey(false, { ...ALL, state: "snoozed" })],
  ];
  for (const [what, next] of changes) assert.equal(pagesFor({ key, pages: 3 }, next), 1, `a new ${what} filter stays on page 3`);
});
