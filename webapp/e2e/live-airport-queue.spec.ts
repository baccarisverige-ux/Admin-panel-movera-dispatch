import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, fakeZones, signIn } from "./live-fake";

/**
 * Fix job 9 (contract v0.18.36 §60) on the live zone page of an airport: the queue area panel. Screenshot review
 * 2026-11-05 found (1) the three number fields had no visible label and (2) the queue map opened on the Stockholm city
 * preset; both fail here before the fix (rule 36).
 */
const AREA = { areaId: "AQ-ARN", airportZoneId: "ARN", polygon: [[59.645, 17.91], [59.645, 17.93], [59.655, 17.93], [59.655, 17.91]], on: true, leaveGraceMin: 5, offerSeconds: 20, maxQueueOffers: 3, keepPlaceAfterDecline: true, updatedAt: "2026-11-05T10:00:00Z" };

async function open(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { language: "en", permissions: [...ADMIN.permissions, "zones.read", "zones.edit"] } });
  await fakeZones(page);
  await page.route(/\/api\/v1\/admin\/zones\/ARN\/queue-area$/, (route) =>
    route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } }) : route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(AREA) }));
  await signIn(page);
  await page.goto("/zones/ARN");
  const panel = page.getByRole("region", { name: "Airport queue area" });
  await expect(panel).toBeVisible();
  return panel;
}

test("airport queue area: the three number fields show their label text", async ({ page }) => {
  const panel = await open(page);
  for (const text of ["Leave the queue after (outside the area)", "Time to answer a queue offer", "Queue offers before the nearest driver"]) {
    await expect(panel.getByText(text, { exact: true })).toBeVisible();
  }
});

test("airport queue area: the map opens centred on the queue area, not on Stockholm city", async ({ page }) => {
  const panel = await open(page);
  const map = panel.locator("[data-map-center]").first();
  await expect(map).toHaveAttribute("data-map-center", /,/, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const [lat, lng] = (await map.getAttribute("data-map-center"))!.split(",").map(Number);
  expect(Math.abs(lat! - 59.65), `centre ${lat},${lng}`).toBeLessThan(0.05);
  expect(Math.abs(lng! - 17.92), `centre ${lat},${lng}`).toBeLessThan(0.1);
});
