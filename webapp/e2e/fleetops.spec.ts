import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("fo-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("fo-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

test("vehicles: coloured views, papers, photos, checks and what the car earns", async ({ page }) => {
  await session(page);
  await page.goto("/vehicles");
  await expect(page.getByRole("heading", { level: 2, name: "Vehicles" })).toBeVisible();
  const views = page.getByRole("navigation", { name: "Vehicle views" });
  await views.getByRole("button", { name: /Photos to review/ }).click();
  await expect(page).toHaveURL(/show=photos/);
  await expect(page.locator("tbody tr").first()).toContainText("photo");
  await page.goto("/vehicles/V0003");
  await expect(page.getByRole("heading", { level: 2, name: "MVR 102" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Categories it fits" })).toHaveCount(0);
  await expect(page.getByLabel("Categories it fits")).toContainText("Comfort");
  await expect(page.getByRole("region", { name: "Papers" })).toContainText("Insurance");
  await expect(page.getByRole("region", { name: "Checks" })).toContainText("Fits Premium");
  await expect(page.getByRole("region", { name: "Trips and earnings" })).toContainText("Riders paid");
  await page.getByRole("button", { name: "Reject Inside" }).click();
  await expect(page.getByText("Inside rejected. The driver is asked for a new photo.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Photos" })).toContainText("Rejected: Upload a clearer photo");
  await expect(page.getByRole("region", { name: "Checks" })).toContainText("1 of 4 not approved");
  await page.getByRole("button", { name: "Approve Inside" }).click();
  await expect(page.getByRole("region", { name: "Checks" })).toContainText("All 4 approved");
});

test("vehicle rules per country change which categories a car fits", async ({ page }) => {
  await session(page);
  await page.goto("/vehicles?view=rules");
  await expect(page.getByRole("heading", { name: "Vehicle rules for Sweden" })).toBeVisible();
  await page.getByLabel("Premium oldest year").fill("2020");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("Everything is published")).toBeVisible();
  await page.goto("/vehicles/V0003");
  await expect(page.getByRole("region", { name: "Checks" })).not.toContainText("needs 2021");
  await expect(page.getByLabel("Categories it fits").locator(".on").filter({ hasText: "Premium" })).toHaveCount(1);
});

test("onboarding: a board by step, a funnel, reminders and the message the driver gets", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { level: 2, name: "Onboarding queue" })).toBeVisible();
  const board = page.getByRole("region", { name: "Board" });
  for (const step of ["Signed up", "Documents", "Checks", "Training", "Ready to activate"]) await expect(board.getByRole("group", { name: step })).toBeVisible();
  await expect(page.getByRole("region", { name: "Where applicants drop off" })).toContainText("reached");
  await board.getByRole("button", { name: /Elin Berg/ }).click();
  await page.getByRole("button", { name: "Send a reminder" }).click();
  await expect(page.getByText("Reminder sent to Elin Berg.")).toBeVisible();
  await board.getByRole("group", { name: "Documents" }).getByRole("button").first().click();
  const application = page.getByRole("article", { name: /^Application of / });
  await application.getByLabel("Review note / request details").fill("Photo is too dark");
  await application.getByRole("button", { name: "Reject Driving licence" }).click();
  await confirm(page);
  await expect(page.getByLabel("Message to the driver")).toContainText("could not be approved. Reason: Photo is too dark");
});

test("onboarding steps and papers per country", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding?view=steps");
  await expect(page.getByRole("heading", { name: "Onboarding steps for Sweden" })).toBeVisible();
  await page.getByLabel("Training on").uncheck();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("Everything is published")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("region", { name: "Board" }).getByRole("group", { name: "Training" })).toHaveCount(0);
  await page.goto("/onboarding?country=FR");
  const application = page.getByRole("article", { name: /^Application of / });
  await expect(application).toContainText("Not needed in FR");
});

test("fleet pages fit a phone", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 860 });
  for (const path of ["/vehicles", "/vehicles/V0003", "/vehicles?view=rules", "/onboarding"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(392);
  }
});
