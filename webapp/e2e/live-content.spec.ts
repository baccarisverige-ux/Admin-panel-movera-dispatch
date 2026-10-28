import { expect, test, type Page } from "@playwright/test";
import { ADMIN, fakeContent, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.10.0 §19 (owner 2026-10-28) in the live Content page: three language boxes (sv, fr, en all required),
 * Publish sends POST /admin/content/{slot}/publish with the zones chosen at the top (one admin), history and rollback
 * from the server, two app version pairs, and the legal acceptance list. Screenshots (sv, 1440) go to SHOTS.
 */

const SHOTS = process.env.SHOTS;
const SV_ADMIN = { language: "sv", permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish"] };
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const confirm = async (page: Page) => {
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^(Reason|Skäl)$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^(Confirm|Bekräfta)$/ }).click();
};

async function open(page: Page, query = "zone=Z001") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: SV_ADMIN });
  const server = await fakeContent(page);
  await signIn(page, "Kontrollpanel");
  await page.goto(`/content?${query}`);
  await expect(page.getByRole("heading", { level: 2, name: "Innehåll" })).toBeVisible();
  return server;
}

test("Content: three languages, publish to the chosen zones (one admin), history and rollback from the server", async ({ page }) => {
  const server = await open(page, "scope=Z001,Z002");
  await expect(page.getByText("En andra agent måste publicera")).toHaveCount(0);
  await expect(page.getByLabel("Svenskt innehåll")).toHaveValue("Kör säkert i dag.");
  await expect(page.getByLabel("Franskt innehåll")).toHaveValue("Conduisez prudemment aujourd'hui.");
  await expect(page.getByLabel("Engelskt innehåll")).toHaveValue("Drive safely today.");
  await expect(page.getByTestId("live-content-history")).toContainText("v2");
  await shot(page, "admin-content-live-languages-sv");

  await page.getByLabel("Franskt innehåll").fill("");
  await expect(page.getByRole("button", { name: "Publicera", exact: true })).toBeDisabled();
  await page.getByLabel("Franskt innehåll").fill("Bonne route !");
  await page.getByRole("button", { name: "Publicera", exact: true }).click();
  await expect(page.locator(".modal.open").getByTestId("publish-targets")).toHaveText("Publiceras till: Norrmalm, Södermalm. Ingen annan zon ändras.");
  await shot(page, "admin-content-publish-confirm-zones-sv");
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.path === "/api/v1/admin/content/driver-home/publish").map((s) => s.body)).toEqual([
    { zoneIds: ["Z001", "Z002"], title: "Välkommen", text: { sv: "Kör säkert i dag.", fr: "Bonne route !", en: "Drive safely today." } },
  ]);
  await expect(page.getByTestId("live-content-history")).toContainText("v3");

  await page.getByRole("button", { name: "Återställ till v1" }).click();
  await confirm(page);
  await expect.poll(() => server.sent.filter((s) => s.path.endsWith("/rollback")).map((s) => s.body)).toEqual([{ zoneId: "Z001", version: 1 }]);
});

test("Content: app versions has two pairs (rider and driver app) sent as versions", async ({ page }) => {
  const server = await open(page);
  await page.getByLabel("Innehållsplats").selectOption("app-versions");
  for (const [label, value] of [["Svenskt innehåll", "Uppdatera appen"], ["Franskt innehåll", "Mettre à jour l'app"], ["Engelskt innehåll", "Update the app"], ["Lägsta version, resenärsappen", "1.2.0"], ["Rekommenderad version, resenärsappen", "1.4.0"], ["Lägsta version, förarappen", "2.0.0"], ["Rekommenderad version, förarappen", "2.1.0"]] as const) await page.getByLabel(label).fill(value);
  await shot(page, "admin-content-app-versions-sv");
  await page.getByRole("button", { name: "Publicera", exact: true }).click();
  await confirm(page);
  await expect.poll(() => (server.sent.find((s) => s.path === "/api/v1/admin/content/app-versions/publish")?.body as { versions?: unknown } | undefined)?.versions).toEqual({ rider: { min: "1.2.0", recommended: "1.4.0" }, driver: { min: "2.0.0", recommended: "2.1.0" } });
});

test("Content: legal keeps 'users must accept again' and lists who accepted", async ({ page }) => {
  await open(page);
  await page.getByLabel("Innehållsplats").selectOption("legal");
  await expect(page.getByText("Användarna måste godkänna igen").first()).toBeVisible();
  const list = page.getByTestId("live-acceptances");
  await expect(list).toContainText("R1");
  await expect(list).toContainText("D1001");
  await expect(list).toContainText("Förare");
  await shot(page, "admin-content-legal-acceptances-sv");
});
