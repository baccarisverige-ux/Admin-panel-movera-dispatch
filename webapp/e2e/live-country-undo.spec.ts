import { expect, test, type Page } from "@playwright/test";
import { ADMIN, API, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Country undo (Rules audits/impact/country-undo.md), supervisor MF-R3-3: a browser look at the confirm dialogs in
 * en / sv / fr against the faked server (no live server, no sign-in to live). Screenshots go to SHOTS when it is set:
 * (a) the "!" open, (b) the zone pick with every zone and the Standard ticked and the where-it-lands text, (c) the
 * Tips & limits Undo dialog with its list of documents, (d, en only) Save tips & limits with Confirm off before the zones are ticked.
 */
const SHOTS = process.env.SHOTS;
const LANDING = { en: "Dashboard", sv: "Kontrollpanel", fr: "Tableau de bord" } as const;
const SAVE_ID = "2026-11-16T09:12:00Z/k3x9aa";
const note = (wasOnStandard: boolean) => `Tips & limits save ${SAVE_ID}${wasOnStandard ? " (used the Standard before)" : ""}`;
const entry = (version: number, publishedAt: string, extra: Record<string, unknown> = {}) => ({ version, publishedAt, publishedBy: "Nora Lind", action: "publish", document: {}, ...extra });

/** One Tips & limits save in History: the Standard (Tips & limits and the rider app), Z002, and Z001 that used the Standard before. */
async function oneSave(page: Page, docs: Map<string, Record<string, unknown>>) {
  const set = (key: string, change: Record<string, unknown>) => docs.set(key, { ...docs.get(key)!, ...change });
  set("country_rules:standard-SE", { version: 2, liveVersion: 2 });
  set("rider_app_config:standard-SE", { version: 2, liveVersion: 2 });
  set("country_rules:Z002", { version: 3, liveVersion: 3, usesStandard: false });
  set("country_rules:Z001", { version: 1, liveVersion: 1, usesStandard: false });
  const history: Record<string, unknown[]> = {
    "country_rules:country=SE": [entry(2, "2026-11-16T09:12:01Z", { note: note(false) }), entry(1, "2026-10-27T09:00:00Z")],
    "rider_app_config:country=SE": [entry(2, "2026-11-16T09:12:02Z", { note: note(false) }), entry(1, "2026-10-27T09:00:00Z")],
    "country_rules:zoneId=Z002": [entry(3, "2026-11-16T09:12:03Z", { note: note(false) }), entry(2, "2026-10-25T23:13:11Z")],
    "country_rules:zoneId=Z001": [entry(1, "2026-11-16T09:12:04Z", { note: note(true) })],
  };
  // Every other zone of Sweden uses the Standard (the fake knows only Z001 and Z002).
  await page.route(`${API}/api/v1/admin/config/*?zoneId=*`, async (route) => {
    const url = new URL(route.request().url());
    const zoneId = url.searchParams.get("zoneId") ?? "";
    const doc = url.pathname.split("/")[5]!;
    if (route.request().method() !== "GET" || docs.has(`${doc}:${zoneId}`) || !docs.has(`${doc}:standard-SE`)) return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ doc, version: 1, liveVersion: 0, usesStandard: true, document: docs.get(`${doc}:standard-SE`)!["document"], updatedAt: "2026-10-27T09:00:00Z" }) });
  });
  await page.route(`${API}/api/v1/admin/config/*/history**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") return route.fallback();
    const doc = url.pathname.split("/")[5];
    const scope = url.searchParams.get("country") ? `country=${url.searchParams.get("country")}` : `zoneId=${url.searchParams.get("zoneId")}`;
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: history[`${doc}:${scope}`] ?? [], nextCursor: null }) });
  });
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const card = page.locator(".modal.open .modal-card").last();
  await card.evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

for (const lang of ["en", "sv", "fr"] as const) {
  test(`country undo dialogs (${lang}): the "!" open, All zones + Standard ticked with where it lands, Tips & limits Undo`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await fakeTripServer(page, { admin: { language: lang, permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit"] } });
    const server = await fakeSettings(page);
    await oneSave(page, server.docs as unknown as Map<string, Record<string, unknown>>);
    await signIn(page, LANDING[lang]);
    await page.goto("/pricing?tab=extras&scope=all,standard-SE");
    const panel = page.getByTestId("pricing-extras");
    await expect(panel).toBeVisible();

    // (c) the Tips & limits Undo dialog: every document of the save is listed.
    const undo = panel.locator('[data-command="admin.tipsLimits.undo"]');
    await expect(undo).toBeEnabled({ timeout: 15_000 });
    await undo.click();
    const modal = page.locator(".modal.open").last();
    await expect(modal.getByTestId("command-details").locator("li")).toHaveCount(4);
    await expect(modal.locator('[data-command="admin.confirm.submit"]')).toBeDisabled();
    // Supervisor MF-R4-1: a disabled Confirm must look disabled (faded), not like an enabled one.
    expect(Number(await modal.locator('[data-command="admin.confirm.submit"]').evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(1);
    await shot(page, `c-tips-undo-${lang}`);
    await modal.locator('[data-command="admin.confirm.cancel"]').click();

    // (b) Save tips & limits: tick every zone and the Standard; the dialog says where it lands.
    const tip = panel.locator("input").first();
    await tip.fill(String(Number(await tip.inputValue()) + 1));
    await panel.locator('[data-command="admin.pricing.saveCountry"]').click();
    await expect(modal.getByTestId("where-pick")).toBeVisible();
    const confirmButton = modal.locator('[data-command="admin.confirm.submit"]');
    await expect(confirmButton).toBeDisabled();
    if (lang === "en") await shot(page, "d-confirm-disabled-zone-pick-en");
    await modal.locator('[data-command="admin.confirm.tickAll"]').click();
    await expect(modal.getByTestId("where-pick").getByTestId("where-lands")).not.toBeEmpty();
    await shot(page, `b-zone-pick-all-standard-${lang}`);

    // (a) the "!" open in the same dialog.
    await modal.locator('[data-command="admin.confirm.info"]').click();
    await expect(modal.getByTestId("confirm-info")).toBeVisible();
    await expect(modal.getByTestId("confirm-info").getByTestId("where-lands")).not.toBeEmpty();
    // cfgundo SF-R4-3: the From → to line is in the dialog's language, built from the values (ui/fromTo.ts).
    const fromTo = modal.getByTestId("confirm-info-from-to");
    await expect(fromTo).toContainText({ en: "Tips:", sv: "Dricks:", fr: "Pourboires :" }[lang]);
    if (lang !== "en") await expect(fromTo).not.toContainText(/\b(tips|raise|promo cap|none|driver bonus limit)\b/i);
    await fromTo.scrollIntoViewIfNeeded();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/a-info-open-${lang}.png`, fullPage: false });
    await modal.locator('[data-command="admin.confirm.cancel"]').click();
    expect(server.sent.filter((call) => call.method !== "GET")).toEqual([]);
  });
}
