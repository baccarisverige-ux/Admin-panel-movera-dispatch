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
  // The demo's Rider column shows the rider's name (GET /admin/riders), not the id; the demo has no Car column.
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("Lina");
  await expect(page.locator('tr[data-trip-id="T2001"]')).not.toContainText("R501");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("Anna");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("520,00 kr");
  await expect(page.locator('tr[data-trip-id="T2001"]')).toContainText("Captured");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(rows).toHaveCount(3);
  expect(state.calls.filter((call) => call.path.includes("cursor=c2"))).toHaveLength(1);

  await page.getByRole("button", { name: "Cancelled", exact: true }).click();
  await expect.poll(() => state.calls.some((call) => call.path.includes("status=cancelled_by_rider"))).toBe(true);
  await expect(rows).toHaveCount(1);
  await expect(page.locator('tr[data-trip-id="T2003"]')).toBeVisible();
  await page.getByRole("button", { name: "All trips", exact: true }).click();

  await page.getByLabel("Search by trip id or rider phone").fill("R502");
  await page.locator(".live-search").getByRole("button", { name: "Search" }).click();
  await expect(rows).toHaveCount(1);
  expect(state.calls.some((call) => call.path.includes("q=R502"))).toBe(true);
  await page.getByRole("button", { name: "T2002" }).click();
  await expect(page).toHaveURL(/\/trips\/T2002$/);
  await expect(page.getByRole("heading", { level: 2, name: "Trip T2002" })).toBeVisible();
});

test("trips list: loading, empty and error with retry", async ({ page }) => {
  const state = await fakeTripServer(page, { listDelayMs: 1500 });
  await signIn(page);
  await page.goto("/trips");
  await expect(page.getByText("Loading.")).toBeVisible();
  await expect(page.locator("tr[data-trip-id]")).toHaveCount(2);
  state.listDelayMs = 0;
  await page.getByLabel("Search by trip id or rider phone").fill("nobody");
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
  await expect(page.getByRole("heading", { level: 2, name: "Trip T2001" })).toBeVisible();
  await expect(page.getByTestId("trip-head")).toContainText("Completed");
  await expect(page.getByTestId("trip-head")).toContainText("Lina");
  const people = page.getByTestId("trip-people");
  await expect(people).toContainText("Lina");
  await expect(people.getByRole("link", { name: "Anna" }).first()).toHaveAttribute("href", "/drivers/D1001");
  await expect(people).toContainText("Volvo V90 · ABC 123");
  await expect(page.getByTestId("trip-stops")).toContainText("Sergels torg 1, Stockholm");
  await expect(page.getByTestId("trip-stops")).toContainText("Arlanda Terminal 5");
  const money = page.getByTestId("trip-money");
  await expect(money).toContainText("520,00 kr");
  await expect(money).toContainText("416,00 kr");
  await expect(money).toContainText("104,00 kr");
  await expect(page.getByTestId("trip-payment")).toContainText("Captured");
  await expect(page.getByTestId("trip-fare")).toContainText("310,00 kr");
  const timeline = page.getByTestId("trip-timeline").locator("li");
  await expect(timeline).toHaveCount(3);
  await expect(timeline.first()).toContainText("Created");
  await expect(timeline.first()).toContainText(/\d{2}:\d{2}/);
  await expect(timeline.nth(1)).toContainText("Driver accepted");
  const offers = page.getByTestId("trip-offer-log").locator("li");
  await expect(offers).toHaveCount(2);
  await expect(offers.first()).toContainText("Declined");
  await noSideScroll(page, "/trips/T2001 on a desktop");

  await page.goto("/trips/T2003");
  await expect(page.getByTestId("trip-timeline")).toContainText("Cancelled");
  await expect(page.getByTestId("trip-people")).toContainText("Not assigned");
  await expect(page.getByTestId("trip-offer-log")).toContainText("No offer was sent for this trip.");
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeDisabled();

  await page.goto("/trips/NOPE");
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});

test("refund: the form validates, a double click sends one refund, the trip reloads", async ({ page }) => {
  const state = await fakeTripServer(page, { refundDelayMs: 600 });
  await signIn(page);
  await page.goto("/trips/T2001");
  const card = page.getByTestId("part-refund");
  const give = card.getByRole("button", { name: "Give money back" });
  await expect(give).toBeDisabled();
  await card.getByLabel("Refund amount").fill("0");
  await expect(card).toContainText("Choose an amount above zero.");
  await expect(give).toBeDisabled();
  await card.getByLabel("Refund amount").fill("600");
  await expect(card).toContainText("That is more than the rider paid.");
  await expect(give).toBeDisabled();
  await card.getByLabel("Refund amount").fill("120,50");
  await expect(give).toBeEnabled();
  await give.click();
  const dialog = page.getByRole("dialog", { name: "Refund trip" });
  const send = dialog.getByRole("button", { name: "Confirm", exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByLabel("Reason (required)").fill("Driver took a long way");
  await send.dblclick();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("120,50 kr refunded to Lina.");
  const posts = state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/trips/T2001/refund"));
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toEqual({ expectedVersion: 7, amount: { amountMinor: 12050, currency: "SEK" }, reason: "Driver took a long way" });
  expect(posts[0]!.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  await expect(page.getByTestId("trip-payment")).toContainText("Partially refunded");
});

test("refund above the role limit waits for a second admin; without payments.refund there is no button", async ({ page }) => {
  await fakeTripServer(page, { refundNeedsApproval: true });
  await signIn(page);
  await page.goto("/trips/T2001");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Refund trip" });
  await expect(dialog).toContainText("Gives 520,00 kr back to the rider");
  await dialog.getByLabel("Reason (required)").fill("Wrong car");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("The change waits for a second admin.");
});

test("no payments.refund: the trip's refund buttons are off and say why", async ({ page }) => {
  await fakeTripServer(page, { admin: { permissions: ADMIN.permissions.filter((item) => item !== "payments.refund") } });
  await signIn(page);
  await page.goto("/trips/T2001");
  await expect(page.getByRole("heading", { level: 2, name: "Trip T2001" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toHaveAttribute("title", "Your role cannot do that.");
  await page.getByTestId("part-refund").getByLabel("Refund amount").fill("10");
  await expect(page.getByTestId("part-refund").getByRole("button", { name: "Give money back" })).toBeDisabled();
});

test("live menu lists only live pages; a demo page opened by its address says it is not live", async ({ page }) => {
  await fakeTripServer(page);
  await signIn(page);
  const nav = page.locator("nav");
  for (const name of ["Trips", "Drivers", "Fleet owners", "Vehicles", "Onboarding"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Dashboard", "Payments", "Pricing", "Zones", "Live map", "Support", "Riders"]) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
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
    await expect(page.getByRole("button", { name: refund, exact: true })).toBeEnabled();
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
  await expect(page.getByRole("heading", { level: 2, name: "Trip T2001" })).toBeVisible();
  await noSideScroll(page, "/trips/T2001");
  await page.goto("/payments");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
});
