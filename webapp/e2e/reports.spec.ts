import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("rp-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("rp-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

const cards = (page: Page) => page.getByRole("region", { name: "Numbers" });
const card = (page: Page, label: string) => cards(page).locator(".rp-card").filter({ hasText: label }).first();

test("reports have eight tabs, numbers that explain themselves, and a compare", async ({ page }) => {
  await session(page);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports for Sweden" })).toBeVisible();
  for (const name of ["Overview", "Rides", "Money", "Drivers", "Riders", "Dispatch", "Alerts", "Admin work"]) await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  await expect(card(page, "Bookings")).toContainText("kr");
  await card(page, "Cancel rate").getByRole("button", { name: "What is Cancel rate?" }).click();
  await expect(card(page, "Cancel rate").getByRole("note")).toHaveText("Rides cancelled ÷ rides requested.");
  await expect(card(page, "Bookings")).toContainText("vs same time yesterday");
  await page.getByLabel("Compare").selectOption("year");
  await expect(card(page, "Bookings")).toContainText("vs same time last year");
  await page.getByLabel("Compare").selectOption("none");
  await expect(card(page, "Bookings")).not.toContainText("vs ");
  await page.getByRole("radiogroup", { name: "Period" }).getByRole("radio", { name: "Week" }).click();
  await expect(page.getByText(/This week · SEK/)).toBeVisible();
});

test("rides by zone sort, and the old trip export is still there", async ({ page }) => {
  await session(page);
  await page.goto("/reports?tab=rides");
  const table = page.getByRole("table", { name: "Rides by zone" });
  await table.getByRole("button", { name: /Cancel rate/ }).click();
  await expect(table.getByRole("columnheader", { name: /Cancel rate/ })).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("region", { name: "Trip export" }).getByRole("button", { name: "Create CSV export" })).toBeVisible();
});

test("money filters by category and downloads as CSV", async ({ page }) => {
  await session(page);
  await page.goto("/reports?tab=money&period=month");
  const all = await card(page, "Bookings").locator("b").textContent();
  await page.getByLabel("Category", { exact: true }).selectOption("comfort");
  await expect(card(page, "Bookings").locator("b")).not.toHaveText(all ?? "");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/movera-money-SE-.*\.csv/);
  await expect(page.getByText("Money report downloaded as CSV.")).toBeVisible();
});

test("drivers can be filtered to one driver", async ({ page }) => {
  await session(page);
  await page.goto("/reports?tab=drivers&period=month");
  const table = page.getByRole("table", { name: "Drivers" });
  await expect(table.locator("tbody tr").nth(1)).toBeVisible();
  const name = (await table.locator("tbody tr").first().locator("td").first().textContent()) ?? "";
  await page.getByLabel("Driver", { exact: true }).selectOption({ label: name });
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText(name);
});

test("admin work shows who did what, with a page per admin", async ({ page }) => {
  await session(page);
  await page.goto("/alerts");
  await page.getByRole("list", { name: "Alerts" }).getByRole("button", { name: "Take it" }).first().click();
  await expect(page.getByText(/You are working on/)).toBeVisible();
  await page.goto("/reports?tab=money");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  await download;
  await page.getByRole("tab", { name: "Admin work" }).click();
  const admins = page.getByRole("table", { name: "Admin work" });
  await expect(admins).toContainText("Nora Lind");
  await admins.getByRole("button", { name: "Nora Lind" }).click();
  await expect(page.getByRole("heading", { name: "Nora Lind" })).toBeVisible();
  const days = page.getByLabel("Day by day");
  await expect(days).toContainText("Alerts: Take an alert");
  await expect(days).toContainText("Downloaded Money report (CSV)");
  await page.getByRole("radiogroup", { name: "What to show" }).getByText("Download").click();
  await expect(days).not.toContainText("Alerts: Take an alert");
  await page.getByRole("button", { name: "All admins" }).click();
  await expect(admins).toBeVisible();
});

test("only Super admin and Operations see everyone, and the Super admin can add roles", async ({ page }) => {
  // The demo's admin work is dated a few days back from now: on the first days of a month it falls in the month before
  // and "This month" is empty (failed on 1 Nov). Run the page at mid-month so the test does not depend on today's date.
  await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
  await session(page, "astrid");
  await page.goto("/reports?tab=work&period=month");
  await expect(page.getByText("You see your own work.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Admin work" })).not.toContainText("Lena Berg");
  await page.evaluate(() => localStorage.setItem("movera-admin-session", "nora"));
  await page.reload();
  const access = page.getByRole("region", { name: "Who sees other admins' work" });
  await access.getByText("Finance").click();
  await access.getByRole("button", { name: "Save who can see" }).click();
  await confirm(page);
  await page.waitForFunction(() => (localStorage.getItem("movera-demo-v5") ?? "").includes('"access":{"roles":["finance"]}'));
  await page.evaluate(() => localStorage.setItem("movera-admin-session", "astrid"));
  await page.reload();
  await expect(page.getByText("You see your own work.")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Admin work" })).toContainText("Lena Berg");
});

test("save a shared view and schedule a report by email", async ({ page }) => {
  await session(page);
  await page.goto("/reports?tab=money&period=month&category=comfort");
  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByLabel("View name").fill("Comfort this month");
  await page.getByText("Share with other admins").click();
  await page.locator(".modal.open").getByRole("button", { name: "Save view" }).click();
  await expect(page.getByText("View Comfort this month saved.")).toBeVisible();
  await page.goto("/reports");
  await page.getByLabel("Saved views").selectOption({ label: "Comfort this month" });
  await expect(page.getByRole("tab", { name: "Money" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("comfort");

  await page.getByRole("button", { name: "Schedule" }).click();
  await page.getByLabel("Schedule name").fill("Weekly money");
  await page.getByLabel("Schedule emails").fill("finance@movera.se, astrid@movera.se");
  await expect(page.locator(".modal.open")).toContainText("Every Monday at 08:00: last week's Money as PDF to 2 addresses");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Schedules" })).toContainText("Weekly money");
});

test("reports follow the country and stay usable at 390px", async ({ page }) => {
  await session(page);
  await page.goto("/reports?country=FR&tab=money");
  await expect(page.getByRole("heading", { name: "Reports for France" })).toBeVisible();
  await expect(card(page, "Bookings")).toContainText("€");
  await page.setViewportSize({ width: 390, height: 860 });
  await page.goto("/reports?tab=work");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
});
