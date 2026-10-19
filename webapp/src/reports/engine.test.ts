import { earningsReport } from "../dashboard/earnings.ts";
import { periodWindow } from "../dashboard/period.ts";
import {
  adminSummaries,
  alertsData,
  canSeeOthers,
  compareWindow,
  csvOf,
  demoWork,
  dispatchData,
  driversData,
  filterShare,
  linkFor,
  moneyData,
  NO_FILTERS,
  notesFor,
  ridesData,
  scheduleIssues,
  scheduleLine,
  sessions,
  workEvents,
  type Card,
  type WorkEvent,
} from "./engine.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const now = Date.parse("2026-10-12T12:00:00Z");
const week = periodWindow({ kind: "week" }, now, "Europe/Stockholm");
const month = periodWindow({ kind: "month" }, now, "Europe/Stockholm");
const yearBack = compareWindow(week, "year");
assert(yearBack.prevStart === week.start - 365 * 86_400_000 && yearBack.compareLabel.includes("last year"), "compare with last year");
assert(compareWindow(week, "previous").prevStart === week.prevStart, "compare with the period before");

const report = earningsReport("SE", ["Z001", "Z002"], week);
assert(filterShare(report, NO_FILTERS) === 1, "no filter, no scaling");
const comfort = filterShare(report, { ...NO_FILTERS, category: "comfort" });
assert(comfort > 0.15 && comfort < 0.25, "category filter keeps its share");

const rides = ridesData(report, [], 1);
const requested = rides.cards.find((card) => card.id === "requested")!;
const completed = rides.cards.find((card) => card.id === "completed")!;
assert(requested.value > completed.value && completed.value === report.totals.trips, "rides match the dashboard model");
assert(rides.byHour.length === 24, "rides by hour");
const money = moneyData(report, [], 1, { count: 3, minor: 4500 });
assert(money.cards.find((card) => card.id === "gross")!.value === report.totals.grossMinor, "money matches the dashboard");
assert(money.cards.find((card) => card.id === "failed")!.previous === null, "failed payments are a now number");

const cards: Card[] = [
  { id: "a", label: "Cancel rate", value: 12, previous: 8, format: "pct", info: "", goodDown: true },
  { id: "b", label: "Rides", value: 100, previous: 98, format: "count", info: "" },
];
const notes = notesFor(cards);
assert(notes.length === 1 && notes[0].tone === "bad" && notes[0].text === "Cancel rate is up 50%", "notes on big changes, bad when a down-is-good number rises");

const drivers = driversData([
  { id: "D1", name: "Ali", zone: "Norrmalm", fleet: "", rides: 40, hours: 30, netMinor: 900000, bonusMinor: 15000, acceptancePct: 90, cancelPct: 4, rating: 4.8, previousRides: 30 },
  { id: "D2", name: "Eva", zone: "Solna", fleet: "", rides: 0, hours: 2, netMinor: 0, bonusMinor: 0, acceptancePct: 70, cancelPct: 10, rating: 4.5, previousRides: 5 },
]);
assert(drivers.cards.find((card) => card.id === "active")!.value === 1, "drivers who drove");
assert(drivers.cards.find((card) => card.id === "acceptance")!.value === 90, "weighted by rides");
assert(drivers.notes.some((note) => note.text.startsWith("Ali did")), "note on one driver doing many rides");

const dispatch = dispatchData([
  { id: "Z001", name: "Norrmalm", findSec: 20, acceptedPct: 90, noDriverPct: 2, pickupMin: 5, radarPct: 80, exclusivePct: 60, requests: 300, mode: "Radar" },
  { id: "Z002", name: "Södermalm", findSec: 40, acceptedPct: 80, noDriverPct: 6, pickupMin: 7, radarPct: 70, exclusivePct: 50, requests: 100, mode: "Exclusive" },
]);
assert(dispatch.cards[0].value === 25, "dispatch averages are weighted by requests");
assert(dispatch.notes[0].text.includes("Södermalm"), "worst zone note");

const history = [
  { id: "a1", kind: "long_wait" as const, level: "important" as const, title: "Sara waited", zoneId: "Z001", since: "2026-10-08T09:00:00Z", status: "done" as const, owner: "nora", events: [], takenBy: "nora", solvedBy: "nora", takeMin: 2, solveMin: 9, note: "Assigned", doneAt: "2026-10-08T09:09:00Z" },
  { id: "a2", kind: "sos" as const, level: "critical" as const, title: "SOS", zoneId: "Z002", since: "2026-10-09T09:00:00Z", status: "done" as const, owner: "erik", events: [], takenBy: "erik", solvedBy: "erik", takeMin: 1, solveMin: 20, note: "Called", doneAt: "2026-10-09T09:20:00Z" },
];
const alerts = alertsData(history, month, { critical: 1, important: 2, info: 3 });
assert(alerts.cards[0].value === 2 && alerts.cards.find((card) => card.id === "open")!.value === 6, "alert numbers");

// Admin work: saves, sign-ins, views, exports and solved alerts with names.
const audits = [
  { id: "au1", operationId: "o1", at: "2026-10-08T10:00:00Z", actorId: "nora", action: "admin.dispatch.publish", targetId: "dispatch rules", scope: "Z001", before: "rev 3", after: "rev 4", reason: "Safety review", result: "committed" as const },
  { id: "au2", operationId: "o2", at: "2026-10-08T11:00:00Z", actorId: "nora", action: "admin.rider.revealSensitive", targetId: "R0001", scope: "Z001", before: "", after: "", reason: "Lost item", result: "committed" as const },
  { id: "au3", operationId: "o3", at: "2026-10-08T11:30:00Z", actorId: "lena", action: "admin.zone.publish", targetId: "zones", scope: "all", before: "", after: "", reason: "", result: "rejected" as const },
];
const activity = [
  { id: "s1", at: "2026-10-08T07:00:00Z", actorId: "nora", kind: "signin" as const, what: "Signed in" },
  { id: "s2", at: "2026-10-08T15:00:00Z", actorId: "nora", kind: "signout" as const, what: "Signed out" },
  { id: "e1", at: "2026-10-08T12:00:00Z", actorId: "nora", kind: "export" as const, what: "riders (CSV)" },
];
const events = workEvents(audits, activity, history, (action) => action);
assert(!events.some((event) => event.id === "au3"), "rejected actions are not work done");
assert(events.find((event) => event.id === "au2")?.kind === "view", "revealing a phone is a sensitive view");
assert(events.find((event) => event.id === "au1")?.detail.includes("rev 3 → rev 4") && events.find((event) => event.id === "au1")?.detail.includes("why: Safety review"), "before, after and why");
assert(events.find((event) => event.id === "au1")?.link === "/dispatch?view=history", "link to what changed");
assert(linkFor("D0042", "admin.driver.activate") === "/drivers/D0042", "driver link");
const nora = adminSummaries(events, history, month.start, month.end, now).find((row) => row.actorId === "nora")!;
assert(nora.actions === 1 && nora.views === 1 && nora.exports === 1 && nora.alertsSolved === 1 && nora.onlineMin === 480, "admin summary");
const open = sessions([{ id: "x", at: "2026-10-12T10:00:00Z", actorId: "a", kind: "signin", text: "", detail: "", scope: "all", link: null, demo: false } as WorkEvent], "a", now);
assert(open[0].open && open[0].to === Date.parse("2026-10-12T10:15:00Z"), "an open session counts until 15 min after the last action");
assert(canSeeOthers("ops", []) && !canSeeOthers("finance", []) && canSeeOthers("finance", ["finance"]), "who sees others' work");
const demo = demoWork([{ id: "nora", role: "super", active: true }], now, ["Z001"]);
assert(demo.length > 10 && demo.every((event) => event.demo), "demo history is marked");

const schedule = { id: "s", name: "Weekly money", by: "nora", on: true, tab: "money" as const, format: "pdf" as const, every: "week" as const, weekday: 0, time: "08:00", to: "finance@movera.se, astrid@movera.se", country: "SE" };
assert(scheduleIssues(schedule).length === 0 && scheduleIssues({ ...schedule, to: "nope" }).length === 1, "schedule checks");
assert(scheduleLine(schedule) === "Every Monday at 08:00: last week's Money as PDF to 2 addresses", "schedule in words");
assert(csvOf(["a"], [["=SUM(A1)"]]) === "a\n'=SUM(A1)", "CSV guards formulas");

assert(csvOf(["a"], [["\t=SUM(A1)"]]) === "a\n'\t=SUM(A1)", "CSV guards a tab before a formula");

console.log("reports engine ok");
