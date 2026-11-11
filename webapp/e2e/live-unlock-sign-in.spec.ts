import { expect, test, type Page } from "@playwright/test";
import { ADMIN, DRIVER, fakeTripServer, signIn } from "./live-fake";

/** Owner 2026-11-11 (AUDIT-A16 §7): "Unlock sign-in" on the driver and rider pages calls POST /admin/auth/sign-in-locks/unlock { phone }. */
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page, id: string) {
  await modal(page).getByLabel(/^Type .+ to confirm$/).fill(id);
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
const EDIT = { admin: { permissions: [...ADMIN.permissions, "settings.edit"] } };
test.setTimeout(120_000);

test("rider: the full phone is sent and the lock is lifted", async ({ page }) => {
  const state = await fakeTripServer(page, { ...EDIT, signInLocks: ["+46700000501"] });
  await signInWarm(page);
  await page.goto("/riders/R501");
  const box = page.getByTestId("unlock-sign-in");
  await box.getByRole("button", { name: "Unlock sign-in" }).click();
  await expect(modal(page)).toContainText("Lift the wrong-code lock");
  await confirm(page, "R501");
  await expect.poll(() => state.unlocked ?? []).toEqual(["+46700000501"]);
  await expect(page.getByText("Sign-in unlocked: the number can get codes again.")).toBeVisible();
});

test("driver: the phone is revealed with the reason, then unlocked; no lock says so", async ({ page }) => {
  const state = await fakeTripServer(page, EDIT);
  await signInWarm(page);
  await page.goto(`/drivers/${DRIVER.driverId}`);
  await page.getByTestId("unlock-sign-in").getByRole("button", { name: "Unlock sign-in" }).click();
  await confirm(page, DRIVER.driverId);
  await expect.poll(() => state.unlocked ?? []).toEqual(["+46701110001"]);
  await expect(page.getByText("This number had no sign-in lock.")).toBeVisible();
});

test("without settings.edit there is no button", async ({ page }) => {
  await fakeTripServer(page);
  await signInWarm(page);
  await page.goto(`/drivers/${DRIVER.driverId}`);
  await expect(page.getByTestId("payout-hold")).toBeVisible();
  await expect(page.getByTestId("unlock-sign-in")).toHaveCount(0);
});
