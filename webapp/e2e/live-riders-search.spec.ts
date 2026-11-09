import { expect, test } from "@playwright/test";
import { ADMIN, RIDERS, fakeTripServer, signIn } from "./live-fake";

/**
 * Step 33 (2026-11-09, plan U3 prep): the Riders page searches ALL riders on the live server (GET /admin/riders?q=), not
 * only the first page it holds, and "Load more" asks the server for the next page. Before: the box filtered the 50 riders in
 * memory, so rider no. 51 was never found.
 */
const MANY = Array.from({ length: 55 }, (_, i) => ({ ...RIDERS[1]!, riderId: `R6${String(i + 1).padStart(2, "0")}`, firstName: `Rider${i + 1}`, phone: `+467000006${String(i + 1).padStart(2, "0")}`, outstanding: null }));

test("rider no. 55 is found by phone on the server; Load more fetches the next server page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { riders: MANY, admin: { permissions: [...ADMIN.permissions, "riders.read"] } });
  await signIn(page);
  await page.goto("/riders");
  await expect(page.getByRole("heading", { level: 2, name: "Riders" })).toBeVisible();
  const box = page.getByLabel("Find rider");
  await box.fill("+46700000655");
  await expect(page.getByRole("link", { name: "Rider55" }).first()).toBeVisible({ timeout: 10_000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/admin-riders-server-search.png`, fullPage: true });
  expect(state.calls.some((call) => call.path.startsWith("/api/v1/admin/riders?") && call.path.includes("q=%2B46700000655"))).toBe(true);
  await box.fill("");
  // The first server page holds 50 of 55; the page shows 40 of them and offers the other 10.
  await expect(page.getByRole("button", { name: "Show 10 more of 10" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Load more" }).click();
  // The second server page arrived: 55 rows in memory, 15 beyond the 40 shown.
  await expect(page.getByRole("button", { name: "Show 15 more of 15" })).toBeVisible({ timeout: 10_000 });
  expect(state.calls.filter((call) => call.path.startsWith("/api/v1/admin/riders?") && call.path.includes("cursor=50")).length).toBeGreaterThan(0);
});
