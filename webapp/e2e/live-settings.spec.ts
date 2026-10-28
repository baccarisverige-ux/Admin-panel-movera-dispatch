import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.8.0 settings flow in the live panel (owner 2026-10-27): each country's Standard edited like a zone,
 * "Uses standard" on zones without settings of their own, "Go back to Standard" with a confirm step, publishing at
 * once (no second admin), the driver's share of the cancel fee in Dispatch, and "Not connected yet" on Settings
 * controls with no server field. Screenshots (sv) go to SHOTS when it is set.
 */

const SHOTS = process.env.SHOTS;
const SV_ADMIN = { language: "sv", permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit"] };
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

test("Pricing: the Standard for Sweden, 'Uses standard' on a zone, and Go back to Standard for a zone with its own", async ({ page }) => {
  await fakeTripServer(page, { admin: SV_ADMIN });
  const server = await fakeSettings(page);
  await signIn(page, "Kontrollpanel");
  await page.goto("/pricing?scope=all,standard-SE&zone=standard-SE");
  await expect(page.getByTestId("standard-bar")).toContainText("Standard för Sverige");

  await expect(page.getByTestId("uses-standard-Z001")).toHaveText("Använder standard");
  await expect(page.getByTestId("uses-standard-Z002")).toHaveCount(0);
  await shot(page, "admin-pricing-standard-sv");

  await page.goto("/pricing?scope=all,standard-SE&zone=Z001");
  await expect(page.getByTestId("standard-bar")).toContainText("använder standarden för Sverige");
  await shot(page, "admin-pricing-uses-standard-sv");

  await page.goto("/pricing?scope=all,standard-SE&zone=Z002");
  const bar = page.getByTestId("standard-bar");
  await expect(bar).toContainText("har egna inställningar");
  await shot(page, "admin-pricing-own-settings-sv");
  await bar.getByRole("button", { name: "Gå tillbaka till standard" }).click();
  await expect(page.locator(".modal.open")).toContainText("Historik");
  await shot(page, "admin-pricing-go-back-confirm-sv");
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.path.endsWith("/use-standard")).map((s) => s.body)).toEqual([{ zoneId: "Z002", expectedVersion: 3 }]);
  await expect(page.getByTestId("uses-standard-Z002")).toHaveText("Använder standard");
});

test("Dispatch: the driver's share of the cancel fee; publishing goes live at once (no second admin) to the server", async ({ page }) => {
  await fakeTripServer(page, { admin: SV_ADMIN });
  const server = await fakeSettings(page);
  await signIn(page, "Kontrollpanel");
  await page.goto("/dispatch?zone=Z002&tab=rides");
  const share = page.getByLabel("Förarens andel av avbokningsavgiften");
  await expect(share).toHaveValue("100");
  await share.fill("80");
  await shot(page, "admin-dispatch-cancel-share-sv");
  const publish = page.getByRole("region", { name: "Publicera" });
  await publish.getByRole("button", { name: "Publicera nu" }).click();
  await expect(page.getByTestId("publish-targets")).toHaveText("Publiceras till: Södermalm. Ingen annan zon ändras.");
  await shot(page, "admin-dispatch-publish-confirm-zones-sv");
  await confirm(page);
  // The driver document (its cancel share) goes live at once; the dispatch rules did not change, so they are not sent.
  await expect.poll(() => server.sent.filter((s) => s.method === "POST").map((s) => s.path)).toContain("/api/v1/admin/config/driver_app_config/publish");
  expect(server.sent.some((s) => s.path.includes("/admin/config/dispatch/publish"))).toBe(false);
  const driver = server.sent.find((s) => s.method === "PUT" && s.path.endsWith("/driver_app_config"))!;
  expect(((driver.body!["document"] as Record<string, Record<string, unknown>>)["cancelFees"])!["driverSharePct"]).toBe(80);
  await expect(page.getByText(/Väntar på en andra admin/)).toHaveCount(0);
  await shot(page, "admin-dispatch-published-sv");
});

test("Settings: publish without Send for approval or Approve; scheduled publish and expiry are not connected yet", async ({ page }) => {
  await fakeTripServer(page, { admin: SV_ADMIN });
  await fakeSettings(page);
  await signIn(page, "Kontrollpanel");
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Skicka för godkännande" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Godkänn" })).toHaveCount(0);
  await expect(page.getByTestId("control-not-connected").first()).toHaveText("Inte kopplad än");
  await page.getByRole("heading", { name: /Granska och publicera/ }).scrollIntoViewIfNeeded();
  await shot(page, "admin-settings-publish-sv");
});

test("Scope at the top: the Standard can be chosen beside the zones; Settings publishes only to the chosen zone", async ({ page }) => {
  await fakeTripServer(page, { admin: SV_ADMIN });
  const server = await fakeSettings(page);
  await signIn(page, "Kontrollpanel");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/settings?scope=Z002");
  await page.getByRole("button", { name: /^Zoner:/ }).first().click();
  const menu = page.getByRole("group", { name: /Zoner i/ });
  await expect(menu.getByText("Standard för Sverige")).toBeVisible();
  await shot(page, "admin-scope-choice-sv");
  await page.keyboard.press("Escape");
  await page.locator("article.panel", { has: page.getByRole("heading", { name: "Funktioner", exact: true }) }).locator("label.check-row input[type=checkbox]").first().click();
  await page.getByRole("button", { name: "Spara utkast" }).first().click();
  await expect(page.getByText("Utkastet sparat i den här sessionen.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Publicera", exact: true }).click();
  await expect(page.getByTestId("publish-targets")).toHaveText("Publiceras till: Södermalm. Ingen annan zon ändras.");
  await shot(page, "admin-settings-publish-confirm-zones-sv");
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.method === "POST").length).toBeGreaterThan(0);
  const written = server.sent.filter((s) => s.method !== "GET").map((s) => s.body?.["zoneId"] ?? s.body?.["country"]);
  expect(new Set(written)).toEqual(new Set(["Z002"]));
});

test("Tips & limits (v0.8.1, owner 2026-10-28): shown for the zone chosen at the top and saved only to the chosen zones", async ({ page }) => {
  await fakeTripServer(page, { admin: SV_ADMIN });
  const server = await fakeSettings(page);
  await signIn(page, "Kontrollpanel");
  await page.goto("/pricing?tab=extras&scope=Z002");
  const panel = page.getByTestId("pricing-extras");
  await expect(panel.getByRole("heading", { name: /Dricks och gränser · Södermalm/ })).toBeVisible();
  await expect(panel).toContainText("Bara för zonerna som är valda högst upp");
  await expect(panel.getByLabel("Tip 2", { exact: true })).toHaveValue("35");
  await shot(page, "admin-tips-zone-sv");
  await page.goto("/pricing?tab=extras&scope=Z001");
  await expect(page.getByTestId("standard-bar")).toBeVisible();
  await expect(page.getByTestId("pricing-extras").getByLabel("Tip 1", { exact: true })).toHaveValue("10");
  await page.goto("/pricing?tab=extras&scope=Z001,Z002");
  await expect(page.getByTestId("pricing-extras").getByRole("heading", { name: /Norrmalm, Södermalm/ })).toBeVisible();
  await page.getByTestId("pricing-extras").getByLabel("Tip 1", { exact: true }).fill("12");
  await shot(page, "admin-tips-two-zones-sv");
  server.sent.length = 0;
  await page.getByTestId("pricing-extras").getByRole("button", { name: /Spara dricks och gränser/ }).click();
  await expect(page.getByTestId("publish-targets")).toContainText("Norrmalm, Södermalm");
  await shot(page, "admin-tips-confirm-sv");
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.method === "PUT" && s.path.includes("country_rules")).map((s) => s.body?.["zoneId"])).toEqual(["Z001", "Z002"]);
  expect(server.sent.some((s) => s.method !== "GET" && s.body?.["country"] === "SE")).toBe(false);
});
