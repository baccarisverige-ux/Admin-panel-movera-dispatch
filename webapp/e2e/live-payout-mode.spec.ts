import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, PAYOUTS, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * v0.18.16 A2 (owner build-spec Q4 "automatic or manual", G10-2 schedule; contract.json#payoutMode): Payouts shows the
 * country's payout settings (mode + schedule) and publishes them in the Standard's CountryRules; a manual run waits
 * for one admin's approval and cannot be marked paid before.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
async function signInWarm(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").waitFor({ timeout: 60_000 });
  await signIn(page).catch(async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible({ timeout: 60_000 });
  });
}
test.setTimeout(120_000);
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page) {
  if (!(await modal(page).count())) return;
  const reason = modal(page).getByLabel(/^Reason$/);
  if (await reason.count()) {
    if ((await reason.evaluate((el) => el.tagName)) === "SELECT") await reason.selectOption({ index: 1 });
    else await reason.fill("Checked the run");
  }
  await modal(page).getByRole("button", { name: "Confirm" }).click();
}
const PERMS = [...ADMIN.permissions, "finance.edit", "settings.read", "settings.edit", "settings.publish"];

test("SE: switch to Manual, every 2 weeks on Friday 16:30; it is published in the Standard and keeps the tips", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: PERMS } });
  const server = await fakeSettings(page);
  await signInWarm(page);
  await page.goto("/payouts");
  const box = page.getByTestId("live-payout-settings");
  await expect(box.getByLabel("Automatic: on the schedule")).toBeChecked();
  await expect(box.getByLabel("How often")).toHaveValue("weekly");
  await expect(box.getByLabel("Payout day")).toHaveValue("monday");
  await expect(box.getByLabel("Payout time")).toHaveValue("08:00");
  await expect(box.getByRole("button", { name: "Publish payout settings" })).toBeDisabled();
  await box.getByLabel("Manual: an admin approves each run").check();
  await box.getByLabel("How often").selectOption("every_2_weeks");
  await box.getByLabel("Payout day").selectOption("friday");
  await box.getByLabel("Payout time").fill("16:30");
  server.sent.length = 0;
  await box.getByRole("button", { name: "Publish payout settings" }).click();
  await confirm(page);
  await expect(box.getByText("Payout settings published.")).toBeVisible();
  const put = server.sent.find((s) => s.method === "PUT" && s.path.includes("country_rules"));
  expect(put?.body).toMatchObject({ country: "SE", document: { payoutMode: "manual", payoutSchedule: { frequency: "every_2_weeks", day: "friday", time: "16:30" }, tips: [{ amount: { amountMinor: 1000 } }, {}, {}] } });
  expect(server.sent.some((s) => s.method === "POST" && s.path.includes("country_rules/publish"))).toBe(true);
});

test("a manual run waits: Mark as paid is off, Approve run sends country + period; after it the payout can be paid", async ({ page }) => {
  const waiting = { ...PAYOUTS[0]!, payoutId: "PY9", status: "pending_approval", amount: { amountMinor: 10_000, currency: "SEK" } };
  const state = await fakeTripServer(page, { admin: { permissions: PERMS }, payouts: [waiting] });
  await fakeSettings(page);
  const approved: Record<string, unknown>[] = [];
  await page.route(`${API}/api/v1/admin/payouts/runs/approve`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    approved.push(body);
    state.payouts[0] = { ...state.payouts[0]!, status: "pending" };
    return json(route, 200, { country: "SE", periodEnd: body["periodEnd"], approved: 1, total: [{ amountMinor: 10_000, currency: "SEK" }] });
  });
  await signInWarm(page);
  await page.goto("/payouts");
  const runs = page.getByTestId("live-payout-runs");
  await expect(runs).toContainText("1 drivers");
  await expect(page.getByTestId("live-payout-list")).toContainText("Waiting for approval");
  await expect(page.getByTestId("live-payout-detail").getByRole("button", { name: "Mark as paid" })).toBeDisabled();
  await runs.getByRole("button", { name: "Approve run" }).click();
  await confirm(page);
  await expect.poll(() => approved.length).toBe(1);
  // BQ-V38 (v0.18.102): the count and total of the run the admin sees go with it.
  expect(approved[0]).toEqual({ country: "SE", periodEnd: waiting.periodEnd, expectedCount: 1, expectedTotal: [{ amountMinor: 10_000, currency: "SEK" }], reason: "Amount and details are correct" });
  await expect(page.getByText("Run approved: the payouts can be paid.")).toBeVisible();
  await expect(page.getByTestId("live-payout-runs")).toHaveCount(0);
  await expect(page.getByTestId("live-payout-detail").getByRole("button", { name: "Mark as paid" })).toBeEnabled();
});

test("BQ-V38: a run that changed while the admin looked is refused (409 run_changed): the page says why with the fresh count and total, and Approve again sends them", async ({ page }) => {
  const waiting = { ...PAYOUTS[0]!, payoutId: "PY9", status: "pending_approval", amount: { amountMinor: 10_000, currency: "SEK" } };
  const state = await fakeTripServer(page, { admin: { permissions: PERMS }, payouts: [waiting] });
  await fakeSettings(page);
  const approved: Record<string, unknown>[] = [];
  await page.route(`${API}/api/v1/admin/payouts/runs/approve`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    approved.push(body);
    const card = { country: "SE", periodEnd: waiting.periodEnd, count: 2, total: [{ amountMinor: 15_000, currency: "SEK" }] };
    if (body["expectedCount"] !== 2) return json(route, 409, { code: "conflict", message: "The run changed since you looked at it.", requestId: "req_v38", retryable: false, reason: "run_changed", projection: card });
    state.payouts[0] = { ...state.payouts[0]!, status: "pending" };
    return json(route, 200, { country: "SE", periodEnd: waiting.periodEnd, approved: 2, total: card.total });
  });
  await signInWarm(page);
  await page.goto("/payouts");
  const runs = page.getByTestId("live-payout-runs");
  await runs.getByRole("button", { name: "Approve run" }).click();
  await confirm(page);
  await expect.poll(() => approved.length).toBe(1);
  await expect(page.getByText("The run changed while you looked. Payouts now: 2. To pay now: 150,00 kr. It was reloaded; check it and approve again.")).toBeVisible();
  await expect(runs.getByTestId("live-payout-run-fresh")).toHaveText("Server now: 2 payouts · 150,00 kr");
  expect(state.payouts[0]!.status).toBe("pending_approval");
  await runs.getByRole("button", { name: "Approve run" }).click();
  await confirm(page);
  await expect.poll(() => approved.length).toBe(2);
  expect(approved[1]).toMatchObject({ country: "SE", periodEnd: waiting.periodEnd, expectedCount: 2, expectedTotal: [{ amountMinor: 15_000, currency: "SEK" }] });
  await expect(page.getByText("Run approved: the payouts can be paid.")).toBeVisible();
});

test("without settings.publish the payout settings are read-only; without finance.edit Approve run is off", async ({ page }) => {
  const waiting = { ...PAYOUTS[0]!, payoutId: "PY9", status: "pending_approval" };
  await fakeTripServer(page, { payouts: [waiting] });
  await fakeSettings(page);
  await signInWarm(page);
  await page.goto("/payouts");
  await expect(page.getByTestId("live-payout-settings").getByLabel("How often")).toBeDisabled();
  await expect(page.getByTestId("live-payout-runs").getByRole("button", { name: "Approve run" })).toBeDisabled();
});
