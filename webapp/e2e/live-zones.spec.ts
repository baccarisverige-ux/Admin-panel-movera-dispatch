import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeTripServer, fakeZones, signIn } from "./live-fake";

/**
 * Contract v0.11.0 §20 (owner 2026-10-28) in the live Zones page: the zone list of the top bar, the Zones page, the
 * zone page and the map is GET /admin/zones; create (outline + names in sv, fr, en), edit names, open and close in
 * the confirm box with expectedVersion; no delete; a stale version reloads and says so. Screenshots (sv, 1440) go to SHOTS.
 */

const SHOTS = process.env.SHOTS;
const SV_ADMIN = { language: "sv", permissions: [...ADMIN.permissions, "zones.read", "zones.edit"] };
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: SV_ADMIN });
  const server = await fakeZones(page);
  await signIn(page, "Kontrollpanel");
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 2, name: "Zoner" }).first()).toBeVisible();
  return server;
}

test("Zones: the list, the top bar and the map come from the server; no delete in live", async ({ page }) => {
  await open(page, "/zones?country=FR");
  await expect(page.getByTestId("zones-server")).toContainText("3 öppna · 0 stängda");
  const list = page.getByRole("region", { name: "Zoner per stad" });
  await expect(list).toContainText("Paris & Île-de-France");
  await expect(list).toContainText("Paris-Charles de Gaulle flygplats");
  await expect(list).not.toContainText("Rive Gauche");
  await expect(page.locator('[data-command="admin.zone.delete"]')).toHaveCount(0);
  await page.locator('[data-command="admin.ui.zones"].zone-trigger').click();
  const menu = page.locator(".zone-menu");
  await expect(menu).toContainText("FR-PC");
  await expect(menu).toContainText("ORY");
  await expect(menu).not.toContainText("FR-RG");
  await page.keyboard.press("Escape");
  await shot(page, "admin-zones-live-list-sv");

  await page.goto("/zones?country=TN");
  await expect(page.getByTestId("zones-server")).toContainText("0 öppna · 1 stängda");
});

test("Zones: zone page FR-PC with its outline, names in three languages saved with expectedVersion", async ({ page }) => {
  const server = await open(page, "/zones?country=FR");
  await page.goto("/zones/FR-PC");
  await expect(page.getByRole("heading", { level: 2, name: "Paris & Île-de-France" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Frankrike/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".zd-hero")).toContainText("Frankrike");
  await expect(page.locator(".zd-hero")).toContainText("Driftzon");
  await expect(page.getByRole("img", { name: /Paris & Île-de-France/ })).toBeVisible();
  await expect(page.locator('[data-command="admin.zone.delete"]')).toHaveCount(0);
  await expect(page.getByLabel("Namn på franska")).toHaveValue("Paris & Île-de-France");
  await shot(page, "admin-zone-detail-fr-pc-sv");
  await page.getByLabel("Namn på engelska").fill("Paris & Ile-de-France region");
  await page.getByRole("button", { name: "Spara namn och typ" }).click();
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.method === "PUT").map((s) => s.body)).toEqual([{ expectedVersion: 1, names: { sv: "Paris & Île-de-France", fr: "Paris & Île-de-France", en: "Paris & Ile-de-France region" } }]);
});

test("Zones: create a zone with outline and names in sv, fr, en (POST /admin/zones)", async ({ page }) => {
  const server = await open(page, "/zones?country=TN");
  await page.locator('.zn-hero-actions [data-command="admin.zone.create"]').click();
  await page.locator(".zn-cities .zn-city", { hasText: "Sousse" }).click();
  await page.getByLabel("Namn på svenska").fill("Sousse centrum");
  await page.getByLabel("Namn på franska").fill("Sousse centre");
  await page.getByLabel("Namn på engelska").fill("Sousse centre");
  await expect(page.getByLabel("Zon-id")).toHaveValue("TN-SC");
  await shot(page, "admin-zone-create-names-sv");
  await page.getByRole("button", { name: "Nästa: formen" }).click();
  await page.getByRole("radio", { name: /Hela staden/ }).click();
  await page.getByRole("button", { name: "Nästa: kontrollera och spara" }).click();
  await expect(page.getByTestId("zone-create-closed")).toBeVisible();
  await expect(page.locator(".zn-inside")).toHaveCount(0);
  await shot(page, "admin-zone-create-form-sv");
  await page.getByRole("button", { name: "Skapa zon" }).click();
  await confirm(page);
  await expect.poll(() => server.sent.find((s) => s.method === "POST" && s.path === "/api/v1/admin/zones")?.body).toMatchObject({ zoneId: "TN-SC", names: { sv: "Sousse centrum", fr: "Sousse centre", en: "Sousse centre" }, country: "TN", currency: "TND", timeZone: "Africa/Tunis", kind: "operating" });
  const body = server.sent.find((s) => s.method === "POST" && s.path === "/api/v1/admin/zones")!.body as { polygon: unknown[] };
  expect(body.polygon.length).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("zones-server")).toContainText("0 öppna · 2 stängda");
});

test("Zones: close FR-PC in the confirm box; a stale version reloads with a message", async ({ page }) => {
  const server = await open(page, "/zones?country=FR&zone=FR-PC");
  const actions = page.getByTestId("live-zone-actions");
  await actions.getByRole("button", { name: "Stäng zon" }).click();
  await expect(page.locator(".modal.open").getByTestId("zone-open-summary")).toContainText("Resenärer kan inte boka nya resor här");
  await shot(page, "admin-zone-close-confirm-sv");
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.path.endsWith("/close")).map((s) => s.body?.["expectedVersion"])).toEqual([1]);
  await expect(actions.getByRole("button", { name: "Öppna zon" })).toBeVisible();

  await actions.getByRole("button", { name: "Öppna zon" }).click();
  // Another admin changes the zone while the confirm box is open.
  server.bump("FR-PC");
  await confirm(page);
  await expect(page.getByText("Zonen har ändrats sedan du såg den.").first()).toBeVisible();
  await expect.poll(() => server.sent.filter((s) => s.method === "GET").length).toBeGreaterThan(1);
});

test("Zones: a failed GET /admin/zones shows Not connected yet with Try again, never the built-in list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: SV_ADMIN });
  let fail = true;
  await page.route(/\/api\/v1\/admin\/zones(\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (fail) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify({ code: "unavailable", message: "The server is busy.", requestId: "r-503", retryable: true }) });
    return route.fallback();
  });
  await signIn(page, "Kontrollpanel");
  await page.goto("/zones?country=FR");
  await expect(page.getByTestId("zones-not-connected")).toHaveText("Inte kopplad än");
  await expect(page.getByRole("region", { name: "Zoner per stad" })).not.toContainText("Rive Gauche");
  await page.locator('[data-command="admin.ui.zones"].zone-trigger').click();
  await expect(page.locator(".zone-menu")).not.toContainText("FR-RG");
  await page.keyboard.press("Escape");
  fail = false;
  await page.getByRole("button", { name: "Försök igen" }).click();
  await expect(page.getByTestId("zones-server")).toContainText("3 öppna · 0 stängda");
});
