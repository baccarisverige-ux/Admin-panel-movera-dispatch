import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

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
  ]);
  assert.deepEqual(ids, ["open:new", "open:old", "solved:late", "solved:early"]);
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
  const view = src("./OpenView.tsx");
  assert.match(view, /pageAlerts\(/, "OpenView shows the whole list at once");
  assert.match(view, /Show more \(\{0\} left\)/, "OpenView has no Show more button");
});
