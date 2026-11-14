import { expect, test, type Page } from "@playwright/test";
import { ADMIN, DRIVER, LOST_INCIDENT, RIDERS, SOS_INCIDENT, fakeTripServer, signIn, type Incident, type TripState } from "./live-fake";

/**
 * L78-A (contract v0.18.78, owner 2026-11-12 item 5 "Yes, build" and item 109 "50 of N · Load more"):
 * - the admin lists show "{loaded} of {total}" next to Load more when the server counted the list (total on the first
 *   page), also when everything is loaded ("55 of 55"); no total = no number (as before);
 * - the driver and rider pages read only that person's cases (GET /admin/incidents?driverId= / ?riderId=); a server
 *   before v0.18.78 (400 unknown_filter) gets one rejected read, then every case as before, with no error shown.
 */
const MANY = Array.from({ length: 55 }, (_, i) => ({ ...RIDERS[1]!, riderId: `R6${String(i + 1).padStart(2, "0")}`, firstName: `Rider${i + 1}`, phone: `+467000006${String(i + 1).padStart(2, "0")}`, outstanding: null }));
const SAFETY = ["overview.read", "trips.read", "riders.read", "drivers.read", "zones.read", "incidents.read", "safety.edit"];
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
};
const incidentReads = (state: TripState) => state.calls.filter((call) => call.method === "GET" && call.path.startsWith("/api/v1/admin/incidents?")).map((call) => new URL(`https://x${call.path}`).searchParams);
/** 60 cases of other drivers / riders, then 2 of Anna (D1001) with Omar (R502). */
const CASES = [
  ...Array.from({ length: 60 }, (_, i) => ({ ...LOST_INCIDENT, incidentId: `inc_o${i}`, tripId: `T9${i}`, driverId: "D1000", riderId: "R501", status: "resolved", alarm: false, version: 2 })),
  { ...LOST_INCIDENT, incidentId: "inc_mine1", tripId: "T2001", status: "resolved", alarm: false, driverId: "D1001", riderId: "R502", version: 2 },
  { ...SOS_INCIDENT, incidentId: "inc_mine2", status: "dismissed", alarm: false, version: 2 },
] as Incident[];

test("Riders: \"50 of 55\" next to Load more, \"55 of 55\" when every rider is loaded", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { riders: MANY, listTotals: true, admin: { permissions: [...ADMIN.permissions, "riders.read"] } });
  await signIn(page);
  await page.goto("/riders");
  await expect(page.getByTestId("list-count-riders")).toHaveText("50 of 55", { timeout: 10_000 });
  await shot(page, "admin-l78a-1-riders-50-of-55");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByTestId("list-count-riders")).toHaveText("55 of 55", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("no total from the server (older or not counted): no number, Load more as before", async ({ page }) => {
  await fakeTripServer(page, { riders: MANY, admin: { permissions: [...ADMIN.permissions, "riders.read"] } });
  await signIn(page);
  await page.goto("/riders");
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-testid^=list-count-]")).toHaveCount(0);
});

test("Trips bar: \"2 of 3\"; a new status filter hides the old count until its own page arrives", async ({ page }) => {
  const state = await fakeTripServer(page, { listTotals: true });
  await signIn(page);
  await page.goto("/trips");
  const bar = page.getByTestId("live-list-trips");
  await expect(bar.getByTestId("list-count-trips")).toHaveText("2 of 3", { timeout: 10_000 });
  state.listDelayMs = 1500;
  await bar.getByLabel("Status on the server").selectOption("completed");
  await expect(bar.getByTestId("list-count-trips")).toHaveCount(0);
  await expect(bar.getByTestId("list-count-trips")).toHaveText("1 of 1", { timeout: 10_000 });
});

test("Drivers shows the count; Vehicles does not, the server counts every car of the admin, not the picked zones", async ({ page }) => {
  await fakeTripServer(page, { listTotals: true });
  await signIn(page);
  await page.goto("/drivers");
  await expect(page.getByTestId("list-count-drivers")).toHaveText("2 of 2", { timeout: 10_000 });
  for (const url of ["/vehicles?country=SE&scope=Z001", "/vehicles?country=SE"]) {
    await page.goto(url);
    await expect(page.getByTestId("live-list-vehicles")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("ABC 123").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("list-count-vehicles")).toHaveCount(0);
  }
});

test("Driver page: Anna's cases are read with driverId=D1001, never every case", async ({ page }) => {
  const state = await fakeTripServer(page, { incidents: CASES, admin: { permissions: SAFETY } });
  await signIn(page);
  await page.goto("/drivers/D1001?tab=activity");
  await expect(page.getByRole("link", { name: "inc_mine1" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "inc_mine2" })).toBeVisible();
  await expect(page.getByRole("link", { name: "inc_o0" })).toHaveCount(0);
  await shot(page, "admin-l78a-5-driver-cases-by-driverId");
  expect(incidentReads(state).some((q) => q.get("driverId") === "D1001")).toBe(true);
  // No every-case read: each incidents read is narrowed (person, status, trip) or the Safety page's own history.
  expect(incidentReads(state).filter((q) => !q.get("driverId") && !q.get("riderId") && !q.getAll("status").length && !q.get("tripId"))).toHaveLength(0);
});

test("Rider page: Omar's cases are read with riderId=R502", async ({ page }) => {
  const state = await fakeTripServer(page, { incidents: CASES, admin: { permissions: SAFETY } });
  await signIn(page);
  await page.goto("/riders/R502?tab=safety");
  await expect(page.getByRole("link", { name: "inc_mine1" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "inc_mine2" })).toBeVisible();
  await expect(page.getByRole("link", { name: "inc_o0" })).toHaveCount(0);
  expect(incidentReads(state).some((q) => q.get("riderId") === "R502")).toBe(true);
  expect(incidentReads(state).filter((q) => !q.get("driverId") && !q.get("riderId") && !q.getAll("status").length && !q.get("tripId"))).toHaveLength(0);
});

test("older server (400 unknown_filter): the same cases from every case, no error, two rejected reads once per session (A6: the first 400 is read as no total key)", async ({ page }) => {
  const state = await fakeTripServer(page, { incidents: CASES, oldIncidentFilters: true, drivers: [{ ...DRIVER }], admin: { permissions: SAFETY } });
  await signIn(page);
  await page.goto("/drivers/D1001?tab=activity");
  await expect(page.getByRole("link", { name: "inc_mine1" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "inc_mine2" })).toBeVisible();
  await expect(page.getByRole("link", { name: "inc_o0" })).toHaveCount(0);
  await expect(page.getByText("Unknown filter.")).toHaveCount(0);
  expect(incidentReads(state).filter((q) => q.get("driverId") || q.get("riderId"))).toHaveLength(2);
  // The same session (no reload): the rider page goes straight to the every-case read.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/riders/R502?tab=safety");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("link", { name: "inc_mine1" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Unknown filter.")).toHaveCount(0);
  expect(incidentReads(state).filter((q) => q.get("driverId") || q.get("riderId"))).toHaveLength(2);
  expect(incidentReads(state).some((q) => !q.getAll("status").length && !q.get("tripId") && q.get("limit") === "100")).toBe(true);
});

test("Incidents history: \"50 of 61\" next to Load more", async ({ page }) => {
  const closed = Array.from({ length: 60 }, (_, i) => ({ ...LOST_INCIDENT, incidentId: `inc_c${i}`, tripId: `T9${i}`, status: i % 2 ? "resolved" : "dismissed", alarm: false, resolvedBy: "A1", resolvedAt: "2026-10-26T09:30:00Z", version: 2 }));
  await fakeTripServer(page, { listTotals: true, admin: { permissions: SAFETY }, incidents: [...closed, { ...SOS_INCIDENT }] as Incident[], incidentEvents: [] });
  await signIn(page);
  await page.goto("/incidents?show=all");
  await expect(page.getByTestId("list-count-incidents")).toHaveText("50 of 61", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  await shot(page, "admin-l78a-8-incidents-50-of-61");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByTestId("list-count-incidents")).toHaveText("61 of 61", { timeout: 10_000 });
});

for (const [language, text] of [["fr", "50 sur 55"], ["sv", "50 av 55"]] as const) {
  test(`the count in the admin's language (${language}: "${text}")`, async ({ page }) => {
    await fakeTripServer(page, { riders: MANY, listTotals: true, admin: { permissions: [...ADMIN.permissions, "riders.read"], language } });
    await page.goto("/");
    await page.getByLabel(/E-post|Email|E-mail/).fill("owner@movera.se");
    await page.getByLabel(/Lösenord|Password|Mot de passe/).fill("correct-horse");
    await page.getByRole("button", { name: /Logga in|Sign in|Se connecter/ }).click();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 15_000 });
    await page.goto("/riders");
    await expect(page.getByTestId("list-count-riders")).toHaveText(text, { timeout: 10_000 });
  });
}
