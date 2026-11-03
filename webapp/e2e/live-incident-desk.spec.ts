import { expect, test } from "@playwright/test";
import { LOST_INCIDENT, SOS_INCIDENT, fakeTripServer, signIn, type Incident } from "./live-fake";

/**
 * Incidents on live (contract v0.18.15 §39, contract.json#incidentDesk): the incident settings are saved on the
 * server, a case report download is recorded there, and calling the rider or driver says "Calls coming soon"
 * (owner G9 Q6). Fails before: Save settings and the call buttons were hidden on live and nothing reached the server.
 */
const SAFETY = ["overview.read", "trips.read", "riders.read", "drivers.read", "zones.read", "incidents.read", "safety.edit"];

test("incidents: settings saved on the server, report download recorded, calls coming soon", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: SAFETY }, incidents: [{ ...SOS_INCIDENT }, { ...LOST_INCIDENT }] as Incident[] });
  await signIn(page);
  await page.goto("/incidents");
  const view = page.getByRole("article").first();
  await expect(view.getByText("Calls coming soon").first()).toBeVisible();
  await expect(view.locator("a[href^='tel:112']").first()).toBeVisible();
  await view.getByRole("button", { name: "Case report" }).click();
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && /^\/api\/v1\/admin\/incidents\/[^/]+\/report$/.test(call.path))).toBe(true);
  await page.goto("/incidents?view=settings");
  await page.getByRole("switch", { name: /Live map on the case/ }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "PUT" && call.path === "/api/v1/admin/incidents/settings")?.body).toMatchObject({ expectedRev: 1, settings: { liveMap: false } });
});

test("A1 live fix 3: incident settings have a country choice and save for that country", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { permissions: SAFETY } });
  await signIn(page);
  await page.goto("/incidents?view=settings");
  await page.getByLabel("Settings for country").selectOption("FR");
  await expect.poll(() => state.calls.some((call) => call.method === "GET" && call.path.includes("/admin/incidents/settings") && call.path.includes("country=FR"))).toBe(true);
  await page.getByRole("switch", { name: /Live map on the case/ }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.find((call) => call.method === "PUT" && call.path.includes("/admin/incidents/settings"))?.body).toMatchObject({ country: "FR" });
});
