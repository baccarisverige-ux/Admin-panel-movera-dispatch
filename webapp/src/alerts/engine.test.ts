import {
  computeAlerts,
  doneAlert,
  emptyAlertBook,
  entityKey,
  historyCsv,
  historyRows,
  inQuiet,
  levelFor,
  muteKind,
  numbers,
  openAlerts,
  passAlert,
  rulePreview,
  ruleIssues,
  settingsIssues,
  snoozeAlert,
  takeAlert,
  visibleTo,
  weeklySummary,
  type AlertRule,
  type Facts,
} from "./engine.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const now = Date.parse("2026-10-12T10:00:00Z");
const facts: Facts = {
  now,
  day: "2026-10-12",
  zones: [{ id: "Z001", name: "Norrmalm" }, { id: "Z002", name: "Södermalm" }],
  incidents: [
    { id: "I1", zoneId: "Z001", who: "Ali", status: "queued", owner: null, takenAt: null, createdAt: null },
    { id: "I2", zoneId: "Z002", who: "Eva", status: "taken", owner: "lena", takenAt: "2026-10-12T09:20:00Z", createdAt: null },
    { id: "I3", zoneId: "Z001", who: "Ola", status: "queued", owner: null, takenAt: null, createdAt: null, kind: "ride_check" },
  ],
  rideChecks: [
    { id: "RC1", incidentId: "I3", zoneId: "Z001", status: "queued", title: "Accident or collision (driver)", detail: "Is anyone hurt? Not sure", since: now - 3 * 60_000 },
    { id: "RC2", incidentId: "I4", zoneId: "Z002", status: "resolved", title: "I feel unsafe (rider)", detail: "", since: now - 600 * 60_000 },
  ],
  requests: [
    { tripId: "T1", rider: "Sara", zoneId: "Z001", waitingMin: 9, searching: true },
    { tripId: "T2", rider: "Omar", zoneId: "Z001", waitingMin: 16, searching: true },
    { tripId: "T3", rider: "Lea", zoneId: "Z002", waitingMin: 2, searching: true },
  ],
  freeByZone: { Z001: 1, Z002: 6 },
  dispatch: () => ({ long_wait: { on: true, limit: 5 }, few_drivers: { on: true, limit: 2 }, no_driver: { on: true, limit: 5 } }),
  lateRides: [{ id: "R1", rider: "Kim", zoneId: "Z001", minutesLeft: 15 }],
  documents: [{ driverId: "D1", driver: "Nils", zoneId: "Z001", doc: "Driving licence", days: 5 }, { driverId: "D2", driver: "Mo", zoneId: "Z001", doc: "Insurance", days: 90 }],
  ratings: [{ driverId: "D3", driver: "Per", zoneId: "Z002", rating: 4.1 }],
  offline: [],
  payments: [{ id: "P1", zoneId: "Z001", rider: "Sara", amount: 189, system: true, reason: "Payment provider timeout" }],
  refunds: [],
  payouts: [{ id: "PO1", driver: "Nils", zoneId: "Z001", amount: 9000 }],
  riders: [{ id: "U1", name: "Bo", flags: ["Same card used on 3 accounts"], cancelRate: 60, rides: 10 }],
  tickets: [],
  system: [{ id: "maps", name: "Map tiles", state: "slow", detail: "Slow answers" }],
  money: (value) => `${value} kr`,
};

assert(levelFor(16, { info: null, important: 5, critical: 15 }, "up") === "critical", "up: critical");
assert(levelFor(5, { info: 30, important: 7, critical: 0 }, "down") === "important", "down: important");
assert(levelFor(90, { info: 30, important: 7, critical: 0 }, "down") === null, "down: fine");

let book = emptyAlertBook();
const alerts = computeAlerts(facts, book.settings, book.rules);
const by = (id: string) => alerts.find((alert) => alert.id === id);
assert(by("sos:I1")?.level === "critical" && by("sos:I1")?.incidentId === "I1", "SOS is critical and tied to the incident");
assert(by("sos:I2")?.title.includes("not solved after 40 min"), "SOS taken 40 min ago stays, marked not solved");
assert(by("long_wait:T1")?.level === "important" && by("long_wait:T2")?.level === "critical" && !by("long_wait:T3"), "wait levels use the Dispatch limit");
assert(by("few_drivers:Z001:2026-10-12") && !by("few_drivers:Z002:2026-10-12"), "few drivers per zone");
assert(by("late_reservation:R1")?.level === "critical", "booked ride with 15 min left");
assert(by("doc_expiring:D1:Driving licence")?.level === "important" && !by("doc_expiring:D2:Insurance"), "documents by days left");
assert(by("low_rating:D3")?.level === "important", "low rating");
assert(by("payment_failed:P1")?.level === "critical", "system payment failure is critical");
assert(by("payout_big:PO1")?.level === "important", "large payout");
assert(by("rider_fraud:U1") && by("rider_cancels:U1")?.level === "important", "rider alerts");
assert(by("system_health:maps:2026-10-12")?.level === "important", "slow system is important");

// Ride check: a critical alert tied to its incident, not an SOS, and gone once the incident is solved.
const ride = by("ride_check:RC1");
assert(ride?.level === "critical" && ride.group === "safety" && ride.incidentId === "I3" && ride.rideCheckId === "RC1" && ride.path === "/incidents?case=I3", "ride check alert is critical and opens its incident");
assert(!by("sos:I3") && !by("ride_check:RC2"), "a ride check incident is not an SOS, and a solved one has no alert");
assert(takeAlert(emptyAlertBook(), ride!, "nora", "x").error && snoozeAlert(emptyAlertBook(), ride!, "nora", 10, "2026-10-12T10:00:00Z").error, "ride checks use the Incidents take and cannot be snoozed");
assert(openAlerts([ride!], emptyAlertBook(), now, () => "erik")[0].owner === "erik", "ride check owner comes from Incidents");
const sees = (permissions: string[]) => visibleTo(ride!, emptyAlertBook(), { id: "x", role: "viewer", can: (permission) => permissions.includes(permission) }, now);
assert(sees(["incidents.read"]) && sees(["trips.intervene"]) && !sees(["trips.read"]) && !sees(["finance.read"]), "the safety team and dispatchers see ride check alerts");
const offBook = { ...emptyAlertBook().settings, kinds: { ...emptyAlertBook().settings.kinds, ride_check: { ...emptyAlertBook().settings.kinds.ride_check, on: false } } };
assert(!computeAlerts(facts, offBook, []).some((alert) => alert.kind === "ride_check"), "ride check alerts can be switched off");

// Who sees it: everyone by default, the roles set, and the next person after the wait.
const sos = by("sos:I1")!;
assert(visibleTo(sos, book, { id: "maja", role: "support" }, now), "everyone by default");
book = { ...book, settings: { ...book.settings, kinds: { ...book.settings.kinds, payment_failed: { ...book.settings.kinds.payment_failed, who: ["finance"], escalate: { on: true, afterMin: 1, to: "ops" } } } } };
const pay = by("payment_failed:P1")!;
assert(!visibleTo(pay, book, { id: "maja", role: "support" }, now) && visibleTo(pay, book, { id: "astrid", role: "finance" }, now), "routed to finance");
assert(visibleTo(pay, book, { id: "lena", role: "ops" }, now), "passed on to ops after the wait");

// Never an alert about data the role cannot open.
assert(!visibleTo(sos, emptyAlertBook(), { id: "astrid", role: "finance", can: (permission) => permission === "finance.read" }, now), "finance does not see SOS");
assert(visibleTo(pay, emptyAlertBook(), { id: "astrid", role: "finance", can: (permission) => permission === "finance.read" }, now), "finance sees payments");

// Working on it, with names.
const wait = by("long_wait:T1")!;
const taken = takeAlert(book, wait, "nora", "2026-10-12T10:01:00Z");
assert(!taken.error && taken.book.records[wait.id].owner === "nora", "Nora is working on it");
assert(takeAlert(taken.book, wait, "lena", "x").error?.includes("nora"), "nobody else can take it");
assert(doneAlert(taken.book, wait, "lena", "", "x").error, "only the owner can solve it");
const passed = passAlert(taken.book, wait, "nora", "lena", "2026-10-12T10:02:00Z");
assert(passed.book.records[wait.id].owner === "lena", "passed to Lena");
const solved = doneAlert(passed.book, wait, "lena", "Assigned Per by hand", "2026-10-12T10:05:00Z");
assert(!solved.error && solved.book.records[wait.id].status === "done", "solved by Lena");
const open = openAlerts(alerts, solved.book, now, (id) => (id === "I1" ? null : "lena"));
assert(!open.some((item) => item.id === wait.id), "solved alerts leave the open list");
assert(open[0].level === "critical", "critical first");
assert(takeAlert(book, sos, "nora", "x").error && doneAlert(book, sos, "nora", "", "x").error, "SOS uses the Incidents take");
assert(openAlerts([sos], book, now, () => "erik")[0].owner === "erik", "SOS owner comes from Incidents");

const snoozed = snoozeAlert(book, by("low_rating:D3")!, "nora", 30, "2026-10-12T10:00:00Z");
assert(openAlerts(alerts, snoozed.book, now, () => null).find((item) => item.kind === "low_rating")?.status === "snoozed", "snoozed");
const muted = muteKind(book, "ticket_open", "nora", 60, "2026-10-12T10:00:00Z");
assert(muted.mutes.ticket_open, "mute a kind");

// History and numbers.
const rows = historyRows(solved.book);
assert(rows[0].takenBy === "nora" && rows[0].solvedBy === "lena" && rows[0].note === "Assigned Per by hand", "history keeps both names");
assert(rows[0].solveMin === 14, "minutes to solve");
assert(historyCsv(rows).split("\n")[1].includes("Assigned Per by hand"), "CSV");
const evil = historyCsv([{ ...rows[0], title: "=cmd|' /C calc'!A0", note: "@SUM(1)" }]).split("\n")[1];
assert(evil.startsWith("'=cmd") && evil.endsWith(",'@SUM(1)"), "C-13: history CSV guards formulas in titles and notes");
assert(numbers(rows).byAdmin[0].admin === "lena", "numbers by admin");
assert(weeklySummary(rows, now, () => "Wait")[0].startsWith("1 alert solved"), "weekly summary");
assert(entityKey("few_drivers:Z001:2026-10-12") === "few_drivers:Z001", "same problem across days");

// Your own rules.
const rule: AlertRule = { id: "r1", name: "Norrmalm short of drivers", on: true, metric: "free_drivers", op: "below", value: 3, forMin: 10, zoneId: "Z001", level: "important", who: "all", country: "SE", by: "nora" };
assert(ruleIssues(rule).length === 0 && ruleIssues({ ...rule, name: "" }).length === 1, "rule checks");
assert(computeAlerts(facts, book.settings, [rule]).some((alert) => alert.kind === "rule" && alert.zoneId === "Z001"), "rule fires");
assert(rulePreview(rule, facts).times >= 0, "rule preview");
const bad = { ...book.settings, kinds: { ...book.settings.kinds, long_wait: { ...book.settings.kinds.long_wait, limits: { info: null, important: 20, critical: 10 } } } };
assert(settingsIssues(bad).length === 0, "long wait important comes from Dispatch, so only critical is checked against itself");
const badDocs = { ...book.settings, kinds: { ...book.settings.kinds, doc_expiring: { ...book.settings.kinds.doc_expiring, limits: { info: 5, important: 10, critical: 0 } } } };
assert(settingsIssues(badDocs)[0].includes("lowest"), "limits must be in order");
assert(inQuiet({ on: true, from: "22:00", to: "07:00" }, "23:30") && !inQuiet({ on: true, from: "22:00", to: "07:00" }, "12:00"), "quiet hours");

console.log("alerts engine ok");
