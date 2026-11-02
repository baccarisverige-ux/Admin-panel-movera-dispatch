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
  assert.deepEqual(alertCall("admin.alerts.mute", "few_drivers", muted, "A1", now), { method: "PUT", path: "/admin/alerts/mutes/few_drivers", body: { minutes: 60 } });
  assert.deepEqual(alertCall("admin.alerts.mute", "few_drivers", unmuteKind(muted, "few_drivers"), "A1", now), { method: "DELETE", path: "/admin/alerts/mutes/few_drivers" });
  assert.deepEqual(alertCall("admin.alerts.settings", "s", { ...book, draftRev: 5 }, "A1", now)?.body?.["expectedRev"], 4);
  assert.equal(alertCall("admin.alerts.rule", "r", { ...book, draftRev: 2 }, "A1", now)?.path, "/admin/alerts/rules");
  assert.equal(alertCall("admin.alerts.take", "missing", book, "A1", now), null);
});
