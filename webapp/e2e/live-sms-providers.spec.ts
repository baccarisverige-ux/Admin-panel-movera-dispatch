import { expect, test } from "@playwright/test";
import { ADMIN, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.18.168 (contract.json#smsProviders; owner 2026-11-26 "Infobip + 46elks en secours (Recommandé)"): Pricing ›
 * Tips & limits, Sweden Standard: "SMS company order" on both SMS cards (default 46elks, then Infobip; owner "Keep 46elks working primary until we fix Infobip"). A change is one
 * line in the confirm and is saved as providerOrder; the default is not written.
 */
for (const language of ["en", "sv", "fr"] as const) {
  test(`SMS company order on both SMS cards (${language})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await fakeTripServer(page, { admin: { language: "en", permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish"] } });
    const server = await fakeSettings(page);
    await signIn(page);
    if (language !== "en") await page.getByTestId("language-quick-switch").getByRole("button", { name: language === "sv" ? /Svenska/ : /Français/ }).click();
    await page.goto("/pricing?tab=extras&scope=standard-SE");
    const card = page.getByTestId("sms-sign-in");
    const order = page.getByTestId("sms-sign-in-order").locator("select");
    await expect(order).toHaveValue("46elks,infobip");
    await expect(page.getByTestId("sms-other-order").locator("select")).toHaveValue("46elks,infobip");
    await card.scrollIntoViewIfNeeded();
    if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/${language}-1-sms-sign-in-card.png` });
    const other = page.getByTestId("sms-other-countries");
    if (process.env.SHOTS) await other.screenshot({ path: `${process.env.SHOTS}/${language}-2-sms-other-countries-card.png` });
    await page.getByTestId("sms-sign-in-order").locator('[data-command], button, [role="button"]').first().click().catch(() => undefined);
    if (process.env.SHOTS) await page.locator(".setting-info-pop, [role=dialog], [role=tooltip]").first().screenshot({ path: `${process.env.SHOTS}/${language}-3-i-text.png` }).catch(() => undefined);
    await page.keyboard.press("Escape");
    await order.selectOption("infobip,46elks");
    server.sent.length = 0;
    const pending = page.getByRole("list", { name: /Unsaved changes|Osparade|non enregistr/i });
    if (language === "en") await expect(pending).toContainText("SMS company order: 46elks, then Infobip (backup) → Infobip, then 46elks (backup)");
    if (process.env.SHOTS) await pending.screenshot({ path: `${process.env.SHOTS}/${language}-4-unsaved-change.png` });
    await page.getByTestId("pricing-extras").locator('[data-command="admin.pricing.saveCountry"]').click();
    const modal = page.getByRole("dialog").last();
    if (process.env.SHOTS) await modal.screenshot({ path: `${process.env.SHOTS}/${language}-5-confirm.png` });
    await modal.getByRole("button").filter({ hasText: /^(Confirm|Bekräfta|Confirmer)$/ }).click();
    const sent = () => server.sent.filter((call) => call.method === "PUT" && call.path.includes("country_rules") && call.body?.["country"] === "SE").map((call) => call.body!["document"] as Record<string, unknown>);
    await expect.poll(() => sent().length).toBe(1);
    expect((sent()[0]!["smsSignIn"] as { providerOrder?: unknown }).providerOrder).toEqual(["infobip", "46elks"]);
    expect("providerOrder" in ((sent()[0]!["smsSignInOtherCountries"] as object | undefined) ?? {})).toBe(false);
  });
}
