import { expect, test } from "@playwright/test";
import { ADMIN, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Live bug 2026-11-19 (Rules audits/impact/admin-tipslimits-reset.md), in the browser against the faked server: the
 * admin looks at a ZONE on Pricing › Tips & limits with the country Standard also chosen at the top, changes one tip
 * and saves. The Standard must keep its own emergency numbers, SOS SMS switch and money limits; the confirm lists the
 * tip only.
 */
const SEK = (kr: number) => ({ amountMinor: kr * 100, currency: "SEK" });
const NUMBERS = [{ kind: "police", number: "114 14", label: { sv: "Polis", fr: "Police", en: "Police" } }];
const STANDARD_ONLY = { emergencyNumbers: NUMBERS, sosContactsSms: false, walletCreditMax: SEK(5000), maxRiderDebt: SEK(300), driverOwesLimit: { enabled: true, max: SEK(800) } };

test("Tips & limits: a zone shown + the Standard chosen: the save does not reset the Standard's emergency numbers, SOS SMS or money limits", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeTripServer(page, { admin: { language: "en", permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit"] } });
  const server = await fakeSettings(page);
  const docs = server.docs as unknown as Map<string, { document: Record<string, unknown> }>;
  const standard = docs.get("country_rules:standard-SE")!;
  docs.set("country_rules:standard-SE", { ...standard, document: { ...standard.document, ...STANDARD_ONLY } });
  await signIn(page, "Dashboard");
  // Both scopes chosen at the top; the zone Södermalm (Z002, with Tips & limits of its own) is the one shown.
  await page.goto("/pricing?tab=extras&scope=Z002,standard-SE&zone=Z002");
  const panel = page.getByTestId("pricing-extras");
  await expect(panel.getByLabel("Tip 2", { exact: true })).toHaveValue("35");
  // The country's emergency number is shown read-only on the zone.
  await expect(panel.getByTestId("emergency-numbers-country-only")).toBeVisible();
  await expect(panel.getByLabel("Emergency number 1", { exact: true })).toHaveValue("114 14");
  await expect(panel.getByLabel("Emergency number 1", { exact: true })).toBeDisabled();

  await panel.getByLabel("Tip 1", { exact: true }).fill("12");
  server.sent.length = 0;
  await panel.locator('[data-command="admin.pricing.saveCountry"]').click();
  const modal = page.locator(".modal.open").last();
  await modal.locator('[data-command="admin.confirm.tickAll"]').click();
  // The confirm and its "!" name the tip change only.
  await modal.locator('[data-command="admin.confirm.info"]').click();
  await expect(modal.getByTestId("confirm-info-from-to")).toContainText("Tips:");
  await expect(modal).not.toContainText(/Emergency numbers|emergency contacts on SOS|Max rider debt|owes-limit/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tips-zone-shown-standard-chosen-confirm.png` });
  const reason = modal.getByLabel(/^Reason$/);
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: /^Confirm$/ }).click();

  const sentToStandard = () => server.sent.filter((call) => call.method === "PUT" && call.path.includes("country_rules") && call.body?.["country"] === "SE").map((call) => call.body!["document"] as Record<string, unknown>);
  await expect.poll(() => sentToStandard().length).toBe(1);
  const document = sentToStandard()[0]!;
  expect((document["tips"] as Array<{ amount: unknown }>)[0]!.amount).toEqual(SEK(12));
  expect(document["emergencyNumbers"]).toEqual(NUMBERS);
  expect(document["sosContactsSms"]).toBe(false);
  expect(document["walletCreditMax"]).toEqual(SEK(5000));
  expect(document["maxRiderDebt"]).toEqual(SEK(300));
  expect(document["driverOwesLimit"]).toEqual({ enabled: true, max: SEK(800) });
  // The zone's own document never carries a Standard-only key.
  const zone = server.sent.find((call) => call.method === "PUT" && call.path.includes("country_rules") && call.body?.["zoneId"] === "Z002")!.body!["document"] as Record<string, unknown>;
  for (const key of Object.keys(STANDARD_ONLY)) expect(key in zone).toBe(false);
});
