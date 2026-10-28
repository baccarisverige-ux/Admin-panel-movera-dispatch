import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeSettings, fakeSurge, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.7.2 (owner 2026-10-28) in the live Pricing › Surge tab: the surge now per zone, the demand chart, the
 * rider price check and the surge timeline come from GET /admin/surge/now and GET /admin/zones/{zoneId}/surge/history;
 * what the server cannot give says "Not connected yet"; "Tell drivers when a surge starts" and "Tell drivers now"
 * are gone. With SHOTS set, every Pricing tab is saved at 390 and 1440 px (live-<tab>-<width>.png).
 */

const PRICING_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish"] };
const SHOTS = process.env.SHOTS;

async function open(page: Page, init: Parameters<typeof fakeSurge>[1] = {}) {
  await fakeTripServer(page, { admin: PRICING_ADMIN });
  await fakeSettings(page);
  const surge = await fakeSurge(page, init);
  await signIn(page);
  await page.goto("/pricing?zone=Z001&tab=surge");
  await expect(page.getByRole("heading", { level: 2, name: "Pricing" })).toBeVisible();
  return surge;
}

test("Surge tab: surge now, zone list, demand chart, price check and timeline are the server's numbers", async ({ page }) => {
  const surge = await open(page);
  const now = page.getByRole("region", { name: "Surge now in Stockholm County" });
  await expect(page.getByTestId("surge-now")).toHaveText("×1.8");
  await expect(now).toContainText("Smart");
  await expect(page.getByTestId("surge-requests")).toHaveText("14");
  await expect(page.getByTestId("surge-free")).toHaveText("5");
  await expect(page.getByTestId("surge-ratio")).toHaveText("2.8");

  const strip = page.getByRole("list", { name: "Surge by zone" });
  await expect(strip).toContainText("Södermalm×2.2");
  await expect(strip).toContainText("Stockholm County×1.8");
  await expect(strip).toContainText("Östermalm×1.0");

  // Demand chart: the newest server point (42 requests, 5 free drivers, ×1.8).
  await expect(page.locator(".demand-legend b")).toContainText("42 requests · 5 free drivers · ×1.8");
  const check = page.locator(".price-check");
  await expect(check).toContainText("Saw the surge price40");
  await expect(check).toContainText("Left without booking1230%");

  const timeline = page.getByRole("list", { name: "Surge timeline" });
  await expect(timeline).toContainText("Smart surge ×1.8 (was ×1.5)");
  await expect(timeline).toContainText("2 fewer drivers");
  await expect(timeline).toContainText("rides +12%");
  await expect(timeline).toContainText("Manual surge ×2.0 started");
  await expect(timeline).toContainText("+4 drivers came");
  await expect(timeline).toContainText("Manual surge stopped");

  // No surge notice any more (contract.json#surgeNoticeRemoved).
  await expect(page.getByRole("button", { name: /Tell drivers/ })).toHaveCount(0);
  await expect(page.getByText(/Tell drivers|Drivers last told/)).toHaveCount(0);
  expect(surge.calls.some((call) => call.path.startsWith("/api/v1/admin/surge/now?zoneIds=") && call.path.includes("Z001"))).toBe(true);
  expect(surge.calls.some((call) => call.path === "/api/v1/admin/zones/Z001/surge/history?hours=8&bucketMin=10")).toBe(true);
  expect(surge.calls.some((call) => call.path.endsWith("/surge/notify"))).toBe(false);

  // The running manual surge in Södermalm, from the server.
  await strip.getByRole("button", { name: /Södermalm/ }).click();
  await expect(page.getByTestId("surge-now")).toHaveText("×2.2");
  await expect(page.getByRole("region", { name: "Surge now in Södermalm" })).toContainText("Manual");
  await expect(page.getByText("×2.2 running")).toBeVisible();
});

test("Surge tab: a zone without a sample and a failed history say Not connected yet, never a 0", async ({ page }) => {
  await open(page, {
    now: (at: number) => ({ at: new Date(at).toISOString(), zones: [{ zoneId: "Z001", multiplier: 1, source: "off", requests: 0, freeDrivers: 0, ratio: 0 }] }),
    history: 503,
  });
  await expect(page.getByTestId("surge-now")).toHaveText("×1.0");
  for (const id of ["surge-requests", "surge-free", "surge-ratio"]) await expect(page.getByTestId(id)).toHaveText("Not connected yet");
  await expect(page.getByTestId("demand-not-connected")).toHaveText("Not connected yet");
  await expect(page.getByTestId("price-check-not-connected")).toHaveText("Not connected yet");
  await expect(page.getByTestId("timeline-not-connected")).toHaveText("Not connected yet");
  await expect(page.locator(".demand-chart")).toHaveCount(0);
  await expect(page.locator(".price-check")).toHaveCount(0);
  // Only the zone the server answered for is listed; the others are not shown as ×1.0.
  await expect(page.getByRole("list", { name: "Surge by zone" }).getByRole("listitem")).toHaveCount(1);
});

test("Surge tab: when the server's surge calls fail, the boxes say Not connected yet", async ({ page }) => {
  await open(page, { now: 503, history: 503 });
  await expect(page.getByTestId("surge-now")).toHaveText("—");
  await expect(page.getByRole("region", { name: "Surge now in Stockholm County" }).getByTestId("control-not-connected").first()).toHaveText("Not connected yet");
  await expect(page.getByTestId("surge-alerts-not-connected")).toContainText("Not connected yet");
  await expect(page.getByText("All zones are fine. Smart surge is handling demand.")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Surge by zone" }).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByTestId("demand-not-connected")).toBeVisible();
  await expect(page.getByRole("button", { name: /Tell drivers/ })).toHaveCount(0);
});

test("every live Pricing tab (screenshots for the owner when SHOTS is set)", async ({ page }) => {
  test.skip(!SHOTS, "screenshots only");
  test.setTimeout(120_000);
  await open(page);
  const tabs = [["prices", "Prices"], ["fees", "Fees"], ["surge", "Surge"], ["commission", "Commission"], ["pickup", "Pickup pay"], ["extras", "Tips & limits"], ["history", "History"]] as const;
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    for (const [id, label] of tabs) {
      await page.goto(`/pricing?zone=Z001&tab=${id}`);
      await expect(page.getByRole("tab", { name: label, exact: true })).toHaveAttribute("aria-selected", "true");
      if (id === "surge") await expect(page.getByTestId("surge-now")).toHaveText("×1.8");
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/live-${id}-${width}.png`, fullPage: true });
    }
  }
});
