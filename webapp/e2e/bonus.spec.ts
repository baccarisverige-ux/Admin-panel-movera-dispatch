import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

async function mapClick(page: Page, lat: number, lng: number) {
  const host = page.locator(".live-map");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox();
  if (!box) throw new Error("map missing");
  const point = await page.evaluate(({ lat, lng }) => {
    const map = (window as { __moveraMap?: { project: (lat: number, lng: number) => { x: number; y: number } } }).__moveraMap;
    if (!map) throw new Error("map not ready");
    return map.project(lat, lng);
  }, { lat, lng });
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

const rule = (page: Page, label: string) => page.getByRole("list", { name: "Rules" }).getByRole("listitem").filter({ hasText: label });

test("a ride bonus: 4 rides from 15 to 17 earns 200 kr, rides back to back, seen in the driver app", async ({ page }) => {
  await session(page);
  await page.goto("/drivers");
  await page.getByRole("tab", { name: "Bonuses" }).click();
  await expect(page).toHaveURL(/view=bonuses/);
  await expect(page.getByRole("list", { name: "Driver bonuses" })).toContainText("Morning rush");
  await page.getByRole("button", { name: /New ride bonus/ }).click();
  await page.getByLabel("Bonus name").fill("School run");
  await page.getByLabel("Rides to do").fill("4");
  await page.getByLabel("Bonus amount").fill("200");
  await page.getByLabel("Start time").fill("15:00");
  await page.getByLabel("End time").fill("17:00");
  await page.getByRole("button", { name: "Weekdays" }).click();
  await rule(page, "Rides back to back").locator(".db-rule-switch").click();
  await expect(page.getByLabel("Rides back to back on")).toBeChecked();
  await page.getByLabel("Rides back to back", { exact: true }).fill("15");

  // B7b: the real driver app only (demo build: sign-in note); the drawn-sample checks are archived in the Rules repo.
  await expect(page.getByLabel("Driver app preview")).toHaveText("Sign in to the live server to see the real app.");
  await expect(page.locator(".db-cost")).toContainText("200,00 kr");

  await page.getByRole("button", { name: "Start bonus" }).click();
  await confirm(page);
  await expect(page.getByText(/Bonus School run is on for \d+ drivers\./)).toBeVisible();
  const item = page.getByRole("list", { name: "Driver bonuses" }).getByRole("listitem").filter({ hasText: "School run" });
  await expect(item).toContainText("Ride bonus");
  await expect(item).toContainText("Do 4 rides, earn 200,00 kr");
  await page.reload();
  await expect(page.getByRole("list", { name: "Driver bonuses" })).toContainText("School run");
});

test("bonus checks: limits, steps that go up, empty days", async ({ page }) => {
  await session(page);
  await page.goto("/drivers?view=bonuses");
  await page.getByRole("button", { name: /New ride bonus/ }).click();
  await page.getByRole("radio", { name: /Extra per ride/ }).click();
  await expect(page.getByRole("alert")).toHaveText("Set the most one driver can earn (rule: max payout per driver).");
  await expect(page.getByRole("button", { name: "Start bonus" })).toBeDisabled();
  await rule(page, "Max payout per driver").locator(".db-rule-switch").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("radio", { name: /Steps/ }).click();
  await page.getByLabel("Step 2 rides").fill("2");
  await expect(page.getByRole("alert")).toContainText("Each step needs more rides");
  await page.getByLabel("Step 2 rides").fill("5");
  await page.getByRole("button", { name: "Add a step" }).click();
  await expect(page.getByLabel("Step 4 rides")).toHaveValue("10");
  await expect(page.getByRole("alert")).toHaveCount(0);
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await page.getByRole("button", { name: day, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Pick at least one day.");
  await page.getByRole("button", { name: "Every day" }).click();
  await page.getByLabel("Start time").fill("22:00");
  await page.getByLabel("End time").fill("02:00");
  await expect(page.locator(".db-window")).toContainText("past midnight");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an area bonus drawn on the map: a place with a distance and a circle", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/drivers?view=bonuses");
  await page.getByRole("button", { name: /New area bonus/ }).click();
  await page.getByLabel("Bonus name").fill("Station rush");
  await page.getByLabel("Message to drivers").fill("Trains arrive every 10 min. Wait at the taxi lane, exit 3.");
  await expect(page.getByLabel("Driver app preview")).toHaveText("Sign in to the live server to see the real app.");
  await expect(page.getByRole("alert")).toHaveText("Draw at least one area on the map.");
  await page.getByRole("button", { name: /Around a place/ }).click();
  await page.getByLabel("Bonus place").selectOption("Stockholm Central Station");
  await page.getByLabel("Bonus distance around").fill("1");
  await page.getByRole("button", { name: "Add area" }).click();
  const areas = page.getByRole("list", { name: "Bonus areas" });
  await expect(areas.getByLabel("Area 1 name")).toHaveValue("Stockholm Central Station");
  await expect(areas).toContainText("3.1");
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.waitForFunction(() => (window as { __moveraMap?: unknown }).__moveraMap);
  // Let the map finish moving to the new area before drawing.
  let last = -1;
  for (let round = 0; round < 20; round += 1) {
    const now = await page.evaluate(() => (window as { __moveraMap?: { generation: number } }).__moveraMap?.generation ?? 0);
    if (now === last) break;
    last = now;
    await page.waitForTimeout(400);
  }
  await page.getByRole("toolbar", { name: "Bonus drawing tools" }).getByRole("button", { name: "Circle" }).click();
  await expect(page.getByRole("toolbar", { name: "Bonus drawing tools" }).getByRole("button", { name: "Circle" })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  await mapClick(page, 59.334, 18.072);
  await page.waitForTimeout(150);
  const box = (await page.locator(".live-map").boundingBox())!;
  const edge = await page.evaluate(() => (window as unknown as { __moveraMap: { project: (lat: number, lng: number) => { x: number; y: number } } }).__moveraMap.project(59.334, 18.08));
  await page.mouse.move(box.x + edge.x, box.y + edge.y, { steps: 6 });
  await page.mouse.click(box.x + edge.x, box.y + edge.y);
  await expect(areas.getByLabel("Area 2 name")).toHaveValue("Area 2");
  await areas.getByLabel("Area 2 name").fill("Stureplan");
  await page.getByRole("radio", { name: "Drop-off inside" }).click();
  await expect(page.getByLabel("Driver app preview")).toHaveText("Sign in to the live server to see the real app.");
  await areas.getByRole("button", { name: "Remove Stureplan" }).click();
  await expect(areas.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "Start bonus" }).click();
  await confirm(page);
  const item = page.getByRole("list", { name: "Driver bonuses" }).getByRole("listitem").filter({ hasText: "Station rush" });
  await expect(item).toContainText("Area bonus");
  await expect(item).toContainText("Stockholm Central Station");
  await expect(item).toContainText("Wait at the taxi lane, exit 3.");
  await item.getByRole("button", { name: "See in driver app" }).click();
  await expect(item.getByLabel("Driver app preview")).toHaveText("Sign in to the live server to see the real app.");
});

test("switch a bonus off and on, change it, end it", async ({ page }) => {
  await session(page);
  await page.goto("/drivers?view=bonuses");
  const list = page.getByRole("list", { name: "Driver bonuses" });
  await page.getByRole("button", { name: "Morning rush on" }).click();
  await confirm(page);
  await expect(page.getByText("Bonus Morning rush switched off.")).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Morning rush" })).toContainText("Off");
  await page.getByRole("button", { name: "Morning rush off" }).click();
  await confirm(page);
  await expect(page.getByText("Bonus Morning rush switched on.")).toBeVisible();

  await list.getByRole("listitem").filter({ hasText: "Morning rush" }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Change Morning rush" })).toBeVisible();
  await page.getByLabel("Bonus amount").fill("175");
  await page.getByRole("button", { name: "Save changes" }).click();
  await confirm(page);
  await expect(page.getByText("Bonus Morning rush changed.")).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Morning rush" })).toContainText("Do 3 rides, earn 175,00 kr");

  await list.getByRole("listitem").filter({ hasText: "Morning rush" }).getByRole("button", { name: "End bonus" }).click();
  await confirm(page);
  await expect(list).not.toContainText("Morning rush");
  await page.getByRole("button", { name: "Ended", exact: true }).click();
  await expect(list).toContainText("Morning rush");
  await page.reload();
  await page.getByRole("button", { name: "Ended", exact: true }).click();
  await expect(page.getByRole("list", { name: "Driver bonuses" })).toContainText("Morning rush");
});

test("bonuses follow the country, and the dashboard map has a bonus layer", async ({ page }) => {
  await session(page);
  await page.goto("/drivers?view=bonuses&country=FR");
  await expect(page.getByRole("heading", { name: "Driver bonuses in France" })).toBeVisible();
  await expect(page.getByText("No bonus here yet in France.")).toBeVisible();
  await page.getByRole("button", { name: /New ride bonus/ }).click();
  await expect(page.getByLabel("Driver app preview")).toHaveText("Sign in to the live server to see the real app.");
  await page.goto("/?tab=live");
  await expect(page.getByRole("button", { name: /Driver bonus areas/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/drivers");
  await expect(page.getByRole("tab", { name: "Drivers" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: "Driver views" })).toBeVisible();
});

test("bonuses stay usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await page.goto("/drivers?view=bonuses");
  await page.getByRole("button", { name: /New area bonus/ }).click();
  await expect(page.getByLabel("Driver app preview")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
});
