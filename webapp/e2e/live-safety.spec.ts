import { expect, test, type Page } from "@playwright/test";
import { LOST_INCIDENT, SOS_INCIDENT, fakeTripServer, signIn, type Incident } from "./live-fake";

/**
 * Safety part 1 (contract v0.7.0 §15, owner decisions 2026-10-27): the live admin reads SOS and car-lost incidents
 * from the server, takes / solves / calls a false alarm on the server, rings a red alarm on every page until a case
 * is taken, and asks the admin to turn the alarm sound on. SHOTS=<dir> also saves screenshots for the owner.
 */

const SAFETY = ["overview.read", "trips.read", "riders.read", "drivers.read", "zones.read", "incidents.read", "safety.edit"];
const shots = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
};
/** The first page of a cold dev server compiles for a while: wait for the dashboard longer than signIn does. */
async function signInCold(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@movera.se");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible({ timeout: 25_000 });
}
const incidents = () => [{ ...SOS_INCIDENT }, { ...LOST_INCIDENT }] as Incident[];
/** The same signed-in session in a new tab that nobody has clicked in yet (a reload may keep the browser's "clicked"). */
async function freshTab(page: Page, init: Parameters<typeof fakeTripServer>[1]): Promise<Page> {
  const session = await page.evaluate(() => sessionStorage.getItem("movera-admin-live-session"));
  const tab = await page.context().newPage();
  await tab.setViewportSize(page.viewportSize() ?? { width: 1280, height: 720 });
  await fakeTripServer(tab, init);
  await tab.addInitScript((value) => {
    if (value) sessionStorage.setItem("movera-admin-live-session", value);
    // A browser that nobody has clicked in yet (the test browser can count its own tab switch as a click).
    Object.defineProperty(navigator, "userActivation", { configurable: true, value: { hasBeenActive: false, isActive: false } });
  }, session);
  await tab.goto("/");
  return tab;
}

/** For the owner's screenshots: cases opened a minute ago, not on the fixed fixture day. */
const recent = () => {
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  return [
    { ...SOS_INCIDENT, openedAt: ago(60), position: { ...SOS_INCIDENT.position, at: ago(61) }, driverPosition: { ...SOS_INCIDENT.driverPosition, measuredAt: ago(8) } },
    { ...LOST_INCIDENT, openedAt: ago(95) },
  ] as Incident[];
};
const dialog = (page: Page) => page.locator(".modal.open");

async function confirm(page: Page) {
  const modal = dialog(page);
  if (await modal.isVisible().catch(() => false)) {
    const reason = modal.getByLabel(/Reason|Anledning/);
    if (await reason.count()) {
      const tag = await reason.first().evaluate((el) => el.tagName);
      if (tag === "SELECT") await reason.first().selectOption({ index: 1 });
      else if ((await reason.first().inputValue()) === "") await reason.first().fill("SOS case");
    }
    await modal.getByRole("button", { name: /Confirm|Bekräfta/ }).click();
  }
}

test("the red alarm shows SOS and car lost on every page until taken; the sound banner turns the sound on", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: SAFETY }, incidents: incidents() });
  await signInCold(page);
  const sos = page.locator(".incident-ring[data-kind=sos]");
  const lost = page.locator(".incident-ring[data-kind=driver_silent]");
  await expect(sos).toContainText("inc_1");
  await expect(lost).toContainText("Car lost");
  // Typing the password let the browser play sound. A new tab with the same session starts with no click yet.
  await expect(page.getByRole("button", { name: "Turn on alarm sound" })).toHaveCount(0);
  const tab = await freshTab(page, { admin: { permissions: SAFETY }, incidents: incidents() });
  await expect(tab.locator(".incident-ring[data-kind=sos]")).toContainText("inc_1");
  await expect(tab.getByRole("button", { name: "Turn on alarm sound" })).toBeVisible();
  await tab.getByRole("button", { name: "Turn on alarm sound" }).click();
  await expect(tab.getByRole("button", { name: "Turn on alarm sound" })).toHaveCount(0);
  await tab.close();
  // The feed is read with the bearer token in a header, never in the URL.
  const feed = state.calls.find((call) => call.path.startsWith("/api/v1/admin/incidents/stream"));
  expect(feed?.headers.authorization).toBe("Bearer access-1");
  // Alerts lists the car lost case in red, with the SOS.
  await page.goto("/alerts");
  await expect(page.getByText("Car lost: R501").first()).toBeVisible();
  await expect(lost).toBeVisible();
});

test("Incidents: an SOS case from the server is taken and solved; a car lost case is a false alarm", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: SAFETY }, incidents: incidents() });
  await signIn(page);
  await page.goto("/incidents?case=inc_1");
  const view = page.getByRole("article", { name: "Case inc_1" });
  await expect(view.getByRole("heading", { name: "inc_1 · New" })).toBeVisible();
  await expect(view).toContainText("SOS button");
  await view.getByRole("button", { name: "Take", exact: true }).click();
  await confirm(page);
  await expect(view.getByRole("heading", { name: "inc_1 · Taken" })).toBeVisible();
  const take = state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/incidents/inc_1/take");
  expect(take?.body).toEqual({ expectedVersion: 1 });
  // Taken: the alarm for this case stops ringing.
  await expect(page.locator(".incident-ring[data-kind=sos]")).toHaveCount(0, { timeout: 15_000 });
  await view.getByLabel("Contact or outcome").fill("Rider safe, spoke on the phone");
  await view.getByRole("button", { name: "Solve", exact: true }).click();
  await confirm(page);
  await expect(view.getByRole("heading", { name: "inc_1 · Solved" })).toBeVisible();
  const solve = state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/incidents/inc_1/resolve");
  expect(solve?.body).toEqual({ expectedVersion: 2, note: "Rider safe, spoke on the phone" });

  await page.goto("/incidents?case=inc_2");
  const lost = page.getByRole("article", { name: "Case inc_2" });
  await expect(lost.getByRole("heading", { name: "inc_2 · New" })).toBeVisible();
  await expect(lost).toContainText("Car lost");
  await lost.getByRole("button", { name: "False alarm", exact: true }).click();
  await confirm(page);
  await expect(lost.getByRole("heading", { name: "inc_2 · False alarm" })).toBeVisible();
  const dismiss = state.calls.find((call) => call.method === "POST" && call.path === "/api/v1/admin/incidents/inc_2/dismiss");
  expect(dismiss?.body).toEqual({ expectedVersion: 1, note: "False alarm" });
  await expect(page.locator(".incident-ring")).toHaveCount(0, { timeout: 15_000 });
});

test("an escalated SOS reaches an admin without Incidents: the alarm rings with no access to the case list", async ({ page }) => {
  const escalated = { ...SOS_INCIDENT, escalatedAt: "2026-10-26T09:22:31Z" } as Incident;
  await fakeTripServer(page, { admin: { permissions: ["overview.read", "finance.read"] }, incidents: [escalated] });
  await signIn(page);
  await expect(page.locator(".incident-ring[data-kind=sos]")).toContainText("Every admin is alerted.");
  await expect(page.locator(".incident-ring[data-kind=sos]").getByRole("link", { name: "Open the case" })).toBeVisible();
});

test("sv: screenshots for the owner", async ({ page }) => {
  test.skip(!shots, "SHOTS=<dir> saves the owner's screenshots");
  await page.setViewportSize({ width: 1360, height: 900 });
  await fakeTripServer(page, { admin: { permissions: SAFETY, language: "sv" }, incidents: recent() });
  await page.goto("/");
  await page.getByLabel(/E-post|Email/).fill("owner@movera.se");
  await page.getByLabel(/Lösenord|Password/).fill("correct-horse");
  await page.getByRole("button", { name: /Logga in|Sign in/ }).click();
  await expect(page.locator(".incident-ring[data-kind=driver_silent]")).toContainText("Bil borttappad");
  const tab = await freshTab(page, { admin: { permissions: SAFETY, language: "sv" }, incidents: recent() });
  await expect(tab.locator(".incident-ring[data-kind=driver_silent]")).toBeVisible();
  await expect(tab.getByRole("button", { name: "Slå på larmljud" })).toBeVisible();
  await shot(tab, "admin-1-larm-och-ljudbanner");
  await tab.close();
  await page.goto("/alerts");
  await expect(page.getByText("Bil borttappad: R501").first()).toBeVisible();
  await shot(page, "admin-2-larm-bil-borttappad");
  await page.goto("/incidents?case=inc_1");
  const view = page.getByRole("article", { name: "Case inc_1" });
  await expect(view.getByRole("heading", { name: "inc_1 · Ny" })).toBeVisible();
  await shot(page, "admin-3-incidenter-sos-nytt");
  await view.getByRole("button", { name: "Ta", exact: true }).click();
  await confirm(page);
  await expect(view.getByRole("heading", { name: "inc_1 · Taget" })).toBeVisible();
  await shot(page, "admin-4-sos-tagen");
  await view.getByLabel("Contact or outcome").fill("Kunden är trygg, pratade i telefon");
  await view.getByRole("button", { name: "Lös", exact: true }).click();
  await confirm(page);
  await expect(view.getByRole("heading", { name: "inc_1 · Löst" })).toBeVisible();
  await shot(page, "admin-5-sos-lost");
  await page.goto("/incidents?case=inc_2");
  const lost = page.getByRole("article", { name: "Case inc_2" });
  await lost.getByRole("button", { name: "Falskt larm", exact: true }).click();
  await confirm(page);
  await expect(lost.getByRole("heading", { name: "inc_2 · Falskt larm" })).toBeVisible();
  await shot(page, "admin-6-bil-borttappad-falskt-larm");
});
