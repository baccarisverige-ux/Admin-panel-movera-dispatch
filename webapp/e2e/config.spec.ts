import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
}

async function confirm(page: Page) {
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
}

test("configuration draft is saved, approved by a second agent, published and rolled back as a new version", async ({ page }) => {
  test.setTimeout(75_000);
  await signIn(page, "nora@movera.se");
  await page.getByRole("link", { name: "Settings", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Apple Pay" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Show rating" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Luxury" })).toHaveCount(0);
  await expect(page.getByLabel("Max stops")).toHaveValue("3");
  await expect(page.getByLabel("Rider iOS minimum")).toHaveValue("1.0.0");
  await expect(page.getByLabel("Rider iOS message")).toHaveValue("A new version of Movera is available.");
  await expect(page.getByRole("list", { name: "Configuration diff" })).toContainText("No unpublished changes");
  await expect(page.locator("[data-config-dirty='no']")).toBeVisible();

  await page.getByRole("checkbox", { name: "Wallet", exact: true }).uncheck();
  await expect(page.getByRole("list", { name: "Configuration diff" })).toContainText("Wallet on → off");
  await page.getByLabel("Rider app").fill("1.1.0");
  await expect(page.getByRole("list", { name: "Configuration diff" })).toContainText("Rider app 1.0.0 → 1.1.0");

  // Cancel reasons are edited only in Dispatch › Cancel reasons; Config keeps the support reasons.
  await expect(page.getByTestId("config-reasons-moved").getByRole("link", { name: "Dispatch › Cancel reasons" })).toHaveAttribute("href", "/dispatch?view=reasons");
  await expect(page.getByLabel("wait_too_long Swedish")).toHaveCount(0);
  await page.getByLabel("charged_twice Swedish").fill("");
  await expect(page.getByText(/Missing translation: charged_twice/)).toBeVisible();
  await page.getByLabel("charged_twice Swedish").fill("Drog två gånger");

  await page.getByRole("checkbox", { name: "Reservations in this zone" }).uncheck();
  await expect(page.getByRole("list", { name: "Configuration diff" })).toContainText("op-norrmalm");
  await expect(page.locator("[data-effective='zone']")).toContainText("Winning level: zone");
  await expect(page.locator("[data-config-dirty='yes']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for approval" })).toBeDisabled();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved through AdminApi.")).toBeVisible();
  await expect(page.locator("[data-config-dirty='no']")).toBeVisible();

  await page.getByRole("button", { name: "Send for approval" }).click();
  await confirm(page);
  await expect(page.getByText("Sent for approval.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Lena Berg · ops" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("lena@movera.se");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();

  await page.getByRole("button", { name: "Approve" }).click();
  await confirm(page);
  await expect(page.getByText("Approved. A second agent can publish.")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await confirm(page);
  await expect(page.getByText("Published version 2.").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Publish history" })).toContainText("Version 2 · publish by lena");

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Wallet", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Roll back" }).click();
  await confirm(page);
  await expect(page.getByText("Rolled back as version 3.").first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Wallet", exact: true })).toBeChecked();
  await expect(page.getByRole("list", { name: "Publish history" })).toContainText("Version 3 · rollback by lena");

  await page.getByRole("link", { name: "To confirm", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "To confirm" })).toBeVisible();
  await expect(page.getByLabel("Quote validity")).toHaveValue("2 minutes");
  await expect(page.getByLabel("Google Maps key")).toHaveValue("empty");
  await expect(page.locator(".badge-amber").first()).toHaveText("To confirm");
});

test("full precedence viewer resolves through cohort and impact preview names the scope", async ({ page }) => {
  await signIn(page, "nora@movera.se");
  await page.getByRole("link", { name: "Settings", exact: true }).click();

  const add = async (level: string, target: string, value: "on" | "off") => {
    await page.getByLabel("Override level").selectOption(level);
    await page.getByLabel("Override target").fill(target);
    await page.getByLabel("Override value").selectOption(value);
    await page.getByRole("button", { name: "Add or replace override" }).click();
  };

  await add("market", "SE-STO", "off");
  await add("zone", "op-norrmalm", "on");
  await add("category", "premium", "off");
  await add("app", "rider", "on");
  await add("platform", "ios", "off");
  await add("appVersion", "1.0.0", "on");
  await add("cohort", "beta", "off");

  await page.getByLabel("Preview zone").selectOption("op-norrmalm");
  await page.getByLabel("Preview category").selectOption("premium");
  await page.getByLabel("Preview app", { exact: true }).selectOption("rider");
  await page.getByLabel("Preview platform").selectOption("ios");
  await page.getByLabel("Preview app version").fill("1.0.0");
  await page.getByLabel("Preview cohort").fill("beta");

  await expect(page.getByTestId("effective-precedence")).toContainText("Winning level: cohort");
  await expect(page.getByTestId("effective-precedence")).toContainText("Effective wallet: off");
  await expect(page.getByTestId("config-impact")).toContainText("cohort:beta");
  await expect(page.locator("[data-config-dirty='yes']")).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved through AdminApi.")).toBeVisible();
  await expect(page.locator("[data-config-dirty='no']")).toBeVisible();
});

test("stale configuration editor is refused instead of overwriting a newer draft", async ({ context, page }) => {
  test.setTimeout(60_000);
  await signIn(page, "nora@movera.se");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.locator("[data-config-dirty='no']")).toBeVisible();

  const stale = await context.newPage();
  await stale.goto("/settings");
  await expect(stale.getByRole("heading", { name: "Configuration" })).toBeVisible();
  await expect(stale.locator("[data-config-dirty='no']")).toBeVisible();

  await page.getByRole("checkbox", { name: "Wallet", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved through AdminApi.")).toBeVisible();

  await stale.getByRole("checkbox", { name: "Reservations in this zone" }).uncheck();
  await stale.getByRole("button", { name: "Save draft" }).click();
  await expect(stale.getByText(/Someone else changed this/)).toBeVisible();
});
