import { expect, test, type Page, type Route } from "@playwright/test";
import { ADMIN, API, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.18.171 (contract.json#googleRoadLines; owner 2026-11-27 "Google on key screens", 2026-11-28 "admin must be
 * able to change the maximum number of Google calls per day"): the Live traffic card's road-line rows and Settings ›
 * Google budget against a faked server. The admin makes no Google call. Screenshots go to SHOTS when it is set (1440x900).
 */
const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
const PERMS = [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit"];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,PUT,OPTIONS", "access-control-expose-headers": "*" };
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });

async function fakeBudget(page: Page, refuse?: { status: number; reason: string }) {
  const state = { dailyLimit: 2000, quotesPerDay: 1400 };
  const puts: unknown[] = [];
  const googleCalls: string[] = [];
  page.on("request", (r) => { if (/googleapis\.com/.test(r.url())) googleCalls.push(r.url()); });
  await page.route(`${API}/api/v1/admin/maps/google-budget`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === "PUT") {
      puts.push(req.postDataJSON());
      if (refuse) return json(route, refuse.status, { code: refuse.status === 403 ? "forbidden" : "invalid_request", message: "refused", requestId: "r1", retryable: false, reason: refuse.reason });
      Object.assign(state, req.postDataJSON());
    }
    return json(route, 200, { ...state, roadLinesPerDay: state.dailyLimit - state.quotesPerDay, today: { day: "2026-11-28", quotes: 412, roadLines: 97 } });
  });
  return { state, puts, googleCalls };
}

test("Live traffic card: Google road lines on/off and max Google calls per trip (1..4, default 4)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { language: "en", permissions: PERMS } });
  await fakeSettings(page);
  const budget = await fakeBudget(page);
  await signIn(page);
  await page.goto("/dispatch?zone=Z002&tab=rides");
  const calls = page.getByLabel("Max Google calls per trip").first();
  await expect(calls).toHaveValue("4");
  await expect(page.getByRole("switch", { name: "Google road lines on" })).toBeVisible();
  await page.getByTestId("dx-road-lines-note").evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.evaluate(() => window.scrollBy(0, 40));
  await shot(page, "admin-live-traffic-road-lines-en");
  expect(budget.googleCalls).toEqual([]);
});

test("Google budget: daily limit and quotes are editable; saving a new daily limit sends PUT and shows it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { language: "en", permissions: PERMS } });
  await fakeSettings(page);
  const budget = await fakeBudget(page);
  await signIn(page);
  await page.goto("/settings");
  const panel = page.getByTestId("google-budget");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByText("Keep this at or below your Google Cloud daily quota.")).toBeVisible();
  await expect(panel.getByLabel("Road lines per day")).toHaveValue("600");
  await expect(panel.getByTestId("google-budget-today")).toContainText("509 of 2000 Google calls used");
  await shot(page, "admin-google-budget-en");
  await panel.getByLabel("Daily limit (Google calls)").fill("5000");
  await panel.getByLabel("Quotes per day").fill("3500");
  await expect(panel.getByLabel("Road lines per day")).toHaveValue("1500");
  await panel.getByRole("button", { name: "Save Google budget" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved. The server uses it at once.");
  expect(budget.puts).toEqual([{ dailyLimit: 5000, quotesPerDay: 3500 }]);
  await expect(panel.getByTestId("google-budget-today")).toContainText("509 of 5000 Google calls used");
  await shot(page, "admin-google-budget-saved-en");
  expect(budget.googleCalls).toEqual([]);
});

test("Google budget: a 403 not_all_countries answer is shown clearly (400 invalid_budget: googleRoadLines171.test.ts)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { language: "en", permissions: PERMS } });
  await fakeSettings(page);
  await fakeBudget(page, { status: 403, reason: "not_all_countries" });
  await signIn(page);
  await page.goto("/settings");
  const panel = page.getByTestId("google-budget");
  await panel.getByLabel("Daily limit (Google calls)").fill("3000");
  await panel.getByRole("button", { name: "Save Google budget" }).click();
  await expect(panel.getByRole("status")).toContainText("403 not_all_countries");
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "admin-google-budget-403-en");
});

test("Google budget: an admin scoped to one country sees it but cannot save", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { language: "sv", permissions: PERMS, scope: { zones: "all", countries: ["SE"] } } });
  await fakeSettings(page);
  await fakeBudget(page);
  await signIn(page, "Kontrollpanel");
  await page.goto("/settings");
  const panel = page.getByTestId("google-budget");
  await expect(panel.getByText("Håll detta på eller under din dagliga kvot i Google Cloud.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Spara Google-budget" })).toBeDisabled();
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "admin-google-budget-one-country-sv");
});
