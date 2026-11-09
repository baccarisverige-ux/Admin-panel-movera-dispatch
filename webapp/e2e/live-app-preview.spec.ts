import { expect, test, type Page } from "@playwright/test";
import { ADMIN, API, fakeContent, fakeTripServer, signIn } from "./live-fake";

/**
 * Step 24 (owner Q31, 2026-11-09; START-HERE / plan U1): the real app preview opens the real rider / driver web app in a
 * NEW TAB with no opener, never in a frame on the admin page. Before this change a same-origin frame could read the admin
 * tab (its page and its sessionStorage sign-in). Screenshot (en, 1440) goes to SHOTS.
 */
const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const PREVIEW_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish"] };

test("the real app preview opens in a new tab (noopener), no frame on the admin page", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: PREVIEW_ADMIN });
  await fakeContent(page);
  const sessions: unknown[] = [];
  await page.route(`${API}/api/v1/admin/preview-sessions`, async (route) => {
    const body = route.request().postDataJSON() as { role: string; zoneId: string; useDraft: boolean };
    sessions.push(body);
    await route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify({ token: "prev.tok.1", role: body.role, zoneId: body.zoneId, useDraft: body.useDraft, expiresAt: "2026-11-09T13:15:00Z", subjectId: `preview:${body.role}:${body.zoneId}` }) });
  });
  // The real app's address is answered locally: no network to github.io in a test.
  await context.route("https://baccarisverige-ux.github.io/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body><h1>app</h1></body></html>" }));
  await signIn(page);
  await page.goto("/content?zone=Z001");
  await expect(page.getByRole("heading", { level: 2, name: "Content" })).toBeVisible();

  const button = page.getByRole("button", { name: "Open the real app in a new tab" }).first();
  await expect(button).toBeVisible();
  await shot(page, "admin-content-preview-new-tab");
  // No frame anywhere on the page: nothing of the admin tab is shared with app code.
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(sessions.length).toBeGreaterThan(0);

  const [popup] = await Promise.all([context.waitForEvent("page"), button.click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/^https:\/\/baccarisverige-ux\.github\.io\/.+\/live\/#movera-preview=prev\.tok\.1&zone=Z001&draft=0$/);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(await popup.evaluate(() => sessionStorage.getItem("movera-admin-live-session"))).toBeNull();
  await popup.close();
});
