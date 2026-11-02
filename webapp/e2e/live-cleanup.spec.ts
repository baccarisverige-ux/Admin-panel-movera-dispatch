import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";
import { liveHandles } from "../src/live/liveCommands";

/**
 * Live clean-up 1 (owner 2026-11-02, rule 1, full audit bugs 1–6 and 17): on live no button the server does not handle,
 * no demo book (bonuses, vouchers, promotions, invented sessions), no hidden pages in the menu, and no header badge on
 * pages that are mostly live.
 */
async function unhandled(page: Page): Promise<string[]> {
  const ids = await page.locator("[data-command-button]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-command") ?? ""));
  return [...new Set(ids)].filter((id) => id && !liveHandles(id));
}

const PAGES: [string, string][] = [
  ["/", "Dashboard"],
  ["/drivers", "Drivers"],
  ["/drivers?view=bonuses", "Drivers"],
  ["/riders", "Riders"],
  ["/riders/R501", "Ida"],
  ["/riders/R501?tab=account", "Ida"],
  ["/trips", "Trips"],
  ["/dispatch/map", "Dispatch"],
  ["/incidents", "Incidents"],
  ["/team", "Team"],
  ["/settings", "Settings"],
  ["/reviews", "Reviews"],
  ["/audit", "Audit"],
  ["/payouts", "Payouts"],
];

test("live: the key pages show no button the server does not handle and no Not connected yet header", async ({ page }) => {
  test.setTimeout(120_000);
  await fakeTripServer(page);
  await signIn(page);
  for (const [path, heading] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2, name: heading }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await unhandled(page), path).toEqual([]);
    await expect(page.getByTestId("not-connected"), path).toHaveCount(0);
  }
});

test("live: no demo data (bonuses, bonus areas, promotions, rider sessions) and no demo-only pages", async ({ page }) => {
  test.setTimeout(90_000);
  await fakeTripServer(page);
  await signIn(page);
  await page.goto("/drivers?view=bonuses");
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Morning rush")).toHaveCount(0);
  await expect(page.getByText("Arlanda evening")).toHaveCount(0);

  await page.goto("/dispatch/map");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Arlanda evening|Morning rush/)).toHaveCount(0);

  await page.goto("/riders/R501?tab=account");
  await expect(page.getByRole("heading", { level: 2, name: /Ida/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/WELCOME30|THANKYOU20|AUTUMN15/)).toHaveCount(0);
  await expect(page.getByText(/iPhone|Android phone/)).toHaveCount(0);

  // Promotions (owner: hidden until later), Release gates and Design are not in the live menu, nor open by address.
  const nav = page.getByRole("navigation").first();
  for (const name of ["Promotions", "Release gates", "Design"]) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  for (const path of ["/promotions", "/gates", "/design"]) {
    await page.goto(path);
    await expect(page.getByText(/AUTUMN15|Autumn rides/)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: /Promotions|Release gates|Design/ })).toHaveCount(0);
  }

  // Team: no invite form on live (the server has no admin invite yet).
  await page.goto("/team");
  await expect(page.getByRole("heading", { level: 2, name: "Team" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite agent" })).toHaveCount(0);

  // G16-5: app versions only in Content › App versions, not again in Settings.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "App versions and lifecycle" })).toHaveCount(0);
  await expect(page.getByTestId("app-versions-elsewhere")).toBeVisible();
});
