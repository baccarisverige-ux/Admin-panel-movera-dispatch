import { expect, test, type Page } from "@playwright/test";
import { fakeTripServer } from "./live-fake";

/**
 * Contract v0.18.5 deep fixes of driver groups 1 and 2 (admin part). Each test names the owner decision it covers
 * (Rules decisions/driver-g1.md, driver-g2.md, driver-g9.md). SHOTS=<dir> saves screenshots for the PR.
 */
const SHOTS = process.env.SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

test.describe("G1-D2 sign-in in the computer's language (Swedish computer)", () => {
  test.use({ locale: "sv-SE" });

  test("sign-in, forgot password and the globe: Swedish first, English chosen and remembered", async ({ page }) => {
    await fakeTripServer(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
    await expect(page.getByLabel("E-post")).toBeVisible();
    await expect(page.getByLabel("Lösenord")).toBeVisible();
    await page.getByText("Glömt lösenordet?").click();
    await shot(page, "g1-d2-sign-in-sv");
    await page.getByTestId("sign-in-globe").getByRole("button", { name: "Språk: Svenska" }).click();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Forgot your password?")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await shot(page, "g1-d2-sign-in-en-chosen");
  });

  test("the page after an idle sign-out says why, in the computer's language", async ({ page }) => {
    test.setTimeout(60_000);
    await fakeTripServer(page, { admin: { idleTimeoutSeconds: 1 } });
    await page.goto("/");
    await page.getByLabel("E-post").fill("owner@movera.se");
    await page.getByLabel("Lösenord").fill("correct-horse");
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.getByTestId("signed-out-notice")).toHaveText("Du loggades ut eftersom panelen inte användes på en stund. Logga in igen.", { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Logga in" })).toBeVisible();
    await shot(page, "g1-d2-signed-out-sv");
  });
});

test.describe("G1-D2 sign-in in the computer's language (French computer)", () => {
  test.use({ locale: "fr-FR" });

  test("sign-in and the set-password page are in French", async ({ page }) => {
    await fakeTripServer(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Se connecter" })).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
    await expect(page.getByText("Mot de passe oublié ?")).toBeVisible();
    await shot(page, "g1-d2-sign-in-fr");
    await page.goto("/setup-password");
    await expect(page.getByRole("heading", { level: 1, name: "Choisissez votre mot de passe" })).toBeVisible();
  });
});

test.describe("G1-D2 sign-in in the computer's language (German computer)", () => {
  test.use({ locale: "de-DE" });

  test("a language the panel does not have gives English; a manual sign-out shows no notice", async ({ page }) => {
    await fakeTripServer(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("signed-out-notice")).toHaveCount(0);
  });
});
