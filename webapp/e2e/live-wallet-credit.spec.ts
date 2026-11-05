import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, fakeTripServer, signIn } from "./live-fake";

/**
 * v0.18.16 A2 (owner G12 Q5, Q-D, build-spec Q1/Q2; contract.json#walletCredit): Add money to wallet is the one way to
 * give a rider money; it reaches POST /admin/riders/{riderId}/wallet-credit in the rider's currency with the reason,
 * and the server's refusals are explained.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page) {
  const reason = modal(page).getByLabel(/^Reason$/);
  if (await reason.count()) {
    if ((await reason.evaluate((el) => el.tagName)) === "SELECT") await reason.selectOption({ index: 1 });
    else await reason.fill("Driver was late");
  }
  const note = modal(page).getByLabel(/^Note/);
  if (await note.count()) await note.fill("Driver was late");
  const typed = modal(page).getByLabel(/^Type .+ to confirm$/);
  if (await typed.count()) await typed.fill("R501");
  await modal(page).getByRole("button", { name: "Confirm" }).click();
}
async function signInWarm(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").waitFor({ timeout: 60_000 });
  await signIn(page).catch(async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible({ timeout: 60_000 });
  });
}
test.setTimeout(120_000);

test("SE: 150 kr with a reason reaches the server; the balance follows; too large is explained", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: [...ADMIN.permissions, "finance.edit"] } });
  const sent: Record<string, unknown>[] = [];
  await page.route(`${API}/api/v1/admin/riders/*/wallet-credit`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as { amount: { amountMinor: number; currency: string }; reason: string };
    sent.push(body);
    if (body.amount.amountMinor > 290_000) return json(route, 400, { code: "invalid_request", message: "too large", requestId: "r", retryable: false, reason: "wallet_credit_too_large", details: [] });
    const index = state.riders.findIndex((rider) => rider["riderId"] === "R501");
    const wallet = state.riders[index]!["wallet"] as { amountMinor: number; currency: string };
    state.riders[index] = { ...state.riders[index]!, version: Number(state.riders[index]!["version"]) + 1, wallet: { amountMinor: wallet.amountMinor + body.amount.amountMinor, currency: "SEK" } };
    return json(route, 200, state.riders[index]);
  });
  await signInWarm(page);
  await page.goto("/riders/R501?tab=wallet");
  const box = page.getByTestId("live-wallet-credit");
  await expect(box.getByTestId("live-wallet-balance")).toContainText("50");
  await expect(box.getByRole("button", { name: "Add money to wallet" })).toBeDisabled();
  await box.getByLabel("Wallet amount").fill("150");
  await box.getByRole("button", { name: "Add money to wallet" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ amount: { amountMinor: 15_000, currency: "SEK" } });
  expect(String(sent[0]!["reason"]).length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId("live-wallet-balance")).toContainText("200");

  await page.getByTestId("live-wallet-credit").getByLabel("Wallet amount").fill("3000");
  await page.getByTestId("live-wallet-credit").getByRole("button", { name: "Add money to wallet" }).click();
  await confirm(page);
  await expect(page.getByText("That is more than one credit may be in this country (Trip settings).").first()).toBeVisible();
});

test("without finance.edit the amount and button are off; no voucher or credit-wallet elsewhere", async ({ page }) => {
  await fakeTripServer(page);
  await signInWarm(page);
  await page.goto("/riders/R501?tab=wallet");
  await expect(page.getByTestId("live-wallet-credit").getByRole("button", { name: "Add money to wallet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Credit wallet|Issue wallet voucher/ })).toHaveCount(0);
});
