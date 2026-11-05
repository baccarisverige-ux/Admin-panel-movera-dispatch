import assert from "node:assert/strict";
import test from "node:test";
import { alertCall, bookFromServer, liveAgentName, livePassPeople, type AlertBookState } from "./liveAlerts.ts";
import { emptyAlertBook, muteKind, unmuteKind, type AlertBook } from "../alerts/engine.ts";

// v0.18.15 (owner Q5 "Alerts = FULL FLOW"): the live Alerts page reads the server's book and sends each button to it.
const STATE: AlertBookState = {
  rev: 4, settings: {}, rules: [], mutes: {}, quiet: { on: true, from: "23:00", to: "06:00" },
  people: [{ adminId: "A1", name: "Nora Lind" }, { adminId: "A2", name: "Erik Ek" }],
  records: [{ alertId: "long_wait:Z001", kind: "long_wait", level: "important", title: "Wait", zoneId: "Z001", since: "2026-10-26T08:50:00Z", status: "taken", owner: "A2", ownerName: "Erik Ek", events: [{ at: "2026-10-26T09:00:00Z", by: "A2", byName: "Erik Ek", kind: "take", text: "Working on it" }] }],
};

test("the server's book becomes the page's book; names and pass list come along", () => {
  const book = bookFromServer(STATE, "A1");
  assert.equal(book.draftRev, 4);
  assert.equal(book.records["long_wait:Z001"]?.owner, "A2");
  assert.deepEqual(book.personal, { A1: { quiet: { on: true, from: "23:00", to: "06:00" } } });
  assert.equal(liveAgentName("A2"), "Erik Ek");
  assert.deepEqual(livePassPeople().map((p) => p.id), ["A1", "A2"]);
});

test("each Alerts button is one server call", () => {
  const record = { id: "x", kind: "few_drivers" as const, level: "info" as const, title: "T", zoneId: null, since: "2026-10-26T09:00:00Z", status: "taken" as const, owner: "A1", events: [{ at: "2026-10-26T09:00:00Z", by: "A1", kind: "take" as const, text: "Working on it" }] };
  const book: AlertBook = { ...emptyAlertBook(), records: { x: record } };
  assert.deepEqual(alertCall("admin.alerts.take", "x", book, "A1", 0), { method: "POST", path: "/admin/alerts/x/take", body: { kind: "few_drivers", level: "info", title: "T", since: record.since } });
  const snoozed = { ...book, records: { x: { ...record, status: "snoozed" as const, snoozeUntil: "2026-10-26T09:30:00Z", events: [...record.events, { at: "2026-10-26T09:00:00Z", by: "A1", kind: "snooze" as const, text: "" }] } } };
  assert.equal(alertCall("admin.alerts.snooze", "x", snoozed, "A1", 0)?.body?.["minutes"], 30);
  const passed = { ...book, records: { x: { ...record, events: [...record.events, { at: record.since, by: "A1", kind: "pass" as const, text: "", to: "A2" }] } } };
  assert.equal(alertCall("admin.alerts.pass", "x", passed, "A1", 0)?.body?.["to"], "A2");
  const done = { ...book, records: { x: { ...record, status: "done" as const, events: [...record.events, { at: record.since, by: "A1", kind: "done" as const, text: "Sent a driver" }] } } };
  assert.equal(alertCall("admin.alerts.done", "x", done, "A1", 0)?.body?.["note"], "Sent a driver");
  const now = Date.parse("2026-10-26T09:00:00Z");
  const muted = muteKind(book, "few_drivers", "A1", 60, "2026-10-26T09:00:00Z");
  assert.deepEqual(alertCall("admin.alerts.mute", "few_drivers", muted, "A1", now), { method: "PUT", path: "/admin/alerts/mutes/few_drivers?country=SE", body: { minutes: 60 } });
  assert.deepEqual(alertCall("admin.alerts.mute", "few_drivers", unmuteKind(muted, "few_drivers"), "A1", now), { method: "DELETE", path: "/admin/alerts/mutes/few_drivers?country=SE" });
  assert.deepEqual(alertCall("admin.alerts.settings", "s", { ...book, draftRev: 5 }, "A1", now)?.body?.["expectedRev"], 4);
  assert.equal(alertCall("admin.alerts.rule", "r", { ...book, draftRev: 2 }, "A1", now)?.path, "/admin/alerts/rules");
  assert.equal(alertCall("admin.alerts.take", "missing", book, "A1", now), null);
});

// v0.18.20 server-side alerts (contract.json#alertDesk.serverDetection, owner 2026-11-04 A1–A3): on live the panel only
// reads the alerts the server found; a solved one (owner A2) stays, green, with what happened.
test("the server's alerts become the page's alerts: since from the server, solved ones green, other zones left out", async () => {
  const { alertsFromServer, openAlerts, zoneLimits, defaultSettings } = await import("../alerts/engine.ts");
  const state: AlertBookState = {
    ...STATE,
    alerts: [
      { alertId: "long_wait:T1.a", kind: "long_wait", level: "important", title: "Lina has waited 16 min", titleT: { t: "{0} has waited {1} min", a: ["Lina", 16] }, zoneId: "Z001", since: "2026-11-04T16:31:00Z", state: "open", ref: { tripId: "T1" } },
      { alertId: "booked_at_risk:T2.b", kind: "booked_at_risk", level: "important", title: "x", zoneId: "Z001", since: "2026-11-04T16:20:00Z", state: "solved", solvedAt: "2026-11-04T16:48:00Z", solvedText: "Driver Ali took it 17:48", solvedT: { t: "Driver {0} took it {1}", a: ["Ali", "17:48"] }, ref: { tripId: "T2" } },
      { alertId: "ride_check:I9.c", kind: "ride_check", level: "critical", title: "Ride check: Possible crash", titleT: { t: "Ride check: {0}", a: ["Possible crash"], x: [0] }, zoneId: "Z001", since: "2026-11-04T16:25:00Z", state: "open", ref: { incidentId: "I9" } },
      { alertId: "few_drivers:FR-PC.d", kind: "few_drivers", level: "important", title: "Paris", zoneId: "FR-PC", since: "2026-11-04T16:00:00Z", state: "open" },
    ],
  };
  const book = bookFromServer(state, "A1");
  assert.equal(book.found?.length, 4);
  const alerts = alertsFromServer(book.found ?? [], [{ id: "Z001" }], (incidentId) => (incidentId === "I9" ? "RC9" : undefined));
  assert.deepEqual(alerts.map((a) => a.id), ["long_wait:T1.a", "booked_at_risk:T2.b", "ride_check:I9.c"]);
  assert.equal(alerts[0]!.since, Date.parse("2026-11-04T16:31:00Z"));
  assert.equal(alerts[0]!.title, "Lina has waited 16 min");
  assert.equal(alerts[1]!.path, "/reservations/T2");
  assert.deepEqual(alerts[1]!.solved, { at: Date.parse("2026-11-04T16:48:00Z"), text: "Driver Ali took it 17:48" });
  assert.equal(alerts[2]!.incidentId, "I9");
  assert.equal(alerts[2]!.rideCheckId, "RC9");
  const open = openAlerts(alerts, book, Date.parse("2026-11-04T16:50:00Z"), () => null);
  assert.ok(open.find((a) => a.id === "booked_at_risk:T2.b")?.solved, "a solved alert stays in the open list until done");
  // Owner A1: the at-risk minutes are per zone, default 15 for booked and live rides.
  assert.deepEqual(zoneLimits(defaultSettings(), "Z001"), { bookedAtRiskMin: 15, liveAtRiskMin: 15, fewDriversLimit: 2, noDriverLimit: 5 });
  assert.equal(zoneLimits({ ...defaultSettings(), zones: { Z001: { bookedAtRiskMin: 30 } } }, "Z001").bookedAtRiskMin, 30);
});

// v0.18.33 owner Q-Bj (contract.json#alertsOldList): SOS / safety cases never close by themselves; 24 h after the trip
// ended the server marks them old and the panel lists them in the Old tab (sv Gamla, fr Anciennes), not in Open.
test("old SOS / safety alerts leave the open list for the Old tab, still open; texts in sv / fr / en", async () => {
  const { alertsFromServer, openAlerts, splitOld } = await import("../alerts/engine.ts");
  const { en } = await import("../i18n/en.ts");
  const { sv } = await import("../i18n/sv.ts");
  const { fr } = await import("../i18n/fr.ts");
  const state: AlertBookState = {
    ...STATE,
    alerts: [
      { alertId: "sos:I1.a", kind: "sos", level: "critical", title: "SOS from Lina", zoneId: "Z001", since: "2026-11-03T10:00:00Z", state: "open", old: true, oldSince: "2026-11-04T11:00:00Z", ref: { incidentId: "I1", tripId: "T1" } },
      { alertId: "sos:I2.b", kind: "sos", level: "critical", title: "SOS from Omar", zoneId: "Z001", since: "2026-11-04T16:00:00Z", state: "open", ref: { incidentId: "I2", tripId: "T2" } },
    ],
  };
  const book = bookFromServer(state, "A1");
  const alerts = alertsFromServer(book.found ?? [], [{ id: "Z001" }]);
  assert.deepEqual(alerts[0]!.old, { since: Date.parse("2026-11-04T11:00:00Z") });
  assert.equal(alerts[1]!.old, undefined);
  const { open, old } = splitOld(openAlerts(alerts, book, Date.parse("2026-11-04T16:50:00Z"), () => null));
  assert.deepEqual(open.map((a) => a.id), ["sos:I2.b"]);
  assert.deepEqual(old.map((a) => a.id), ["sos:I1.a"]);
  assert.equal(old[0]!.solved, undefined, "an old case is never solved or closed by itself");
  const d = (dict: Record<string, string>, key: string) => dict[key];
  assert.equal(d(en, "Old"), "Old");
  assert.equal(d(sv, "Old"), "Gamla");
  assert.equal(d(fr, "Old"), "Anciennes");
  assert.equal(d(sv, "Trip ended {0}"), "Resan slutade {0}");
});
