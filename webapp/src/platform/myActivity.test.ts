import assert from "node:assert/strict";
import test from "node:test";
import type { AuditRow } from "../api/seed.ts";
import type { Activity } from "../reports/activityLog.ts";
import { ACTIVITY_VISIBLE_DAYS, activityCsv, activityItems, sessionStart, visibleActivity } from "./myActivity.ts";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const row = (id: string, actorId: string, at: string, result: AuditRow["result"]): AuditRow => ({ id, operationId: `op-${id}`, at, actorId, action: "admin.trip.cancel", targetId: "T0001", scope: "Z001", before: "searching", after: "cancelled", reason: "Duplicate request", result });
const audits = [row("a1", "lena", ago(0), "committed"), row("a2", "lena", ago(1), "denied"), row("a3", "lena", ago(130), "committed"), row("a4", "nora", ago(2), "pending_approval")];
const log: Activity[] = [
  { id: "s1", at: ago(3), actorId: "lena", kind: "signin", what: "Signed in" },
  { id: "s2", at: ago(2.5), actorId: "lena", kind: "signout", what: "Signed out" },
  { id: "s3", at: ago(0.5), actorId: "lena", kind: "signin", what: "Signed in" },
  { id: "e1", at: ago(0.2), actorId: "lena", kind: "export", what: "Trips report" },
];
const items = activityItems(audits, log, (action) => (action === "admin.trip.cancel" ? "Cancel trip" : action));

test("Q31: an admin sees only their own actions, done and failed, with the details", () => {
  const { visible } = visibleActivity(items, { viewerId: "lena", seeAll: false, actorId: "nora", now: NOW });
  assert.ok(visible.every((item) => item.actorId === "lena"), "the actor filter is ignored for a non-super admin");
  const cancel = visible.find((item) => item.id === "a1")!;
  assert.equal(cancel.status, "done");
  assert.equal(cancel.what, "Cancel trip");
  assert.equal(cancel.reason, "Duplicate request");
  assert.equal(cancel.link, "/trips/T0001");
  assert.equal(visible.find((item) => item.id === "a2")!.status, "failed");
  assert.ok(visible.some((item) => item.id === "e1" && item.what === "Downloaded Trips report"));
});

test("Q31: a super admin sees every admin, and can narrow to one", () => {
  const all = visibleActivity(items, { viewerId: "nora", seeAll: true, now: NOW }).visible;
  assert.deepEqual([...new Set(all.map((item) => item.actorId))].sort(), ["lena", "nora"]);
  assert.equal(all.find((item) => item.id === "a4")!.status, "waiting");
  const one = visibleActivity(items, { viewerId: "nora", seeAll: true, actorId: "lena", now: NOW }).visible;
  assert.ok(one.every((item) => item.actorId === "lena"));
});

test("Q32: 120 days stay visible, older entries are archived", () => {
  assert.equal(ACTIVITY_VISIBLE_DAYS, 120);
  const { visible, archived } = visibleActivity(items, { viewerId: "lena", seeAll: false, now: NOW });
  assert.deepEqual(archived.map((item) => item.id), ["a3"]);
  assert.ok(!visible.some((item) => item.id === "a3"));
});

test("Q31: the current session starts at the last sign-in without a sign-out after it", () => {
  assert.equal(sessionStart(log, "lena"), Date.parse(ago(0.5)));
  assert.equal(sessionStart(log, "nora"), null);
});

test("Q32: the CSV export has every detail and is formula-safe", () => {
  const csv = activityCsv(items.filter((item) => item.id === "a1" || item.id === "a2"), (id) => (id === "lena" ? "Lena Berg" : id));
  const lines = csv.split("\n");
  assert.equal(lines[0], "When,Admin,Section,Action,Target,Scope,Before,After,Reason,Status,Result,Operation");
  assert.match(lines[1], /Lena Berg,Trips,Cancel trip,T0001,Z001,searching,cancelled,Duplicate request,Done,Done,op-a1/);
  assert.match(lines[2], /Failed,Not allowed,op-a2/);
});
