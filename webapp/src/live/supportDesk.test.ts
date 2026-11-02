import assert from "node:assert/strict";
import test from "node:test";
import { deskCall, settingsIssue } from "./supportDesk.ts";
import type { SupportSettings } from "./types.ts";

// v0.18.15 (owner QO-5 claim / assign now; rule 16 settings with defaults): the live desk calls the server's commands.
test("every desk button calls its server command for the ticket", () => {
  assert.deepEqual(deskCall("tkt 1", "claim"), { path: "/admin/tickets/tkt%201/claim", body: {} });
  assert.deepEqual(deskCall("T", "assign", { adminId: null, reason: "x" }), { path: "/admin/tickets/T/assign", body: { adminId: null, reason: "x" } });
  for (const verb of ["topic", "waiting", "solve", "reopen", "case"] as const) assert.equal(deskCall("T", verb).path, `/admin/tickets/T/${verb}`);
});

test("support settings are checked like the server checks them", () => {
  const ok: SupportSettings = { country: "SE", claimDays: 3, replyAfterSolved: "reopen", topics: [{ code: "help", on: true, firstReplyMin: 120, solveHours: 48 }] };
  assert.equal(settingsIssue(ok), null);
  assert.ok(settingsIssue({ ...ok, claimDays: 0 }));
  assert.ok(settingsIssue({ ...ok, topics: [{ ...ok.topics[0]!, on: false }] }));
  assert.ok(settingsIssue({ ...ok, topics: [{ ...ok.topics[0]!, firstReplyMin: 0 }] }));
  assert.ok(settingsIssue({ ...ok, topics: [{ ...ok.topics[0]!, solveHours: 721 }] }));
});
