import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * Audit phase 5 (admin): the live Trips list and trip detail (GET /admin/trips, GET /admin/trips/{id},
 * GET /admin/trips/{id}/offers, POST /admin/trips/{id}/refund) and the demo pages marked "not live", against a
 * faked server (e2e/live-fake.ts).
 */

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

test("trips list: rows from the server, tabs filter, search, load more, open a trip", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.getByRole("link", { name: "Trips", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  const rows = page.locator("tr[data-trip-id]");
  await expect(rows).toHaveCount(2);
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("Completed");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("R501");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("Anna");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("ABC 123");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("520,00 kr");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows).toHaveCount(3);
  expect(state.calls.filter((call) => call.path.includes("cursor=c2"))).toHaveLength(1);

  await page.getByRole("tab", { name: "Cancelled" }).click();
  await expect.poll(() => state.calls.some((call) => call.path.includes("status=cancelled_by_rider"))).toBe(true);
  await expect(rows).toHaveCount(1);
  await expect(page.locator('tr[data-trip-id="T2003"]')).toBeVisible();
  await page.getByRole("tab", { name: "All" }).click();

  await page.getByLabel("Search by trip, rider or driver id").fill("R502");
  await page.locator(".live-search").getByRole("button", { name: "Search" }).click();
  await expect(rows).toHaveCount(1);
  expect(state.calls.some((call) => call.path.includes("q=R502"))).toBe(true);
  await page.getByRole("button", { name: "T2002" }).click();
  await expect(page).toHaveURL(/\/trips\/T2002$/);
  await expect(page.getByRole("heading", { level: 2, name: "T2002" })).toBeVisible();
});

test("trips list: loading, empty and error with retry", async ({ page }) => {
  const state = await fakeTripServer(page, { listDelayMs: 1500 });
  await signIn(page);
  await page.goto("/trips");
  await expect(page.getByText("Loading.")).toBeVisible();
  await expect(page.locator("tr[data-trip-id]")).toHaveCount(2);
  state.listDelayMs = 0;
  await page.getByLabel("Search by trip, rider or driver id").fill("nobody");
  await page.locator(".live-search").getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No trips match.")).toBeVisible();
  state.listFails = 500;
  await page.goto("/trips");
  await expect(page.getByRole("alert")).toContainText("The server failed.");
  state.listFails = undefined;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("tr[data-trip-id]")).toHaveCount(2);
});

test("trip detail: id, status, rider, driver, car, money, timeline and offers", async ({ page }) => {
  await fakeTripServer(page);
  await signIn(page);
  await page.goto("/trips/T2001");
  const heading = page.locator(".page-heading");
  await expect(page.getByRole("heading", { level: 2, name: "T2001" })).toBeVisible();
  await expect(heading).toContainText("Completed");
  const people = page.getByTestId("trip-people");
  await expect(people).toContainText("R501");
  await expect(people.getByRole("link", { name: "Anna" })).toHaveAttribute("href", "/drivers/D1001");
  await expect(people).toContainText("Volvo V90 · ABC 123");
  await expect(people).toContainText("Sergels torg 1, Stockholm");
  await expect(people).toContainText("Arlanda Terminal 5");
  const money = page.getByTestId("trip-money");
  await expect(money).toContainText("520,00 kr");
  await expect(money).toContainText("416,00 kr");
  await expect(money).toContainText("104,00 kr");
  await expect(money).toContainText("Captured");
  await expect(money).toContainText("310,00 kr");
  const timeline = page.getByTestId("trip-timeline").locator("li");
  await expect(timeline).toHaveCount(3);
  await expect(timeline.first()).toContainText("Created");
  await expect(timeline.first()).toContainText(/\d{2}:\d{2}/);
  await expect(timeline.nth(1)).toContainText("Driver accepted");
  const offers = page.getByTestId("trip-offers").locator("tbody tr");
  await expect(offers).toHaveCount(2);
  await expect(offers.first()).toContainText("Declined");
  await noSideScroll(page, "/trips/T2001 on a desktop");

  await page.goto("/trips/T2003");
  await expect(page.getByTestId("trip-timeline")).toContainText("Cancelled");
  await expect(page.getByTestId("trip-people")).toContainText("No driver");
  await expect(page.getByTestId("trip-offers")).toContainText("No offers sent.");
  await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0);

  await page.goto("/trips/NOPE");
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});

test("refund: the form validates, a double click sends one refund, the trip reloads", async ({ page }) => {
  const state = await fakeTripServer(page, { refundDelayMs: 600 });
  await signIn(page);
  await page.goto("/trips/T2001");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Refund trip" });
  const send = dialog.getByRole("button", { name: "Refund", exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Amount (kr)").fill("0");
  await dialog.getByLabel("Reason (required)").fill("Driver took a long way");
  await expect(dialog).toContainText("Enter an amount above 0.");
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Amount (kr)").fill("600");
  await expect(dialog).toContainText("At most 520,00 kr can be refunded.");
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Amount (kr)").fill("120,50");
  await expect(send).toBeEnabled();
  await send.dblclick();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Refund made: 120,50 kr.");
  const posts = state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/trips/T2001/refund"));
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toEqual({ expectedVersion: 7, amount: { amountMinor: 12050, currency: "SEK" }, reason: "Driver took a long way" });
  expect(posts[0]!.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  await expect(page.getByTestId("trip-money")).toContainText("Partially refunded");
});

test("refund above the role limit waits for a second admin; without payments.refund there is no button", async ({ page }) => {
  await fakeTripServer(page, { refundNeedsApproval: true });
  await signIn(page);
  await page.goto("/trips/T2001");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Refund trip" });
  await dialog.getByLabel("Amount (kr)").fill("520");
  await dialog.getByLabel("Reason (required)").fill("Wrong car");
  await dialog.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("The refund waits for a second admin.");
});

test("no payments.refund: the trip shows no Refund button", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: ADMIN.permissions.filter((item) => item !== "payments.refund") } });
  await signIn(page);
  await page.goto("/trips/T2001");
  await expect(page.getByRole("heading", { level: 2, name: "T2001" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toHaveCount(0);
});

test("live menu lists only live pages; a demo page opened by its address says it is not live", async ({ page }) => {
  await fakeTripServer(page);
  await signIn(page);
  const nav = page.locator("nav");
  for (const name of ["Trips", "Drivers", "Fleet owners", "Vehicles", "Onboarding", "Pricing"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Dashboard", "Payments", "Zones", "Live map", "Support", "Riders"]) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  for (const path of ["/payments", "/zones", "/riders"]) {
    await page.goto(path);
    await expect(page.getByTestId("demo-banner")).toContainText("Demo, not live");
  }
  await page.goto("/drivers");
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});

for (const [language, trips, banner, refund] of [
  ["sv", "Resor", "Demo, inte live", "Återbetala"],
  ["fr", "Courses", "Démo, pas en direct", "Rembourser"],
] as const) {
  test(`${language}: trips, trip detail and the demo banner are translated`, async ({ page }) => {
    await fakeTripServer(page, { admin: { language } });
    await signIn(page, language === "sv" ? "Förare" : "Chauffeurs");
    await page.goto("/trips");
    await expect(page.getByRole("heading", { level: 2, name: trips })).toBeVisible();
    await expect(page.locator("tr[data-trip-id]")).toHaveCount(2);
    await page.goto("/trips/T2001");
    await expect(page.getByRole("button", { name: refund, exact: true })).toBeVisible();
    await page.goto("/payments");
    await expect(page.getByTestId("demo-banner")).toContainText(banner);
  });
}

test("small screen (390 px): trips list and detail without side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeTripServer(page);
  await signIn(page);
  await page.goto("/trips");
  await expect(page.locator("tr[data-trip-id]")).toHaveCount(2);
  await noSideScroll(page, "/trips");
  await page.goto("/trips/T2001");
  await expect(page.getByRole("heading", { level: 2, name: "T2001" })).toBeVisible();
  await noSideScroll(page, "/trips/T2001");
  await page.goto("/payments");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
});
