import { expect, test } from "@playwright/test";
import { ADMIN, fakeTripServer, signIn } from "./live-fake";

/**
 * A1 live fix 5 (contract v0.18.18, owner 2026-11-03 "Real name from Team"): every admin sets a first name in Team;
 * the panel shows it instead of an e-mail, "Admin" until set. Fails before: no first-name fields, names were e-mails.
 */
test("Team: my first name and other admins' first names are saved; no e-mail shown as a name", async ({ page }) => {
  const state = await fakeTripServer(page, { admin: { firstName: undefined, permissions: [...ADMIN.permissions, "team.read", "team.edit"] } });
  await signIn(page);
  await page.goto("/team");
  const box = page.getByTestId("live-team-names");
  await expect(box).toContainText("Admin · ");
  await box.getByLabel("My first name").fill("owner@movera.se");
  await expect(box.getByRole("button", { name: "Save" }).first()).toBeDisabled();
  await box.getByLabel("My first name").fill("Nora");
  await box.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => state.calls.find((call) => call.method === "PATCH" && call.path === "/api/v1/admin/auth/me")?.body).toEqual({ firstName: "Nora" });
  await box.getByLabel("First name of Admin").fill("Erik");
  await box.getByRole("button", { name: "Save" }).last().click();
  await expect.poll(() => state.calls.find((call) => call.method === "PATCH" && call.path === "/api/v1/admin/agents/A2")?.body).toEqual({ firstName: "Erik" });
  await expect(page.locator("body")).not.toContainText("owner@movera.se ·");
  // Checker LOW6: an empty box clears my name ("Admin" again).
  await box.getByLabel("My first name").fill("");
  await box.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => state.calls.filter((call) => call.method === "PATCH" && call.path === "/api/v1/admin/auth/me").at(-1)?.body).toEqual({ firstName: null });
});
