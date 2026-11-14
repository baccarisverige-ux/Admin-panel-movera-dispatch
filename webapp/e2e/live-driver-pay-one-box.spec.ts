import { expect, test, type Page } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, COMPLETED_TRIP, RIDERS, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * BQ-A28 (owner "Add jobs" 2026-11-14, owner rule "screens must be simple"; Rules audits/impact/j6-driverpay-supervisor.md):
 * the live trip page shows ONE driver pay box, the one that works now. During the trip "Driver pay" (J6a, POST …/adjust);
 * after the end "Change the driver's pay" (+/−, POST …/driver-pay). The other is not on the page. One wording in sv.
 * Rule 36: written before the code. A28_SHOTS=<dir> also saves the after screenshots.
 */

// The after screenshots are sharp (2x); the checks do not depend on it.
test.use({ deviceScaleFactor: 2 });

const A28_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "dispatch.edit", "trips.intervene", "payments.refund", "finance.read"] };
const ON_TRIP = { ...ACTIVE_TRIP, tripId: "T2028", driverId: "D1001", driver: COMPLETED_TRIP.driver };
const ENDED = { ...COMPLETED_TRIP, tripId: "T2029" };

async function open(page: Page, path: string, language?: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { ...A28_ADMIN, ...(language ? { language } : {}) }, trips: [structuredClone(ON_TRIP), structuredClone(ENDED)] as never, riders: [{ ...RIDERS[0] }, { ...RIDERS[1] }] });
  await fakeSettings(page);
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  await page.goto(path);
}

async function shot(page: Page, name: string) {
  const dir = process.env.A28_SHOTS;
  if (!dir) return;
  // A tall window, so the whole Actions part fits without scrolling under the sticky top bar.
  await page.setViewportSize({ width: 1440, height: 5200 });
  const actions = page.locator("#actions");
  await actions.screenshot({ path: `${dir}/${name}.png` });
}

test("A28: during the trip only the Driver pay box, no +/− change box", async ({ page }) => {
  await open(page, "/trips/T2028");
  await expect(page.getByLabel("Driver pay", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save driver pay" })).toBeVisible();
  await expect(page.getByTestId("live-trip-money")).toBeVisible();
  await expect(page.getByLabel("Driver pay change")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change pay" })).toHaveCount(0);
  await expect(page.getByText("Change the driver's pay")).toHaveCount(0);
  await shot(page, "A28-during-trip-en");
});

test("A28: after the end only the change box, no Driver pay field that cannot save", async ({ page }) => {
  await open(page, "/trips/T2029");
  await expect(page.getByTestId("live-trip-money").getByLabel("Driver pay change")).toBeEnabled();
  await expect(page.getByText("Change the driver's pay")).toBeVisible();
  await expect(page.getByLabel("Driver pay", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save driver pay" })).toHaveCount(0);
  await expect(page.getByTestId("adjust-block")).toHaveCount(0);
  await shot(page, "A28-after-end-en");
});

test("A28: sv uses one word, Förarersättning, in the box that shows (during and after)", async ({ page }) => {
  await open(page, "/trips/T2028", "sv");
  await expect(page.getByLabel("Förarersättning", { exact: true })).toBeVisible();
  await expect(page.locator("#actions")).not.toContainText("Förarlön");
  await shot(page, "A28-during-trip-sv");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trips/T2029");
  await expect(page.getByText("Ändra förarersättning").first()).toBeVisible();
  await expect(page.locator("#actions")).not.toContainText("Förarlön");
  await expect(page.locator("#actions")).not.toContainText("Ändrad förarersättning");
  await shot(page, "A28-after-end-sv");
});
