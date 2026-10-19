import type { DemoRecord } from "./api/seed.ts";
import { answerDispute, byMethod, emptyPayOps, factsOf, payRulesError, paySplit, refundLimitMinor, retry, retryPlan } from "./payments/desk.ts";
import { approveRun, bankFile, bankReady, emptyPayoutOps, failedOf, holdOf, nextRun, payoutLines, retryPayout, runNeedsApproval, scheduleError, scheduleLine, setHold } from "./payments/runs.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const now = Date.parse("2026-10-12T12:00:00Z");
const pay = (id: string, status: string, fareOre = 10_000, zoneId = "Z001"): DemoRecord => ({ id, name: "Card", phone: "", zoneId, status, fareOre });
const riders: DemoRecord[] = [{ id: "R0001", name: "Maja Lind", phone: "", zoneId: "Z001", status: "active" }];
const ops = emptyPayOps();

// Payments
const facts = factsOf(pay("PAY0002", "captured"), riders, [], ops, now);
assert(facts.country === "SE" && facts.riderId === "R0001" && ["card", "swish", "apple", "klarna", "google"].includes(facts.method), "a Swedish payment has a Swedish method and a rider");
assert(factsOf(pay("PAY1001", "captured", 1000, "FR-OCE"), [], [], ops, now).method !== "swish", "no Swish in France");
const split = paySplit(10_000, "SE");
assert(split.driver + split.movera === split.price && split.commission === 2000, "who gets what adds up");
const failedRecord = pay("PAY0001", "failed");
const failed = factsOf(failedRecord, riders, [], ops, now);
const plan = retryPlan(failedRecord, failed, ops, now);
assert(plan.max === 3 && plan.tries <= 3, "retries follow the rules");
const retried = retry(ops, "PAY0001", "paid", "astrid", "2026-10-12T12:00:00Z");
assert(factsOf(failedRecord, riders, [], retried, now).status === "captured", "a retry that worked makes the payment paid");
assert(refundLimitMinor("super", "SE", ops) === null && refundLimitMinor("finance", "SE", ops) === 200_000 && refundLimitMinor("viewer", "SE", ops) === 0, "refund limits per role");
assert(answerDispute(ops, "PAY0019", "evidence_sent", " ", "astrid", "2026-10-12T12:00:00Z").error, "proof needs text");
assert(payRulesError({ ...ops.rules.SE, retry: { on: true, afterHours: [24, 1, 72], maxTries: 3 } }), "tries must come in order");
const methods = byMethod([facts, failed]);
assert(methods.reduce((sum, row) => sum + row.count, 0) === 2, "numbers per method count every payment");

// Payouts
const payouts = emptyPayoutOps();
const sched = payouts.schedules.SE;
const record: DemoRecord = { id: "PO1", name: "Week 1", phone: "", zoneId: "Z001", status: "scheduled", driverId: "D0001", fareOre: 125_000 };
for (const fleet of [false, true]) {
  const { lines } = payoutLines(record, fleet, sched);
  const sum = lines.filter((line) => line.kind !== "total").reduce((total, line) => total + line.minor, 0);
  assert(sum === 125_000 && lines.at(-1)?.minor === 125_000, `the lines add up to what the driver gets (fleet ${fleet})`);
}
assert(payoutLines(record, true, sched).fleetMinor > 0, "the fleet owner gets a part");
// Q23: cash the driver owes Movera is a deduction line, and the lines still add up.
const withCash = payoutLines(record, false, sched, { minor: 9_000, trips: 3 });
const cashLine = withCash.lines.find((line) => line.label.startsWith("Cash rides"));
assert(cashLine?.label === "Cash rides: owed to Movera (3 trips)" && cashLine.minor === -9_000 && cashLine.kind === "minus" && withCash.cashMinor === 9_000, "cash owed is a minus line");
assert(withCash.lines.filter((line) => line.kind !== "total").reduce((total, line) => total + line.minor, 0) === 125_000 && withCash.lines[0].label.endsWith("paid in the app"), "with cash the lines still add up to what the driver gets");
assert(!payoutLines(record, false, sched).lines.some((line) => line.label.startsWith("Cash rides")), "no cash line without cash trips");
assert(setHold(payouts, "PO1", true, " ", "astrid", "2026-10-12T12:00:00Z").error, "a hold needs a reason");
const held = setHold(payouts, "PO1", true, "Damage claim", "astrid", "2026-10-12T12:00:00Z").ops;
assert(holdOf(held, "PO1")?.reason === "Damage claim" && !holdOf(setHold(held, "PO1", false, "Released", "astrid", "2026-10-12T13:00:00Z").ops, "PO1"), "hold and release");
const po7 = { ...record, id: "PO7" };
assert(failedOf(payouts, po7) && !failedOf(retryPayout(payouts, "PO7", "astrid", "2026-10-12T12:00:00Z"), po7), "a retried payout is no longer failed");
assert(runNeedsApproval(30_000_00, "SE", sched) && !runNeedsApproval(10_000_00, "SE", sched), "big runs need a second admin");
assert(approveRun(payouts, "run-1", "astrid", "2026-10-12T12:00:00Z", "astrid").error, "not the one who started it");
assert(nextRun(sched, Date.parse("2026-10-12T12:00:00Z"), "Europe/Stockholm") === "2026-10-19 08:00", "next Monday 08:00 after Monday noon");
assert(nextRun({ ...sched, every: "daily" }, Date.parse("2026-10-12T04:00:00Z"), "Europe/Stockholm") === "2026-10-12 08:00", "daily runs today when the time has not passed");
assert(scheduleLine(sched) === "Every Monday at 08:00" && scheduleError({ ...sched, time: "8" }), "schedule in words and checks");
assert(bankReady({ driverId: "D1", clearing: "", account: "", iban: "", bic: "", status: "in_review", reviewedBy: "", reviewedAt: "", note: "" }, null, null)?.includes("not approved"), "bank must be approved for the file");
assert(bankFile([{ id: "PO1", driver: "Maja; Lind", iban: "SE45 5000", bic: "ESSESESS", amount: 125_000, reference: "Movera payout PO1" }], "SEK").split("\n")[1] === 'PO1;"Maja; Lind";SE455000;ESSESESS;1250.00;SEK;Movera payout PO1', "bank file line");

// C-01: TND has 3 decimals; 125 500 millimes is 125.500 DT, not 1255.00.
assert(bankFile([{ id: "PO9", driver: "Amel", iban: "TN59 1000", bic: "BIATTNTT", amount: 125_500, reference: "r" }], "TND").split("\n")[1] === "PO9;Amel;TN591000;BIATTNTT;125.500;TND;r", "TND bank file uses 3 decimals");
assert(bankFile([{ id: "PO8", driver: "Luc", iban: "FR76", bic: "BNPAFRPP", amount: 4_205, reference: "r" }], "EUR").split("\n")[1].includes(";42.05;EUR;"), "EUR bank file uses 2 decimals");
// C-13: a driver name typed in the driver app cannot become a spreadsheet formula.
assert(bankFile([{ id: "PO9", driver: '=HYPERLINK("http://x","x")', iban: "SE45", bic: "ESSESESS", amount: 100, reference: "@SUM(1)" }], "SEK").split("\n")[1] === `PO9;"'=HYPERLINK(""http://x"",""x"")";SE45;ESSESESS;1.00;SEK;'@SUM(1)`, "bank file guards formulas");

console.log("finance ok");
