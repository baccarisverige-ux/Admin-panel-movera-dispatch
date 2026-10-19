import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId: string) {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

test("UI-01: a viewer cannot open another admin's page", async ({ page }) => {
  await session(page, "anna");
  await page.goto("/team/nora");
  await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  await expect(page.getByText("nora@movera.se")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nora Lind" })).toHaveCount(0);
});

test("UI-01: an admin with team access still opens it", async ({ page }) => {
  await session(page, "nora");
  await page.goto("/team/maja");
  await expect(page.getByRole("heading", { name: "Maja Holm" })).toBeVisible();
});

const PEOPLE_LINKS = 'a[href^="/riders/"], a[href^="/drivers/"], a[href^="/reservations/"], a[href^="/trips/"]';

test("UI-06: the content role's dashboard shows no rider or driver names and no links it cannot open", async ({ page }) => {
  await session(page, "nora");
  await page.goto("/?tab=work");
  const table = page.locator(".ride-table");
  await expect(table.locator('a[href^="/reservations/"]').first()).toBeVisible();
  const named = await table.locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(named.some((text) => !text.startsWith("Rider"))).toBe(true);

  await session(page, "elsa");
  await page.goto("/?tab=work");
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByTestId("dashboard").locator(PEOPLE_LINKS)).toHaveCount(0);
  for (const text of await table.locator("tbody tr td:nth-child(2)").allInnerTexts()) expect(text.startsWith("Rider")).toBe(true);

  for (const tab of ["live", "insights"]) {
    await page.goto(`/?tab=${tab}`);
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("dashboard").locator(PEOPLE_LINKS)).toHaveCount(0);
  }
});

test("C-07: a Tunisia payment is shown in dinars with three decimals", async ({ page }) => {
  await session(page, "nora");
  await page.goto("/payments/PAY2002?country=TN");
  const head = page.locator(".dx-head-text p");
  await expect(head).toContainText("DT");
  await expect(head).toContainText("29,050");
  await expect(head).not.toContainText("kr");
});
