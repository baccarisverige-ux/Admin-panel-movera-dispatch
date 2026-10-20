import type { DemoRecord } from "./api/seed.ts";
import { addEntry, canSeePrivate, callSummary, decide, emptyTripOps, flaggedIds, groupOf, maskPhone, moneySplit, needsApproval, routeOf, withStatus } from "./trips/file.ts";
import { caseOf, clocks, defaultIncidentSettings, emptyIncidentOps, lateText, settingsError, setLevel, sortCases } from "./safety/cases.ts";
import { defaultRules, emptyRiskOps, flagged, people, preview, review, ruleError } from "./safety/risk.ts";
import { emptyHandoverOps, handOver, markRead, unread } from "./handover/shift.ts";
import { defaultZoneBook } from "./pricing/zonePricing.ts";
import { tripIndex } from "./trips/present.ts";
import { emptySafety } from "./safety/ops.ts";
import { defaultRefundPolicy } from "./payments/refundPolicy.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const trip = (id: string, status: string, extra: Partial<DemoRecord> = {}): DemoRecord => ({ id, name: "Maja Lind", phone: "+46 70 123 45 67", zoneId: "Z001", status, driverId: "D0001", fareOre: 10_000, ...extra });

// Trips
assert(groupOf("in_trip") === "live" && groupOf("searching") === "searching" && groupOf("cancelled_by_rider") === "cancelled" && groupOf("failed") === "problem", "trip groups");
const done = trip("T0012", "completed");
const book = defaultZoneBook("Z001");
const split = moneySplit(done, book, false, []);
assert(split.price === 10_000 && split.state === "charged", "the charged price is the trip price");
assert(split.riderPaid - split.driverGets - split.fleet === split.moveraKeeps, "every krona goes somewhere");
assert(split.commission === Math.round((split.ridePrice * split.commissionPct) / 100), "commission from the zone price book");
const fleetSplit = moneySplit(done, { ...book, fleetCommissionPct: 10 }, true, []);
assert(fleetSplit.fleet > 0 && fleetSplit.driverGets < split.driverGets, "fleet owner share comes from the driver's part");
assert(moneySplit(trip("T0013", "failed"), book, false, []).state === "none", "a failed trip moves no money");
// A rider's late cancel fee comes from Dispatch › Rider cancel fees (Live trips), not from Pricing.
const lateId = Array.from({ length: 30 }, (_, n) => `T${String(n + 1).padStart(4, "0")}`).find((id) => tripIndex(id) % 3 === 0)!;
const lateCancel = trip(lateId, "cancelled_by_rider");
const ownTable = { economy: { freeMin: 2, type: "fixed" as const, value: 20, min: null, max: null } };
assert(moneySplit(lateCancel, book, false, [], ownTable).state === "cancel_fee" && moneySplit(lateCancel, book, false, [], ownTable).price === 2_000, "the zone's live cancel fee is what the rider paid");
assert(moneySplit(lateCancel, book, false, []).state === "cancel_fee" && moneySplit(lateCancel, book, false, []).price > 0, "without a table, the default live cancel fees apply");
assert(/rue|avenue|place|quai|boulevard/.test(routeOf(trip("T1001", "completed", { zoneId: "FR-OCE" })).stops[0].label), "French trips get French streets");
assert(callSummary([{ at: "", from: "driver", seconds: 30, answered: true }]).startsWith("Driver called the rider once"), "call summary");
assert(canSeePrivate("support", emptyTripOps().settings) && !canSeePrivate("viewer", emptyTripOps().settings), "support sees private data, viewer does not");
assert(canSeePrivate("finance", { ...emptyTripOps().settings, extraRoles: ["finance"] }), "super admin can add roles");
assert(maskPhone("+46 70 123 45 67") === "•••• 4567", "masked phone");
const ops = emptyTripOps();
assert(addEntry(ops, { tripId: "T0012", kind: "refund", text: "", amountMinor: 20_000 }, "nora", "2026-10-12T10:00:00Z", split).error === "That is more than the rider paid.", "refund up to what was paid");
assert(addEntry(ops, { tripId: "T0012", kind: "note", text: " " }, "nora", "2026-10-12T10:00:00Z").error, "a note needs text");
assert(needsApproval("pay", 60_000, "SE", defaultRefundPolicy()) && !needsApproval("pay", 10_000, "SE", defaultRefundPolicy()), "big pay changes need a second admin");
const asked = withStatus(addEntry(ops, { tripId: "T0012", kind: "pay", text: "", amountMinor: 60_000 }, "nora", "2026-10-12T10:00:00Z", split), true);
assert(asked.entry.status === "waiting", "waits for a second admin");
assert(decide(asked.ops, asked.entry.id, "nora", true, "2026-10-12T10:05:00Z").error === "A second admin must decide.", "not the same admin");
const approved = decide(asked.ops, asked.entry.id, "lena", true, "2026-10-12T10:05:00Z").ops;
assert(moneySplit(done, book, false, approved.entries).payChange === 60_000, "approved pay counts");
const flaggedOps = addEntry(ops, { tripId: "T0012", kind: "flag", text: "Long route" }, "nora", "2026-10-12T10:00:00Z").ops;
assert(flaggedIds(flaggedOps).has("T0012"), "flagged trips");
assert(!flaggedIds(addEntry(flaggedOps, { tripId: "T0012", kind: "unflag", text: "Checked" }, "nora", "2026-10-12T11:00:00Z").ops).has("T0012"), "unflag");

// Incidents
const now = Date.parse("2026-10-12T12:00:00Z");
const incident = trip("INC-1", "queued");
const fresh = caseOf(incident, emptySafety(), emptyIncidentOps(), now);
assert(fresh.kind === "sos" && fresh.level === "critical" && fresh.state === "new", "an open SOS is critical and new");
assert(lateText(fresh, defaultIncidentSettings(), now)?.startsWith("not taken after"), "an SOS not taken in 2 minutes is late");
assert(lateText(fresh, { ...defaultIncidentSettings(), lateAlerts: false }, now) === null, "late alerts can be turned off");
const raised = setLevel(emptyIncidentOps(), "INC-1", "low", "nora", "", "2026-10-12T12:00:00Z");
assert(caseOf(incident, emptySafety(), raised, now).level === "low", "the level can be changed");
assert(clocks(caseOf(incident, emptySafety(), raised, now), raised.settings, now).take.limit === 60, "limits follow the level");
const solved = caseOf(trip("INC-2", "closed"), emptySafety(), emptyIncidentOps(), now);
assert(sortCases([solved, fresh])[0].id === "INC-1", "open cases first");
assert(settingsError({ ...defaultIncidentSettings(), limits: { ...defaultIncidentSettings().limits, critical: { takeMin: 30, solveMin: 40 } } }), "critical must be taken at least as fast as high");

// Risk
const crowd = people(Array.from({ length: 60 }, (_, index) => trip(`D${1000 + index}`, "active")), Array.from({ length: 120 }, (_, index) => trip(`R${1000 + index}`, "active")));
const risk = emptyRiskOps();
const list = flagged(crowd, risk.rules.SE, risk);
assert(list.length > 0 && list.every((person) => person.hits.length > 0 && person.score > 0), "flagged people have reasons and a score");
assert(list.every((person, index) => index === 0 || list[index - 1].score >= person.score), "highest score first");
const stricter = defaultRules().map((rule) => (rule.id === "cancels" ? { ...rule, limit: 10 } : rule));
const counts = preview(crowd, risk.rules.SE, stricter, risk);
assert(counts.after > counts.now, "a lower limit flags more people, shown before saving");
assert(ruleError(defaultRules().map((rule) => (rule.id === "low_rating" ? { ...rule, limit: 9 } : rule))), "limits are checked");
const checked = review(risk, list[0].key, "cleared", "", "nora", "2026-10-12T12:00:00Z");
assert(flagged(crowd, checked.rules.SE, checked).find((person) => person.key === list[0].key)?.review?.decision === "cleared", "reviews are kept");

// Handover
const shifts = emptyHandoverOps();
const snapshot = { openAlerts: 3, critical: 1, openIncidents: 1, working: [], notTaken: [], changes: [] };
assert(handOver(shifts, { country: "SE", zones: "all", by: "nora", at: "2026-10-12T12:00:00Z", to: null, text: " ", todo: [], snapshot }).error, "a handover needs a note or a to-do");
const handed = handOver(shifts, { country: "SE", zones: "all", by: "nora", at: "2026-10-12T12:00:00Z", to: "lena", text: "Busy evening", todo: ["Call D0001"], snapshot }).ops;
assert(unread(handed, "SE", "lena").length === 1 && unread(handed, "SE", "erik").length === 0 && unread(handed, "SE", "nora").length === 0, "only the next admin must read it");
assert(markRead(handed, "HO-1", "nora", "2026-10-12T12:05:00Z").error === "You wrote this handover.", "not your own");
assert(unread(markRead(handed, "HO-1", "lena", "2026-10-12T12:05:00Z").ops, "SE", "lena").length === 0, "read");
assert(unread({ ...handed, mustRead: false }, "SE", "lena").length === 0, "the read check can be turned off");

console.log("operations ok");
