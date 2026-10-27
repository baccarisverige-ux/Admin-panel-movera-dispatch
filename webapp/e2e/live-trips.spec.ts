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

test("trips list: the demo list shows every server trip (all pages read), search, open a trip", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.getByRole("link", { name: "Trips", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  await expect(page.getByTestId("not-connected")).toBeVisible();
  for (const id of ["T2001", "T2002", "T2003"]) await expect(page.getByRole("cell", { name: id, exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "T2001" });
  await expect(row).toContainText("R501");
  await expect(row).toContainText("Anna Berg");
  await expect(row).toContainText("520,00 kr");
  // The demo list shows every trip, so the second server page (cursor c2) is read too.
  expect(state.calls.filter((call) => call.path.includes("cursor=c2")).length).toBeGreaterThan(0);
  await page.getByPlaceholder("Search").first().fill("R502");
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "T2002", exact: true })).toBeVisible();
  await page.getByRole("cell", { name: "T2002", exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/T2002$/);
});

test("trips list: a failing server shows no rows (no demo trips filled in)", async ({ page }) => {
  const state = await fakeTripServer(page, { listFails: 500 });
  await signIn(page);
  await page.goto("/trips");
  await expect.poll(() => state.calls.filter((call) => call.path.startsWith("/api/v1/admin/trips?")).length).toBeGreaterThan(0);
  await expect(page.getByText(/^0 trips in demo data/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
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

test("refund: the demo Refund button refunds the whole fare on the server, once", async ({ page }) => {
  const state = await fakeTripServer(page, { refundDelayMs: 600 });
  await signIn(page);
  await page.goto("/trips/T2001");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await dialog(page).getByLabel("Reason", { exact: true }).selectOption("Rider was overcharged");
  await dialog(page).getByLabel("Type T2001 to confirm").fill("T2001");
  await dialog(page).getByRole("button", { name: "Confirm" }).dblclick();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/trips/T2001/refund")).length).toBe(1);
  await page.waitForTimeout(800);
  const posts = state.calls.filter((call) => call.method === "POST" && call.path.endsWith("/trips/T2001/refund"));
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toMatchObject({ expectedVersion: 7, amount: { amountMinor: 52000, currency: "SEK" } });
  expect(String((posts[0]!.body as { reason: string }).reason)).toContain("Rider was overcharged");
  expect(posts[0]!.headers["idempotency-key"]?.length).toBeGreaterThan(15);
  expect(state.trips.find((trip) => trip.tripId === "T2001")!.paymentStatus).toBe("refunded");
});

test("refund above the role limit waits for a second admin", async ({ page }) => {
  await fakeTripServer(page, { refundNeedsApproval: true });
  await signIn(page);
  await page.goto("/trips/T2001");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await dialog(page).getByLabel("Reason", { exact: true }).selectOption("Rider was overcharged");
  await dialog(page).getByLabel("Type T2001 to confirm").fill("T2001");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Waits for a second admin.").first()).toBeVisible();
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
