import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCEL_REASON_CODES,
  CONTRACT_VERSION,
  DRIVER_ASSIGNED_STATUSES,
  RIDER_ONBOARD_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  TRIP_STATUSES,
  isCancelReasonCode,
  isTerminal,
  nextStatus,
  type Actor,
  type TripCommand,
  type TripKind,
} from "../domain/contract.ts";
import { contractJson } from "./load.ts";

type Contract = {
  version: string;
  tripStatus: { values: string[]; terminal: string[]; driverAssigned: string[]; riderOnboard: string[] };
  transitions: { command: string; actor: string; from: string[]; to: string; when?: string }[];
  cancelReasons: Record<string, string[]>;
};
type Scenarios = { scenarios: { id: string; kind: TripKind; steps: [TripCommand, Actor, string][] }[] };

const contract = contractJson<Contract>("contract.json");

test("trip statuses, terminal set and groups equal contract.json", () => {
  assert.equal(CONTRACT_VERSION, contract.version);
  assert.deepEqual([...TRIP_STATUSES], contract.tripStatus.values);
  assert.deepEqual([...TERMINAL_STATUSES], contract.tripStatus.terminal);
  assert.deepEqual([...DRIVER_ASSIGNED_STATUSES], contract.tripStatus.driverAssigned);
  assert.deepEqual([...RIDER_ONBOARD_STATUSES], contract.tripStatus.riderOnboard);
  for (const status of TRIP_STATUSES) assert.equal(isTerminal(status), contract.tripStatus.terminal.includes(status), status);
});

test("transition table equals contract.json#transitions entry for entry", () => {
  const ours = TRANSITIONS.map(({ command, actor, from, to, when }) => ({ command, actor, from: [...from], to, ...(when ? { when } : {}) }));
  const theirs = contract.transitions.map(({ command, actor, from, to, when }) => ({ command, actor, from, to, ...(when ? { when } : {}) }));
  assert.deepEqual(ours, theirs);
  for (const rule of TRANSITIONS) for (const from of rule.from) assert.ok(!isTerminal(from), `${rule.command} leaves terminal ${from}`);
});

test("fixtures/scenarios.json replays identically", () => {
  const { scenarios } = contractJson<Scenarios>("fixtures/scenarios.json");
  assert.ok(scenarios.length >= 18);
  for (const scenario of scenarios) {
    let status: string = "draft";
    scenario.steps.forEach(([command, actor, expect], index) => {
      const next = nextStatus(status, command, actor, scenario.kind);
      assert.equal(next ?? "invalid_transition", expect, `${scenario.id} step ${index + 1}: ${command} by ${actor} from ${status}`);
      if (next) status = next;
    });
  }
});

test("cancel reason registry equals contract.json#cancelReasons", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(CANCEL_REASON_CODES)), contract.cancelReasons);
  assert.ok(isCancelReasonCode("admin_safety", "admin") && !isCancelReasonCode("admin_safety", "driver") && !isCancelReasonCode("made_up"));
});

test("Dispatch › Cancel reasons (the one editor) ships exactly the contract codes per group", async () => {
  const { cancelReasonsDefault, completeCancelReasons, cancelReasonsFor } = await import("../dispatch/offers.ts");
  const book = cancelReasonsDefault();
  const codes = (list: { code: string }[]) => list.map((item) => item.code);
  for (const [group, list] of Object.entries(book.groups)) assert.deepEqual(codes(list), contract.cancelReasons[group], group);
  assert.deepEqual([book.noShow.code], contract.cancelReasons.noShow);
  // Fixed groups (admin, system) cannot drift from the contract through an old or edited save; texts survive.
  const saved = completeCancelReasons({ groups: { admin: [{ code: "admin_fraud", title: { en: "Fraud" } }, { code: "admin_made_up", title: { en: "x" } }] } });
  assert.deepEqual(codes(saved.groups.admin), contract.cancelReasons.admin);
  assert.equal(saved.groups.admin.find((item) => item.code === "admin_fraud")!.title.en, "Fraud");
  assert.ok(!("admin" in cancelReasonsFor(book, "en").groups), "the driver app export leaves out admin and system reasons");
});
