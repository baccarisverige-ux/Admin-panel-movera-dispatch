import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Dispatch", exact: true })).toBeVisible();
}

test("live map moves drivers and opens a stale position", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  // Dispatch opens on its Live map tab.
  await page.getByRole("link", { name: "Dispatch", exact: true }).click();
  await expect(page).toHaveURL(/\/dispatch\/map$/);
  await expect(page.getByTestId("dispatch-tab-map")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 2, name: "Live map" })).toBeVisible();
  await expect(page.locator(".page-heading")).toContainText("OpenStreetMap");
  await expect(page.locator("[data-live='counts']")).toContainText("600");
  await expect(page.locator("[data-live='counts']")).toContainText("Stale");
  await expect(page.getByRole("list", { name: "Airport queue" })).toContainText("Arlanda queue 1");
  await expect(page.getByRole("list", { name: "Boosts" })).toContainText("Norrmalm boost");
  const stale = page.getByRole("button", { name: /Stale · last seen/ }).first();
  await stale.click();
  await expect(page.getByTestId("live-panel")).toContainText("Last seen");
  await page.getByTestId("live-panel").getByRole("link", { name: "Open page" }).click();
  await expect(page).toHaveURL(/\/drivers\/D/);
  await page.goto("/live");
  const marker = page.locator(".ops-marker.driver:not(.stale)").first();
  await expect(marker).toBeVisible();
  const lat = await marker.getAttribute("data-lat");
  await page.waitForFunction((previous) => {
    const node = document.querySelector(".ops-marker.driver:not(.stale)");
    return !!node && node.getAttribute("data-lat") !== previous;
  }, lat);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("the Live map has no second dispatch editor: it shows Dispatch's live values and links there", async ({ page }) => {
  await signIn(page);
  await page.goto("/live");
  const panel = page.getByTestId("dispatch-link");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toContainText("set per zone in Dispatch");
  await expect(panel.getByRole("list", { name: "Live dispatch values" }).getByRole("listitem").filter({ hasText: "Norrmalm" })).toContainText("Exclusive 15 s · Radar 15 s · Search 3 → 5 → 8 km");
  await expect(page.getByText("Dispatch rules per zone")).toHaveCount(0);
  await expect(page.getByLabel("Norrmalm offer time")).toHaveCount(0);
  if (process.env.SHOTS) {
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `docs/gates/g08/live-${width}.png`, fullPage: true });
    }
  }
  await panel.getByRole("link", { name: "Norrmalm" }).click();
  await expect(page).toHaveURL(/\/dispatch\/rules\?zone=Z001/);
  await page.getByTestId("dx-moved-modes").getByRole("link", { name: "Exclusive rules" }).click();
  await expect(page).toHaveURL(/\/dispatch\/radar\?.*tab=exclusive/);
  await expect(page.getByLabel("Exclusive time")).toHaveValue("15");
});

test("To confirm points offer time, search radius and the reservation values to Dispatch", async ({ page }) => {
  await signIn(page);
  await page.goto("/confirm");
  const offer = page.locator("#value-offer-time");
  await expect(offer.getByRole("textbox")).toHaveValue("Set per zone in Dispatch");
  await expect(page.locator("#value-horizon").getByRole("link", { name: "Open in Dispatch" })).toHaveAttribute("href", /tab=reservations/);
  await offer.getByRole("link", { name: "Open in Dispatch" }).click();
  await expect(page).toHaveURL(/\/dispatch\/rules$/);
  await expect(page.getByRole("heading", { name: "Dispatch rules in Sweden" })).toBeVisible();
});
