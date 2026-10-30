import { expect, test, type Page } from "@playwright/test";
import { DRIVER, FLEET, OWNER, VEHICLE, fakeTripServer, signIn, type TripState } from "./live-fake";

/**
 * Owner G2c (2026-10-30, "Fix now (Recommended)"), admin re-check after #169 on live: real numbers only and "—" when the
 * server has none (1, 2), no config calls for the closed country TN or pricing history for standard-XX (3), every text
 * in sv/fr/en (4), the car's own categories and names instead of raw ids (5).
 */
const CAR_ID = "01JBXK7Q2M9V4T8RZ5N3W6Y1CD";
const CAR = {
  ...VEHICLE, vehicleId: CAR_ID, plate: "TST G2A", make: "Toyota", model: "Prius", year: 2012, categoryIds: ["economy", "child_seat"], status: "pending",
  ruleProblems: ["economy:year_too_old"], driverId: "D0610",
  documents: [{ documentId: "VD1", type: "vehicle_registration", status: "approved", expiresAt: "2027-05-31T00:00:00Z" }, { documentId: "VD2", type: "insurance", status: "in_review" }],
};
/** A driver with a server rating and terms date; the owner has neither. Ids end in digits, as on live (0609, 0610). */
const RATED = { ...DRIVER, driverId: "D0610", vehicleId: CAR_ID, rating: 4.62, termsAcceptedAt: "2026-10-20T09:00:00Z" } as typeof DRIVER;
const PERMS = ["overview.read", "drivers.read", "drivers.activate", "documents.approve", "vehicles.edit", "trips.read", "zones.read", "settings.read", "settings.edit"];
const SHOTS = process.env.G2C_SHOTS;
const PREFIX = process.env.G2C_PREFIX ?? "after";
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${PREFIX}-${name}.png`, fullPage: false }); };

async function start(page: Page, language = "en"): Promise<TripState> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const state = await fakeTripServer(page, {
    drivers: [RATED, { ...OWNER, driverId: "D0609" } as typeof DRIVER],
    fleets: [{ ...FLEET }],
    vehicles: [CAR as unknown as typeof VEHICLE],
    admin: { permissions: PERMS, language },
  });
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  return state;
}

test("1: the Drivers list shows the server's rating and — for trips, cancel rate and earnings; nothing from the id", async ({ page }) => {
  await start(page);
  await page.goto("/drivers");
  const rated = page.getByRole("row").filter({ hasText: "Anna" });
  await expect(rated).toBeVisible();
  await shot(page, "drivers");
  const cells = await rated.getByRole("cell").allInnerTexts();
  // Rating, Trips, Cancel %, Earnings (head order).
  expect(cells.slice(9, 13)).toEqual(["4.62", "—", "—", "—"]);
  const owner = await page.getByRole("row").filter({ hasText: "Bo Nord" }).getByRole("cell").allInnerTexts();
  expect(owner.slice(9, 13)).toEqual(["—", "—", "—", "—"]);
});

test("1, 2: the driver page's This month, Joined and Last online are the server's or —; no Not connected yet", async ({ page }) => {
  await start(page);
  await page.goto("/drivers/D0610");
  await expect(page.getByRole("heading", { level: 2, name: /Anna/ })).toBeVisible();
  const month = page.getByRole("tabpanel", { name: "Overview" }).getByTestId("live-driver-month");
  await expect(month).toContainText("4.62");
  await expect(month.locator(".fd-stat strong, strong").filter({ hasText: /^\d/ })).toHaveCount(1);
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
  await expect(page.locator(".fd-facts")).toContainText(/20 Oct 2026|Oct 20, 2026/);
  await month.scrollIntoViewIfNeeded();
  await shot(page, "driver");
  await page.goto("/drivers/D0609");
  await expect(page.getByRole("heading", { level: 2, name: /Bo/ })).toBeVisible();
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
  await expect(page.getByRole("tabpanel", { name: "Overview" }).getByTestId("live-driver-month")).not.toContainText(/\d/);
});

test("2: the live Content page has no Not connected yet badge", async ({ page }) => {
  await start(page);
  await page.goto("/content");
  await expect(page.getByRole("heading", { level: 2, name: "Content" })).toBeVisible();
  await shot(page, "content");
  await expect(page.getByTestId("not-connected")).toHaveCount(0);
});

test("3: no config call for the closed country TN and no pricing history for standard-XX", async ({ page }) => {
  const state = await start(page);
  for (const path of ["/drivers", "/pricing", "/dispatch/rules", "/vehicles", "/onboarding"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  const bad = state.calls.map((call) => call.path).filter((path) => /\/admin\/config\/.*(country=TN|zoneId=TN-)|\/admin\/config\/pricing\/history\?zoneId=standard-/.test(path));
  expect(bad).toEqual([]);
  expect(state.calls.some((call) => /\/admin\/config\/\w+\?(country=SE|zoneId=SE-)/.test(call.path)), "the open country is still read").toBe(true);
});

test("4, 5: the car page in Swedish: no English, the car's categories, plate and make instead of raw ids", async ({ page }) => {
  await start(page, "sv");
  await page.goto(`/vehicles/${CAR_ID}`);
  await expect(page.getByRole("heading", { level: 2, name: "TST G2A" })).toBeVisible();
  await shot(page, "car-sv");
  const main = page.locator("main");
  for (const english of ["Vehicle changes are not live", "Fits Movera", "Built 2012", "Registration and permit", "Insurance", "Photos", "All 4 approved"]) await expect(main).not.toContainText(english);
  await expect(page.getByTestId("vehicle-head-line")).not.toContainText(CAR_ID);
  await expect(page.getByTestId("vehicle-head-line")).toContainText("Toyota Prius");
  await expect(page.getByTestId("vehicle-categories")).toHaveText("Movera, Barnstol");
  await page.goto("/vehicles");
  await expect(page.getByRole("cell", { name: "TST G2A" })).toBeVisible();
  await shot(page, "vehicles-sv");
  await expect(main).not.toContainText("Should be on hold");
});

test("4: Onboarding steps and the driver page in Swedish: no days, Every, and, Scheduled rides on", async ({ page }) => {
  await start(page, "sv");
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Steg och papper" }).click();
  await expect(page.locator(".dx-num").first()).toBeVisible();
  await shot(page, "onboarding-steps-sv");
  const units = await page.locator(".dx-num").allInnerTexts();
  for (const text of units) expect(text).not.toMatch(/\b(days|Every|and|days before)\b/);
  await page.goto("/drivers/D0610");
  await expect(page.getByRole("heading", { level: 2, name: /Anna/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Scheduled rides on");
  await expect(page.locator("main")).not.toContainText("No vehicle");
  await page.getByText("Bokade resor för den här föraren", { exact: true }).scrollIntoViewIfNeeded();
  await shot(page, "driver-sv");
});
