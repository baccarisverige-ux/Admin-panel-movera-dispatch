import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMANDS } from "../commands/registry.ts";

/**
 * A2 leftovers (owner 2026-11-05, "Yes, remove all 3"; old admin #208 superseded):
 * Q1 "One admin always" => no second-admin approvals read; Q2 only "Add money to wallet" stays;
 * Q3 "Added to next ride" => no "Put rider on hold" and no ban list. Server endpoints stay (rule 21).
 */
const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Q2/Q3: the commands registry has none of the removed commands", () => {
  const ids = new Set(COMMANDS.map((c) => c.id));
  for (const id of ["admin.payment.issueVoucher", "admin.rider.credit", "admin.rider.hold", "admin.rider.ban"]) {
    assert.equal(ids.has(id), false, `${id} must be gone`);
  }
  const labels = COMMANDS.map((c) => c.label);
  for (const label of ["Issue wallet voucher", "Credit wallet", "Put rider on hold", "Add to ban list"]) assert.equal(labels.includes(label), false, label);
  assert.ok(ids.has("admin.rider.walletCredit"), "Add money to wallet stays");
});

test("Q3: the rider page shows no hold and no ban list", () => {
  const page = src("pages/RiderDetailPage.tsx");
  for (const text of ["admin.rider.hold", "Put on hold", "admin.rider.ban", "Ban list", "ban list", "Ban phone number", "Ban card"]) {
    assert.equal(page.includes(text), false, `rider page still has "${text}"`);
  }
});

test("Q2: the payments page has no wallet voucher issue", () => {
  assert.equal(src("pages/PaymentsPage.tsx").includes("admin.payment.issueVoucher"), false);
});

test("Q1: the audit page and the alerts make no approvals call", () => {
  assert.equal(/export function useApprovals/.test(src("api/hooks.ts")), false, "useApprovals is gone");
  for (const file of ["pages/AuditPage.tsx", "alerts/useAlerts.ts", "pages/PaymentPage.tsx", "pages/ConfirmPage.tsx", "pages/DashboardPage.tsx"]) {
    const text = src(file);
    assert.equal(/useApprovals|api\.approvals\(/.test(text), false, `${file} still reads approvals`);
  }
  const audit = src("pages/AuditPage.tsx");
  for (const text of ["Waiting for a second admin", "Pending approvals", "admin.approval.approve"]) assert.equal(audit.includes(text), false, `audit page still has "${text}"`);
});
