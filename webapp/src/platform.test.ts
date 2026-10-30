import assert from "node:assert/strict";
import test from "node:test";
import { OPEN_VALUES } from "./config/confirm.ts";
import { areaOf, auditCounts, auditCsv, changeOf, filterAudit, EMPTY_FILTERS } from "./platform/audit.ts";
import { decisionError, inboxItems } from "./platform/inbox.ts";
import { emptyPanelOps, normalizePanelOps, showInMenu } from "./platform/panel.ts";
import { emptyTeamOps, limitError, newRole, normalizeTeamOps, permissionsOf, placeOf, removeRole, roleChanges, roleError, saveRole, securityError } from "./platform/team.ts";

const row = (id: string, patch: Record<string, string> = {}) => ({ id, operationId: `op-${id}`, at: "2026-10-12T10:00:00.000Z", actorId: "nora", action: "admin.config.save", targetId: "configuration", scope: "SE", before: "1", after: "2", reason: "", result: "committed" as const, ...patch });

test("audit: search, filters, what changed and export", () => {
  const rows = [row("a"), row("b", { actorId: "lena", action: "admin.payment.refund", targetId: "PAY0200", result: "pending_approval" }), row("c", { at: "2026-10-01T09:00:00.000Z", before: "x", after: "x" })] as never[];
  assert.equal(areaOf("admin.growthOps.save"), "growth");
  assert.equal(areaOf("admin.auditLog.view"), "audit log");
  assert.deepEqual(filterAudit(rows, { ...EMPTY_FILTERS, actor: "lena" }).map((r: { id: string }) => r.id), ["b"]);
  assert.deepEqual(filterAudit(rows, { ...EMPTY_FILTERS, query: "pay0200" }).map((r: { id: string }) => r.id), ["b"]);
  assert.deepEqual(filterAudit(rows, { ...EMPTY_FILTERS, from: "2026-10-05" }).map((r: { id: string }) => r.id), ["a", "b"]);
  assert.deepEqual(filterAudit(rows, { ...EMPTY_FILTERS, area: "payment" }).map((r: { id: string }) => r.id), ["b"]);
  assert.equal(changeOf(row("x")), "1 → 2");
  assert.equal(changeOf(row("x", { before: "x", after: "x" })), null);
  const csv = auditCsv(rows);
  assert.match(csv.split("\n")[0], /^When,Admin,Action/);
  assert.match(csv, /Waiting for a second admin/);
  assert.equal(auditCounts(rows).waiting, 1);
  assert.equal(auditCounts(rows).admins, 2);
  // G3 (owner 2026-10-30): the Admins count never counts "system" (auto-offline lines) or a driver/rider actor.
  const withSystem = [...rows, row("s", { actorId: "system", action: "driver.auto_offline" }), row("t", { actorId: "SYS", actor: "system" }), row("u", { actorId: "D1001", actor: "driver" })] as never[];
  assert.equal(auditCounts(withSystem).admins, 2);
});

test("menu: developer pages only for the Super admin with the switch on", () => {
  const off = emptyPanelOps();
  const on = { ...off, devPages: true };
  assert.equal(showInMenu("system", "super", off), false);
  assert.equal(showInMenu("system", "super", on), true);
  assert.equal(showInMenu("gates", "ops", on), false);
  assert.equal(showInMenu("team", "ops", off), true);
  assert.equal(normalizePanelOps({ devPages: "yes" }).devPages, false);
});

test("to confirm: one inbox for money, settings and product values", () => {
  const approvals = [{ id: "approval-1", action: "admin.payment.refund", targetId: "PAY0200", requestedBy: "nora", amountOre: 25000, reason: "Duplicate", status: "pending" as const }, { id: "approval-2", action: "admin.payout.approve", targetId: "RUN-1", requestedBy: "lena", amountOre: 100, reason: "", status: "approved" as const }];
  const items = inboxItems({ approvals, config: { status: "in_review", authorId: "lena", approverId: null, rev: 2 }, values: OPEN_VALUES.slice(0, 3), decisions: { [OPEN_VALUES[0].id]: { value: "8 s", note: "", by: "nora", at: "x" } }, me: "nora", money: (minor) => `${minor / 100} kr` });
  assert.deepEqual(items.map((item) => item.kind), ["money", "settings", "value", "value"]);
  assert.equal(items[0].mine, true);
  assert.equal(items[0].link, "/payments/PAY0200");
  assert.match(items[0].title, /250 kr/);
  assert.equal(items[1].mine, false);
  assert.equal(inboxItems({ approvals: [], config: { status: "draft", authorId: "nora", approverId: null, rev: 1 }, values: [], decisions: {}, me: "nora", money: String }).length, 0);
  assert.match(decisionError(" ") ?? "", /Write the value/);
  // Offer time and search distance are set in Dispatch only; the inbox points there and shows no second number.
  const dispatchValues = OPEN_VALUES.filter((item) => ["offer-time", "search-radius", "next-trip"].includes(item.id));
  assert.ok(dispatchValues.length === 3 && dispatchValues.every((item) => item.link?.startsWith("/dispatch") && !/\d/.test(item.today)));
  const pointed = inboxItems({ approvals: [], config: { status: "draft", authorId: "nora", approverId: null, rev: 1 }, values: OPEN_VALUES.filter((item) => item.id === "offer-time" || item.id === "horizon" || item.id === "tips"), decisions: {}, me: "nora", money: String });
  // Round 2: tips have a real setting per country now, so the inbox points to Pricing › Tips & limits.
  assert.deepEqual(pointed.map((item) => item.link), ["/dispatch", "/dispatch?tab=reservations", "/pricing?tab=extras&section=tips"]);
});

test("team: custom roles, limits, sign-in safety and places", () => {
  const ops = emptyTeamOps();
  assert.ok(permissionsOf("super").includes("team.edit"));
  assert.ok(!permissionsOf("viewer").includes("trips.intervene"));
  const role = newRole("support", "nora", Date.parse("2026-10-12T10:00:00Z"));
  assert.match(roleError(role, []) ?? "", /name/);
  assert.match(roleError({ ...role, name: "Support agent" }, []) ?? "", /exists/);
  assert.match(roleError({ ...role, name: "Night support", permissions: role.permissions.filter((id) => id !== "overview.read") }, []) ?? "", /dashboard/);
  const saved = saveRole(ops, { ...role, name: " Night support ", permissions: [...role.permissions, "trips.intervene"] });
  assert.equal(saved.error, undefined);
  assert.equal(saved.ops.customRoles[0].name, "Night support");
  assert.deepEqual(roleChanges(saved.ops.customRoles[0]).added, ["trips.intervene"]);
  const assigned = { ...saved.ops, assigned: { maja: role.id } };
  assert.deepEqual(removeRole(assigned, role.id).assigned, {});
  assert.match(limitError({ ...ops.limits.support, refund: { on: true, max: 0 } }) ?? "", /more than zero/);
  assert.match(securityError({ ...ops.security, idle: { on: true, minutes: 2 } }) ?? "", /5 to 240/);
  assert.match(securityError({ ...ops.security, twoStep: { ...ops.security.twoStep, super: false } }) ?? "", /Super admin/);
  assert.equal(normalizeTeamOps({ security: { idle: { minutes: 30 } } }).security.idle.on, true);
  assert.equal(placeOf({ zones: "all", countries: ["FR"] }), "France");
  assert.equal(placeOf({ zones: ["Z001", "Z002"] }), "2 zones");
});
