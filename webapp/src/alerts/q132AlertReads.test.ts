import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, alertsFromServer, emptyAlertBook, openAlerts, type FoundAlert, type KindId } from "./engine.ts";

/**
 * Q132 (owner W2 answer A, 2026-11-15; Rules plan/S7-W2-RECHECK-2026-11-15.md row 25): the alert bar and the alert
 * desk read only the server's alert list (GET /admin/alerts/book), plus what one alert needs on demand. Before, the
 * shared useAlerts (mounted on every page, AppShell) read drivers, zoneSupply and trips every 15 s, incidents and ride
 * checks every 10 s, reservations, payments and tickets every 30 s, plus payouts, vehicles and the riders' data, in
 * every open tab, only to build alerts in the browser that the live build never shows (live = the server's list).
 */
type Plan = typeof import("./reads.ts");
async function plan(): Promise<Plan> {
  const mod = await import("./reads.ts").catch(() => null);
  assert.ok(mod, "src/alerts/reads.ts (the alert bar's read plan) does not exist: useAlerts reads every table");
  return mod;
}

function polled(mod: Plan, input: Parameters<Plan["alertReads"]>[0]): string[] {
  const on = mod.alertReads(input);
  const polls = mod.alertPolls(input.live);
  return Object.entries(on).filter(([name, yes]) => yes && polls[name as keyof typeof polls]).map(([name]) => name).sort();
}

test("Q132 live: the alert bar polls only the alert list (no table, no ride check without a ride-check alert)", async () => {
  const mod = await plan();
  // Round 2 (SF-1): an open SOS now keeps the open cases warm (test below), so this list holds no safety alert.
  const input = { live: true, canSafety: true, canRideCheck: true, found: [{ kind: "payment_failed" as KindId, state: "open" as const }, { kind: "long_wait" as KindId, state: "open" as const }] };
  assert.deepEqual(polled(mod, input), ["alerts"]);
  const on = Object.entries(mod.alertReads(input)).filter(([, yes]) => yes).map(([name]) => name).sort();
  // The alert list, who owns each SOS (safetyOps: the SOS owner on the bar) and the ride-check banner's "opened" book.
  assert.deepEqual(on, ["alerts", "rideCheckOps", "safetyOps"]);
});

test("Q132 live: a ride-check alert in the list adds only its ride checks (for the red banner), never for a role that cannot see it", async () => {
  const mod = await plan();
  // Round 2 (SF-1): for the safety team an open ride-check alert also keeps its case warm (incidents); a dispatcher
  // (trips.intervene, no incidents.read) gets the ride checks only.
  assert.deepEqual(polled(mod, { live: true, canSafety: true, canRideCheck: true, found: [{ kind: "ride_check" }] }), ["alerts", "incidents", "rideChecks"]);
  assert.deepEqual(polled(mod, { live: true, canSafety: false, canRideCheck: true, found: [{ kind: "ride_check" }] }), ["alerts", "rideChecks"]);
  assert.deepEqual(polled(mod, { live: true, canSafety: false, canRideCheck: false, found: [{ kind: "ride_check" }] }), ["alerts"]);
  assert.deepEqual(polled(mod, { live: true, canSafety: true, canRideCheck: true, found: undefined }), ["alerts"]);
});

test("Q132 demo: the panel's own engine keeps every read it had (demo removal is its own job)", async () => {
  const mod = await plan();
  assert.deepEqual(polled(mod, { live: false, canSafety: true, canRideCheck: true, found: undefined }), ["drivers", "incidents", "payments", "reservations", "rideChecks", "tickets", "trips", "zoneSupply"]);
  const polls = mod.alertPolls(false);
  assert.deepEqual([polls.drivers, polls.zoneSupply, polls.trips, polls.incidents, polls.rideChecks, polls.reservations, polls.payments, polls.tickets], [15_000, 15_000, 15_000, 10_000, 10_000, 30_000, 30_000, 30_000]);
  assert.equal(mod.alertPolls(true).alerts, 15_000, "live: the alert list every 15 s, as before");
});

// Round 2 (supervisor SF-2): the two source-text tests (useAlerts.ts names the plan; six files name the on-demand
// hooks) are replaced by behaviour tests of the options the hooks pass to their reads (RULES.md: no new source-reading
// tests). The hooks now take every read's options from these pure functions, so a hook cannot ignore the plan without
// changing what is tested here.
const TABLES = ["incidentOps", "dispatch", "driverOps", "drivers", "zoneSupply", "trips", "incidents", "reservations", "payments", "payouts", "vehicles", "tickets", "riders"] as const;

test("Q132 the bar's read options: live, every table read is switched off; demo, every table keeps its poll", async () => {
  const mod = await plan();
  assert.equal(typeof mod.alertReadOptions, "function", "alertReadOptions (the options useAlerts passes to each read) does not exist");
  const live = mod.alertReadOptions({ live: true, canSafety: true, canRideCheck: true, found: [{ kind: "long_wait", state: "open" }] });
  for (const name of TABLES) assert.equal(live[name].enabled, false, `live: ${name} is read by the bar`);
  assert.deepEqual([live.alerts, live.safetyOps.enabled, live.rideCheckOps.enabled, live.rideChecks.enabled], [{ enabled: true, refetchMs: 15_000 }, true, true, false]);
  const demo = mod.alertReadOptions({ live: false, canSafety: true, canRideCheck: true, found: undefined });
  for (const name of TABLES) assert.equal(demo[name].enabled, true, `demo: ${name} must stay on`);
  assert.deepEqual([demo.drivers, demo.trips, demo.incidents, demo.tickets, demo.payouts], [{ enabled: true, refetchMs: 15_000 }, { enabled: true, refetchMs: 15_000 }, { enabled: true, refetchMs: 10_000 }, { enabled: true, refetchMs: 30_000 }, { enabled: true }]);
});

test("Q132 the riders' data obeys enabled: off reads none of its five lists (the live bar), on reads them as before", async () => {
  const mod = await import("../riders/ridersReads.ts").catch(() => null);
  assert.ok(mod, "src/riders/ridersReads.ts (the options useRidersData passes to its reads) does not exist");
  const off = mod.ridersReadOptions({ enabled: false });
  assert.deepEqual(Object.keys(off).sort(), ["care", "drivers", "riders", "tickets", "trips"]);
  for (const [name, options] of Object.entries(off)) assert.equal(options.enabled, false, `enabled: false ignored: ${name} is read`);
  const on = mod.ridersReadOptions({});
  for (const [name, options] of Object.entries(on)) assert.notEqual(options.enabled, false, `${name} is off by default`);
  assert.equal(on.trips.refetchMs, 30_000, "the riders' trips every 30 s, as before");
});

test("Q132 what one alert needs is read on demand and obeys enabled (open cases, ride checks); live and demo lists", async () => {
  const mod = await plan();
  assert.equal(typeof mod.alertIncidentsRead, "function", "alertIncidentsRead (the options useAlertIncidents passes) does not exist");
  assert.deepEqual(mod.alertIncidentsRead(true, true), { list: "openIncidents", options: { refetchMs: 10_000, enabled: true } });
  assert.deepEqual(mod.alertIncidentsRead(true, false), { list: "openIncidents", options: { refetchMs: 10_000, enabled: false } }, "useAlertIncidents ignores enabled: every alert row reads the open cases");
  assert.equal(mod.alertIncidentsRead(false, true).list, "incidents");
  assert.deepEqual(mod.rideCheckRowsRead(true, false), { list: "rideCheckAlerts", options: { refetchMs: 10_000, enabled: false } });
  assert.equal(mod.rideCheckRowsRead(false, true).list, "rideChecks");
});

test("Q132 SF-1 safety: while an SOS / car-lost / ride-check alert is open, the bar keeps the open cases read on (Take / Solved never wait)", async () => {
  const mod = await plan();
  const input = (found: { kind: KindId; state: "open" | "solved" }[], canSafety = true) => ({ live: true, canSafety, canRideCheck: canSafety, found });
  for (const kind of ["sos", "car_lost", "ride_check", "sos_slow"] as KindId[]) {
    const options = mod.alertReadOptions(input([{ kind: "long_wait", state: "open" }, { kind, state: "open" }]));
    // The same list and poll as the alert row's own read (useAlertIncidents): one shared cache entry, so the buttons
    // are drawn from data the bar already holds, and no second read is made.
    assert.deepEqual({ list: mod.alertIncidentsRead(true, options.incidents.enabled).list, options: options.incidents }, mod.alertIncidentsRead(true, true), `${kind} open: the open cases are not kept warm`);
  }
  assert.equal(mod.alertReadOptions(input([{ kind: "sos", state: "solved" }])).incidents.enabled, false, "a solved SOS needs no warm read");
  assert.equal(mod.alertReadOptions(input([{ kind: "long_wait", state: "open" }])).incidents.enabled, false, "no safety alert: no read");
  assert.equal(mod.alertReadOptions(input([{ kind: "sos", state: "open" }], false)).incidents.enabled, false, "a role without incidents.read is never made to read the cases (a refused read is retried)");
});

const ALL_KINDS: (KindId | "rule")[] = [...KINDS.map((def) => def.id), "rule"];

test("Q132 every alert kind still shows on live (from the server list, no table needed)", () => {
  const found: FoundAlert[] = ALL_KINDS.map((kind, index) => ({
    alertId: `${kind}:x${index}`,
    kind: kind as KindId,
    level: "critical",
    title: kind,
    zoneId: "z1",
    since: new Date(Date.parse("2026-11-16T10:00:00Z") - index * 60_000).toISOString(),
    state: "open",
    ref: kind === "rule" ? { ruleId: "r1" } : ["sos", "sos_slow", "car_lost", "ride_check"].includes(kind) ? { incidentId: `inc_${index}` } : {},
  }));
  const alerts = alertsFromServer(found, [{ id: "z1" }]);
  const shown = openAlerts(alerts, emptyAlertBook(), Date.parse("2026-11-16T10:30:00Z"), () => null);
  assert.deepEqual([...new Set(shown.map((alert) => alert.kind))].sort(), [...ALL_KINDS].sort());
});

test("Q132 kinds: each kind's live source is named; a kind the server does not make is a named gap, never dropped", async () => {
  const mod = await plan();
  assert.deepEqual(Object.keys(mod.LIVE_KIND_SOURCE).sort(), [...ALL_KINDS].sort(), "every kind has a live source");
  const gaps = Object.entries(mod.LIVE_KIND_SOURCE).filter(([, source]) => source !== "server").map(([kind]) => kind).sort();
  // rider_fraud: the server has no fraud signal yet (server src/alerts/detector.ts:299); the panel showed none on live either.
  assert.deepEqual(gaps, ["rider_fraud"]);
  for (const kind of ["sos", "car_lost", "ride_check", "sos_slow"]) assert.equal(mod.LIVE_KIND_SOURCE[kind as KindId], "server", `${kind} comes from the server list`);
});

test("Q132 safety order holds: critical first; inside a level the safety alerts (SOS, car lost, ride check, SOS slow) first", () => {
  const at = (min: number) => new Date(Date.parse("2026-11-16T10:00:00Z") + min * 60_000).toISOString();
  const row = (kind: KindId, level: FoundAlert["level"], min: number): FoundAlert => ({ alertId: `${kind}:${min}`, kind, level, title: kind, zoneId: "z1", since: at(min), state: "open", ref: ["sos", "sos_slow", "car_lost", "ride_check"].includes(kind) ? { incidentId: `inc_${min}` } : {} });
  const found = [
    row("ticket_open", "info", 0),
    row("booked_at_risk", "important", 1),
    row("no_driver", "critical", 2),
    row("payment_failed", "critical", 3),
    row("sos_slow", "important", 20),
    row("ride_check", "critical", 21),
    row("car_lost", "critical", 22),
    row("sos", "critical", 23),
  ];
  const shown = openAlerts(alertsFromServer(found, [{ id: "z1" }]), emptyAlertBook(), Date.parse("2026-11-16T11:00:00Z"), () => null);
  const kinds = shown.map((alert) => alert.kind);
  assert.deepEqual(kinds.slice(0, 3).sort(), ["car_lost", "ride_check", "sos"], "the new safety alerts are on top");
  // Q131 (owner "newest first"): inside a level after the safety kinds, the newest first (no other group order).
  assert.deepEqual(kinds.slice(3), ["payment_failed", "no_driver", "sos_slow", "booked_at_risk", "ticket_open"]);
});
