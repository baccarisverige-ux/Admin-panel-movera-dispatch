import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * A1 live check 2026-11-03 (Rules audits/live-a1-2026-11-03.md): English words on Swedish admin pages. Fails before:
 * the Reviews tabs, "Send a warning", "Snoozed / Muted" and the incident save dialog were English.
 */
const SV = { admin: { language: "sv", permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "incidents.read", "safety.edit", "alerts.manage"] } };

test("Reviews, Alerts and the incident save dialog are Swedish", async ({ page }) => {
  await fakeTripServer(page, SV);
  await signIn(page, "Kontrollpanel");
  await page.goto("/reviews?tab=rules");
  await expect(page.getByRole("tab", { name: "Betyg per person" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Omdömen" })).toBeVisible();
  await expect(page.getByText("Skicka en varning")).toBeVisible();
  await expect(page.getByText("Send a warning")).toHaveCount(0);
  await page.goto("/alerts");
  await expect(page.getByText("Pausade", { exact: true })).toBeVisible();
  await expect(page.getByText("Tystade", { exact: true })).toBeVisible();
  await page.goto("/incidents?view=settings");
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: "Spara inställningar" }).click();
  await expect(page.getByRole("dialog")).toContainText("Sparar incidentinställningarna för alla admins.");
  await expect(page.getByRole("dialog")).not.toContainText("incident settings");
});
