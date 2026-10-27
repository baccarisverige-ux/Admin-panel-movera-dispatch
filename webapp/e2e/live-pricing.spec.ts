import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ACTIVE_TRIP, ADMIN, ARRIVED_TRIP, COMPLETED_TRIP, fakeTripServer, signIn } from "./live-fake";

/**
 * Owner decision 2026-10-27: the live Pricing page (GET/PUT /admin/config/pricing, POST …/publish) with the
 * no-show fee per zone, and "Waive fee" when an admin marks a no-show (POST /admin/trips/{id}/no-show, waiveFee).
 * PRICING_SHOTS=<dir> also saves screenshots of the screens for the owner.
 */

const PRICING_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "trips.intervene"] };
const SHOTS = process.env.PRICING_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
}

test("pricing: edit the no-show fee, save the draft and publish (one PUT, one publish)", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: PRICING_ADMIN });
  await signIn(page);
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Pricing" })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  const fee = page.getByLabel("Z001 Movera No-show fee");
  await expect(fee).toHaveValue("65");
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await fee.fill("70");
  await page.getByRole("button", { name: "Publish" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Publish prices for Z001");
  await expect(dialog.getByTestId("publish-changes")).toContainText("No-show fee: 65 → 70");
  await dialog.getByLabel("Note (optional)").fill("Owner decision");
  await dialog.getByRole("button", { name: "Publish" }).dblclick();
  await expect(page.getByRole("status")).toContainText("Prices published: live version 2.");
  const put = state.calls.filter((call) => call.method === "PUT");
  const publish = state.calls.filter((call) => call.path.endsWith("/publish"));
  expect(put).toHaveLength(1);
  expect(publish).toHaveLength(1);
  const sent = put[0]!.body as { expectedVersion: number; zoneId: string; document: { categories: Record<string, { waiting: { noShowFee: { amountMinor: number }; noShowAfterMin: number } }>; surge: unknown } };
  expect(sent.expectedVersion).toBe(1);
  expect(sent.zoneId).toBe("Z001");
  expect(sent.document.categories.economy!.waiting.noShowFee.amountMinor).toBe(7000);
  expect(sent.document.categories.comfort!.waiting.noShowFee.amountMinor).toBe(6500);
  expect(sent.document.surge, "fields the page does not show are sent back unchanged").toBeTruthy();
  expect(publish[0]!.body).toEqual({ expectedVersion: 2, zoneId: "Z001", note: "Owner decision" });
  expect(publish[0]!.headers["idempotency-key"]).toBeTruthy();
});

test("pricing: a second admin must approve (202), and no access without settings.read", async ({ page }) => {
  await fakeTripServer(page, { admin: PRICING_ADMIN, publishNeedsApproval: true });
  await signIn(page);
  await page.goto("/pricing");
  await page.getByLabel("Z001 Comfort Base fare").fill("40");
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status")).toContainText("The prices wait for a second admin to approve.");
});

test("pricing: no access without settings.read, and nothing is asked of the server", async ({ page }) => {
  const state = await fakeTripServer(page);
  await signIn(page);
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 2, name: "No access" })).toBeVisible();
  expect(state.calls.some((call) => call.path.includes("/admin/config/"))).toBe(false);
});

test("no-show: waive fee sends waiveFee true; the note is required; only from accepted/driver_to_pickup/arrived", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: PRICING_ADMIN, trips: [COMPLETED_TRIP, ACTIVE_TRIP, ARRIVED_TRIP].map((trip) => ({ ...trip })) });
  await signIn(page);
  await page.goto("/trips/T2002");
  await expect(page.getByRole("heading", { level: 2, name: "T2002" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark no-show" })).toHaveCount(0);
  await page.goto("/trips/T2004");
  await page.getByRole("button", { name: "Mark no-show" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Mark no-show" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Note (required)").fill("Rider did not come");
  await dialog.getByLabel("Waive fee").check();
  await expect(dialog).toContainText("The rider pays nothing");
  await confirm.dblclick();
  await expect(page.getByRole("status")).toContainText("Marked as no-show. No fee is charged.");
  const posts = state.calls.filter((call) => call.path.endsWith("/no-show"));
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toEqual({ expectedVersion: 5, note: "Rider did not come", waiveFee: true });
});

test("no-show without waiving sends no waiveFee", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: PRICING_ADMIN, trips: [{ ...ARRIVED_TRIP }] });
  await signIn(page);
  await page.goto("/trips/T2004");
  await page.getByRole("button", { name: "Mark no-show" }).click();
  await page.getByRole("dialog").getByLabel("Note (required)").fill("Rider did not come");
  await page.getByRole("dialog").getByRole("button", { name: "Mark no-show" }).click();
  await expect(page.getByRole("status")).toContainText("The zone's no-show fee is charged.");
  expect(state.calls.find((call) => call.path.endsWith("/no-show"))!.body).toEqual({ expectedVersion: 5, note: "Rider did not come" });
});

for (const [language, landing, pricing, publish, noShow, waive] of [
  ["en", "Drivers", "Pricing", "Publish", "Mark no-show", "Waive fee"],
  ["sv", "Förare", "Priser", "Publicera", "Markera utebliven resenär", "Efterskänk avgiften"],
  ["fr", "Chauffeurs", "Tarifs", "Publier", "Marquer absent", "Annuler les frais"],
] as const) {
  for (const width of [1280, 390]) {
    test(`${language} ${width}px: pricing, publish confirmation and no-show dialog`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await fakeTripServer(page, { admin: { ...PRICING_ADMIN, language }, trips: [{ ...ARRIVED_TRIP }] });
      await signIn(page, landing);
      const tag = `${language}-${width === 390 ? "phone" : "desktop"}`;
      await page.goto("/pricing");
      await expect(page.getByRole("heading", { level: 2, name: pricing })).toBeVisible();
      await expect(page.getByTestId("live-pricing")).toBeVisible();
      await noSideScroll(page, `${tag} pricing`);
      await page.locator("input[aria-label$='No-show fee']").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
      await shot(page, `${tag}-1-pricing`);
      await page.locator("input[aria-label$='No-show fee']").first().fill("70");
      await page.getByRole("button", { name: publish, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await shot(page, `${tag}-2-publish-confirm`);
      await page.getByRole("dialog").getByRole("button", { name: publish, exact: true }).click();
      await expect(page.getByRole("status")).toBeVisible();
      await page.goto("/trips/T2004");
      await page.getByRole("button", { name: noShow }).click();
      await page.getByRole("dialog").locator("textarea").fill("Test");
      await page.getByRole("dialog").getByLabel(waive).check();
      await noSideScroll(page, `${tag} no-show`);
      await shot(page, `${tag}-3-no-show-waive`);
    });
  }
}
