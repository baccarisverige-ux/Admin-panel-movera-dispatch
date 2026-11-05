import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, DRIVER, fakeTripServer, signIn } from "./live-fake";

/** v0.18.16 A2 (owner build-spec Q4): pause and release one driver's payouts from his profile, with the reason. */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page) {
  const reason = modal(page).getByLabel(/^Reason$/);
  if (await reason.count()) {
    if ((await reason.evaluate((el) => el.tagName)) === "SELECT") await reason.selectOption({ index: 1 });
    else await reason.fill("Bank check");
  }
  const typed = modal(page).getByLabel(/^Type .+ to confirm$/);
  if (await typed.count()) await typed.fill(DRIVER.driverId);
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

test("pause then release reach the server with the reason; the profile shows the pause", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: [...ADMIN.permissions, "finance.edit"] } });
  const sent: Record<string, unknown>[] = [];
  await page.route(`${API}/api/v1/admin/drivers/*/payout-hold`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    const index = state.drivers.findIndex((d) => d.driverId === DRIVER.driverId);
    const next = { ...state.drivers[index]!, ...(body["held"] ? { payoutHold: { reason: body["reason"], at: "2026-10-26T09:00:00Z" } } : { payoutHold: undefined }) };
    state.drivers[index] = next as never;
    return json(route, 200, next);
  });
  await signInWarm(page);
  await page.goto(`/drivers/${DRIVER.driverId}`);
  const box = page.getByTestId("payout-hold");
  await expect(box).toContainText("Payouts run on the country's schedule.");
  await box.getByRole("button", { name: "Pause payouts" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ held: true });
  expect(String(sent[0]!["reason"]).length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId("payout-hold-state")).toContainText("Payouts paused");
  await page.getByTestId("payout-hold").getByRole("button", { name: "Release payouts" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ held: false });
});

test("without finance.edit the button is off", async ({ page }) => {
  await fakeTripServer(page);
  await signInWarm(page);
  await page.goto(`/drivers/${DRIVER.driverId}`);
  await expect(page.getByTestId("payout-hold").getByRole("button", { name: "Pause payouts" })).toBeDisabled();
});
