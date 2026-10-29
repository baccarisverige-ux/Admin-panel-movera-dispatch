import { expect, test, type Page } from "@playwright/test";

/** Contract v0.16.0 §11 (owner 2026-10-29): Crashes & errors, open to every admin role; the demo build has example groups. */
async function session(page: Page, agentId: string) {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

for (const agent of ["anna", "maja", "nora"]) {
  test(`Crashes & errors: ${agent} sees it in the menu and opens it`, async ({ page }) => {
    await session(page, agent);
    await page.goto("/");
    await page.getByRole("link", { name: "Crashes & errors", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Crashes & errors" })).toBeVisible();
    await expect(page.getByText("No access")).toHaveCount(0);
    await expect(page.getByRole("row").nth(1)).toContainText("Driver");
  });
}

test("Crashes & errors: the viewer still cannot open the rest of System", async ({ page }) => {
  await session(page, "anna");
  await page.goto("/system");
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
});

test("Crashes & errors: newest first, filters, mark fixed and reopen, empty state", async ({ page }) => {
  await session(page, "anna");
  await page.goto("/errors");
  const table = page.locator(".errors-page table");
  await expect(table.getByRole("row").nth(1)).toContainText("Cannot read properties of undefined");
  await expect(table.getByRole("row").nth(1)).toContainText("Android");
  await expect(table.getByRole("row").nth(1)).toContainText("1.4.2");
  await expect(page.getByText("7 groups")).toBeVisible();

  await page.getByLabel("App", { exact: true }).selectOption("server");
  await expect(page.getByText("1 groups")).toBeVisible();
  await expect(table).toContainText("ETIMEDOUT");
  await page.getByLabel("App", { exact: true }).selectOption("");

  await page.getByLabel("Platform", { exact: true }).selectOption("ios");
  await expect(page.getByText("2 groups")).toBeVisible();
  await page.getByLabel("Platform", { exact: true }).selectOption("");
  await page.getByLabel("Version", { exact: true }).selectOption("2.1.0");
  await expect(page.getByText("2 groups")).toBeVisible();
  await page.getByLabel("Version", { exact: true }).selectOption("");

  const first = table.getByRole("row").nth(1);
  await expect(first.locator(".errors-pill")).toHaveText("Open");
  await first.getByRole("button", { name: "Mark fixed" }).click();
  await expect(first.locator(".errors-pill")).toHaveText("Fixed");
  await first.getByRole("button", { name: "Reopen" }).click();
  await expect(first.locator(".errors-pill")).toHaveText("Open");

  await page.getByLabel("App", { exact: true }).selectOption("server");
  await page.getByLabel("Status", { exact: true }).selectOption("fixed");
  await expect(page.getByText("No crashes or errors here.")).toBeVisible();
});
