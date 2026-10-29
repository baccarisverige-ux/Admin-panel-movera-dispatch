import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
}

/**
 * Owner decisions of 2026-10-29: item 1 (a document that expires is approved with its expiry date typed) and 18
 * ("Remove the button": no Approve all). Every remaining document is approved one by one; the info session is marked held.
 */
async function approveOneByOne(page: Page) {
  const app = page.getByRole("article", { name: /^Application of / });
  await expect(app.getByRole("button", { name: /^Approve (remaining|all)/ })).toHaveCount(0);
  const date = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  for (let round = 0; round < 30; round += 1) {
    const fields = app.getByLabel(/^Valid until for /);
    for (let index = 0; index < (await fields.count()); index += 1) {
      const field = fields.nth(index);
      if ((await field.inputValue()) === "") {
        const label = (await field.getAttribute("aria-label"))!.replace("Valid until for ", "");
        await expect(app.getByRole("button", { name: `Approve ${label}`, exact: true })).toBeDisabled();
        await field.fill(date);
      }
    }
    const button = app.getByRole("button", { name: /^(Approve|Mark held) / }).and(page.locator(":enabled")).first();
    if (!(await button.count())) return;
    await button.click();
    await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
    await expect(page.locator(".modal.open")).toHaveCount(0);
  }
  throw new Error("documents left to approve");
}

test("R6 onboarding activation persists into driver operations", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { level: 2, name: "Onboarding queue" })).toBeVisible();

  await page.getByRole("cell", { name: "D0005" }).click();
  await expect(page.getByText(/Activation blocked:/)).toBeVisible();

  await approveOneByOne(page);
  await expect(page.getByText("Ready for activation.")).toBeVisible();

  await page.getByRole("button", { name: "Activate" }).click();
  await confirm(page);
  await expect(page.getByText("Driver is active. New offers can be sent.")).toBeVisible();

  await page.goto("/drivers/D0005");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByRole("list", { name: "Driver documents" }).getByTestId("doc-driver_license")).toContainText("Approved");

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByLabel("Private internal note").fill("R6 verification note");
  await page.getByRole("button", { name: "Save private note" }).click();
  await confirm(page);
  await expect(page.getByText("Private driver note saved.")).toBeVisible();
  await expect(page.getByText("R6 verification note")).toBeVisible();
});

test("R6 vehicle compliance can repair an ineligible vehicle", async ({ page }) => {
  await session(page);
  await page.goto("/vehicles/V0001");
  await expect(page.getByRole("heading", { level: 2, name: "ABC 123" })).toBeVisible();
  await expect(page.getByText(/Rule check: Vehicle is older than the minimum year/)).toBeVisible();

  await page.getByLabel("Year").fill("2022");
  await page.getByRole("button", { name: "Save vehicle compliance" }).click();
  await confirm(page);
  await expect(page.getByText("Vehicle compliance profile saved.")).toBeVisible();

  await page.goto("/vehicles");
  const row = page.getByRole("row", { name: /V0001/ });
  await expect(row).toContainText("eligible");
});

test("R6 fleet partner list is isolated to its fleet id", async ({ page }) => {
  await session(page, "fredrik");
  await page.goto("/vehicles");
  await expect(page.getByText(/Fleet partner scope: F1/)).toBeVisible();
  const rows = page.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(rows.nth(index)).toContainText("F1");
  }
});

test("R6 driver detail remains usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/drivers/D0001");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByRole("list", { name: "Driver documents" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
