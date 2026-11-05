import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, fakeTripServer, signIn } from "./live-fake";

/**
 * v0.18.16 A2 (owner G16 Q16-2 "Warn → Pause → Ban"): Riders › rider page on live warns, pauses for X days, bans and
 * clears a rider through POST /admin/riders/{riderId}/moderation, always with the admin's reason.
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
const modal = (page: Page) => page.locator(".modal.open").last();
async function confirm(page: Page) {
  const reason = modal(page).getByLabel(/^Reason$/);
  if (await reason.count()) {
    if ((await reason.evaluate((el) => el.tagName)) === "SELECT") await reason.selectOption({ index: 1 });
    else await reason.fill("Unpaid fees");
  }
  const typed = modal(page).getByLabel(/^Type .+ to confirm$/);
  if (await typed.count()) await typed.fill("R501");
  await modal(page).getByRole("button", { name: "Confirm" }).click();
}

/** A cold dev server compiles the lazy pages on first use: wait for the Dashboard longer the first time. */
async function signInWarm(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").waitFor({ timeout: 60_000 });
  await signIn(page).catch(async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible({ timeout: 60_000 });
  });
}

test.setTimeout(120_000);

test("warn, pause 3 days, ban and clear reach the server with the reason", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: [...ADMIN.permissions, "riders.block"] } });
  const sent: Record<string, unknown>[] = [];
  await page.route(`${API}/api/v1/admin/riders/*/moderation`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    const index = state.riders.findIndex((rider) => rider["riderId"] === "R501");
    const level = body["level"] as string;
    const rider = { ...state.riders[index]!, version: Number(state.riders[index]!["version"]) + 1, status: level === "paused" || level === "banned" ? "suspended" : "active", moderation: { level, ...(level === "none" ? {} : { reason: body["reason"] }), until: level === "paused" ? "2026-10-29T09:00:00Z" : null } };
    state.riders[index] = rider;
    return json(route, 200, rider);
  });
  await signInWarm(page);
  await page.goto("/riders/R501");
  const box = page.getByTestId("rider-moderation");
  await expect(box).toContainText("No warning, pause or ban");

  await box.getByRole("button", { name: "Warn" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ expectedVersion: 2, level: "warning" });
  expect(String(sent[0]!["reason"]).length).toBeGreaterThan(0);

  await box.getByLabel("Pause days").fill("3");
  await box.getByRole("button", { name: "Pause" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ level: "paused", pauseDays: 3 });

  await page.reload();
  await expect(page.getByTestId("rider-moderation-level")).toContainText("Paused");
  await page.getByTestId("rider-moderation").getByRole("button", { name: "Ban" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toMatchObject({ level: "banned" });
  expect(sent[2]).not.toHaveProperty("pauseDays");

  await page.reload();
  await page.getByTestId("rider-moderation").getByRole("button", { name: "Clear" }).click();
  await confirm(page);
  await expect.poll(() => sent.length).toBe(4);
  expect(sent[3]).toMatchObject({ level: "none" });
});

test("an admin without riders.block cannot use the steps", async ({ page }) => {
  await fakeTripServer(page);
  await signInWarm(page);
  await page.goto("/riders/R501");
  await expect(page.getByTestId("rider-moderation").getByRole("button", { name: "Warn" })).toBeDisabled();
});
