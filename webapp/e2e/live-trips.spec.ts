import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * The live build's Trips area is the demo Trips list and trip page, fed by the faked server (e2e/live-fake.ts):
 * GET /admin/trips (every page), GET /admin/trips/{id}/offers and POST /admin/trips/{id}/refund.
 */

const dialog = (page: Page) => page.locator(".modal.open");

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

test("trips list: the demo list shows the server trips, search in the page, open a trip", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.getByRole("link", { name: "Trips", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  await expect(page.getByTestId("not-connected")).toBeVisible();
  for (const id of ["T2001", "T2002"]) await expect(page.getByRole("cell", { name: id, exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "T2001" });
  await expect(row).toContainText("R501");
  await expect(row).toContainText("Anna Berg");
  await expect(row).toContainText("520,00 kr");
  expect(state.calls.some((call) => call.path.startsWith("/api/v1/admin/trips?") && call.path.includes("limit=50"))).toBe(true);
  await page.getByPlaceholder("Search", { exact: true }).first().fill("R502");
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "T2002", exact: true })).toBeVisible();
  await page.getByRole("cell", { name: "T2002", exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/T2002$/);
});

test("trips list: server Load more, status filter and search", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/trips");
  const bar = page.getByTestId("live-list-trips");
  await expect(page.getByRole("cell", { name: "T2002", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "T2003", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("cell", { name: "T2003", exact: true })).toBeVisible();
  expect(state.calls.filter((call) => call.path.includes("cursor=c2")).length).toBeGreaterThan(0);
  await expect(bar.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await bar.getByLabel("Status on the server").selectOption("cancelled_by_rider");
  await expect.poll(() => state.calls.some((call) => call.path.includes("status=cancelled_by_rider"))).toBe(true);
  await expect(page.getByRole("cell", { name: "T2003", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
  await bar.getByLabel("Status on the server").selectOption("");
  await bar.getByLabel("Search by trip, rider or driver id").fill("R502");
  await bar.getByRole("button", { name: "Search" }).click();
  await expect.poll(() => state.calls.some((call) => call.path.includes("q=R502"))).toBe(true);
  await expect(page.getByRole("cell", { name: "T2002", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
});

test("trips list: a failing server shows the error line with Try again, and no demo trips", async ({ page }) => {
  const state = await fakeTripServer(page, { listFails: 500 });
  await signIn(page);
  await page.goto("/trips");
  const bar = page.getByTestId("live-list-trips");
  await expect(bar.getByRole("alert")).toContainText("The server failed.", { timeout: 15_000 });
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
  state.listFails = undefined;
  await bar.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toBeVisible();
  await expect(bar.getByRole("alert")).toHaveCount(0);
});

test("trip page: the demo trip page shows the server trip and its offers", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/trips/T2001");
  await expect(page.getByText("T2001").first()).toBeVisible();
  await expect(page.getByText("R501").first()).toBeVisible();
  await expect(page.getByText("520,00 kr").first()).toBeVisible();
  await expect.poll(() => state.calls.some((call) => call.path.startsWith("/api/v1/admin/trips/T2001/offers"))).toBe(true);
  await page.goto("/trips/NOPE");
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});

test("refund: the demo Refund button opens the amount form; it validates, a double click sends one refund", async ({ page }) => {
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
  await expect(page.getByRole("status").filter({ hasText: "Refund made" })).toContainText("Refund made: 120,50 kr.");
  const posts = state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/trips/T2001/refund"));
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toEqual({ expectedVersion: 7, amount: { amountMinor: 12050, currency: "SEK" }, reason: "Driver took a long way" });
  expect(posts[0]!.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  expect(state.trips.find((trip) => trip.tripId === "T2001")!.paymentStatus).toBe("partially_refunded");
});

test("refund of the whole fare above the role limit waits for a second admin", async ({ page }) => {
  await fakeTripServer(page, { refundNeedsApproval: true });
  await signIn(page);
  await page.goto("/trips/T2001");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Refund trip" });
  await dialog.getByLabel("Amount (kr)").fill("520");
  await dialog.getByLabel("Reason (required)").fill("Wrong car");
  await dialog.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "second admin" })).toContainText("The refund waits for a second admin.");
});

test("a role without payments.refund cannot refund", async ({ page }) => {
  await fakeTripServer(page, { admin: { role: "viewer", permissions: ADMIN.permissions.filter((item) => item !== "payments.refund") } });
  await signIn(page);
  await page.goto("/trips/T2001");
  await expect(page.getByText("T2001").first()).toBeVisible();
  const refund = page.getByRole("button", { name: "Refund", exact: true });
  await expect(page.getByTestId("refund-block")).toBeVisible();
  await expect(refund.and(page.locator(":enabled"))).toHaveCount(0);
});

for (const [language, trips, marker] of [
  ["sv", "Resor", "Inte kopplad än"],
  ["fr", "Courses", "Pas encore connecté"],
] as const) {
  test(`${language}: trips and the Not connected yet marker are translated`, async ({ page }) => {
    await fakeTripServer(page, { admin: { language } });
    await signIn(page, language === "sv" ? "Kontrollpanel" : "Tableau de bord");
    await page.goto("/trips");
    await expect(page.getByRole("heading", { level: 2, name: trips })).toBeVisible();
    await expect(page.getByRole("cell", { name: "T2001", exact: true })).toBeVisible();
    await page.goto("/payments");
    await expect(page.getByTestId("not-connected")).toHaveText(marker);
  });
}

test("small screen (390 px): trips list and detail without side scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeTripServer(page);
  await signIn(page);
  await page.goto("/trips");
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toBeVisible();
  await noSideScroll(page, "/trips");
  await page.goto("/trips/T2001");
  await expect(page.getByText("T2001").first()).toBeVisible();
  await noSideScroll(page, "/trips/T2001");
});
