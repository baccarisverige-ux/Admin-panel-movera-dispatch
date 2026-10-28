import { expect, test, type Page } from "@playwright/test";

/** Q24: at 1280 px and below the country picker, Inbox and Sign out are in the top bar's "⋯" menu. */
async function topbarMore(page: Page) {
  const more = page.getByRole("button", { name: "More options", exact: true });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
}

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("al-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("al-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

async function switchTo(page: Page, agentId: string) {
  await page.evaluate((id) => localStorage.setItem("movera-admin-session", id), agentId);
  await page.reload();
}

const list = (page: Page) => page.getByRole("list", { name: "Alerts" });
const row = (page: Page, text: string | RegExp) => list(page).getByRole("listitem").filter({ hasText: text }).first();

test("alerts have their own menu item, counters, and a back button", async ({ page }) => {
  await session(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Alerts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alerts in Sweden" })).toBeVisible();
  const counters = page.getByRole("region", { name: "Alerts at a glance" });
  await expect(counters).toContainText("Critical");
  await expect(counters).toContainText("Not taken");
  await counters.getByRole("button", { name: /Critical/ }).click();
  await expect(list(page).getByRole("listitem").first()).toHaveClass(/critical/);
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).not.toHaveURL(/alerts/);
});

test("take an alert, the name shows for everyone, only that admin can solve it", async ({ page }) => {
  await session(page);
  await page.goto("/alerts");
  const first = row(page, /licence has expired/);
  const title = (await first.locator(".al-row-text b").textContent()) ?? "";
  await first.getByRole("button", { name: "Take it" }).click();
  await expect(row(page, title)).toContainText("Nora Lind is working on it");
  await page.reload();
  await expect(row(page, title)).toContainText("Nora Lind is working on it");

  await switchTo(page, "lena");
  await expect(row(page, title)).toContainText("Nora Lind is working on it");
  await expect(row(page, title).getByRole("button", { name: "Take it" })).toHaveCount(0);
  await expect(row(page, title)).toContainText("Only Nora Lind can solve it");

  await switchTo(page, "nora");
  await row(page, title).locator(".al-row-main").click();
  const detail = page.getByRole("complementary", { name: "Alert details" });
  await expect(detail.getByRole("list", { name: "Timeline" })).toContainText("Nora Lind: Working on it");
  await detail.getByLabel("Solved note").fill("Asked the driver to upload a new licence");
  await detail.getByRole("button", { name: "Solved" }).click();
  await expect(page.getByText(`Solved by Nora Lind: ${title}.`)).toBeVisible();
  await expect(list(page)).not.toContainText(title);

  await page.getByRole("tab", { name: "History & numbers" }).click();
  const solved = page.getByRole("list", { name: "Solved alerts" });
  await expect(solved).toContainText(title);
  await expect(solved).toContainText("Taken and solved by Nora Lind");
  await expect(solved).toContainText("Asked the driver to upload a new licence");
  await expect(page.getByRole("list", { name: "Weekly summary" })).toContainText("1 alert solved in the last 7 days");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/movera-alerts-SE-.*\.csv/);
});

test("an SOS has one owner: taken in Alerts is taken in Incidents", async ({ page }) => {
  await session(page);
  await page.goto("/alerts");
  const sos = row(page, /^SOS from/);
  await sos.getByRole("button", { name: "Take SOS" }).click();
  await confirm(page);
  await expect(row(page, /^SOS from/)).toContainText("Nora Lind is working on it");
  await page.goto("/incidents");
  // A new Ride check case is listed first (not taken yet), so open the SOS case itself.
  await page.getByRole("complementary", { name: "Cases" }).getByRole("button", { name: /SOS button/ }).first().click();
  await expect(page.getByRole("heading", { name: /INC-\d+ · Taken/ }).first()).toBeVisible();
  await switchTo(page, "erik");
  await page.goto("/alerts");
  await expect(row(page, /^SOS from/)).toContainText("Only Nora Lind can solve it");
  await expect(row(page, /^SOS from/).getByRole("button", { name: "Take SOS" })).toHaveCount(0);
});

test("the bell shows the newest alerts and links to all of them", async ({ page }) => {
  await session(page);
  await page.goto("/drivers");
  const bell = page.getByRole("button", { name: /^Alerts, \d+ open$/ });
  await bell.click();
  const pop = page.getByRole("dialog", { name: "Newest alerts" });
  await expect(pop).toContainText("critical");
  await pop.getByRole("button", { name: "Take it" }).first().click();
  await expect(pop.getByRole("status")).toContainText("You are working on");
  await pop.getByRole("link", { name: /See all alerts/ }).click();
  await expect(page).toHaveURL(/\/alerts/);
  await page.getByRole("region", { name: "Alerts at a glance" }).getByRole("button", { name: /Mine/ }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(1);
});

test("settings: older alert parts are off, Inbox comes back when switched on, levels and extras", async ({ page }) => {
  await session(page);
  await page.goto("/alerts?view=settings");
  await expect(page.getByRole("button", { name: "Inbox", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Inbox button in the top bar on")).not.toBeChecked();
  await expect(page.getByLabel("Dashboard plays its own alert sound on")).not.toBeChecked();
  await page.getByLabel("Inbox button in the top bar on").check();
  await page.getByLabel("Pass to another admin on").check();
  await page.getByRole("radiogroup", { name: "Support ticket waiting level" }).getByText("Important").click();
  await page.getByRole("region", { name: "Save settings" }).getByRole("button", { name: "Save settings" }).click();
  await confirm(page);
  await expect(page.getByText("Alert settings saved.")).toBeVisible();
  await topbarMore(page);
  await expect(page.getByRole("button", { name: "Inbox", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Open" }).click();
  const alert = row(page, /licence has expired/);
  await alert.locator(".al-row-main").click();
  const detail = page.getByRole("complementary", { name: "Alert details" });
  await detail.getByLabel("Pass to").selectOption({ label: "Lena Berg" });
  await detail.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByText("Passed to Lena Berg.")).toBeVisible();
  await expect(detail).toContainText("Lena Berg is working on it");
});

test("settings: limits must be in order and a viewer cannot change them", async ({ page }) => {
  await session(page);
  await page.goto("/alerts?view=settings");
  await page.getByRole("group", { name: "Driver document expiring or expired limits" }).getByLabel("Critical limit").fill("40");
  await expect(page.getByRole("region", { name: "Save settings" })).toContainText("Critical must be the lowest number");
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await switchTo(page, "anna");
  await page.goto("/alerts?view=settings");
  await expect(page.getByText("Only Super admin and Operations can change them.")).toBeVisible();
  await expect(page.getByLabel("Snooze on")).toBeDisabled();
});

test("your own rule: preview, save, and it shows as an alert", async ({ page }) => {
  await session(page);
  await page.goto("/alerts?view=rules");
  await page.getByRole("button", { name: "New rule" }).click();
  await page.getByLabel("Rule name").fill("Norrmalm short of drivers");
  await page.getByLabel("Measure").selectOption("free_drivers");
  await page.getByLabel("Rule number").fill("50");
  await page.getByLabel("Rule zone").selectOption({ label: "Norrmalm" });
  await expect(page.getByLabel("Preview")).toContainText(/would have alerted \d+ time/);
  await page.getByRole("button", { name: "Save rule" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Your rules" })).toContainText("When free drivers is below 50 for 10 min in Norrmalm");
  await page.getByRole("tab", { name: "Open" }).click();
  await expect(list(page)).toContainText("Norrmalm short of drivers");
});

test("dashboard and Dispatch read from Alerts", async ({ page }) => {
  await session(page);
  await page.goto("/");
  const strip = page.getByRole("region", { name: "Urgent" });
  await expect(strip.getByRole("link", { name: "See all alerts" })).toBeVisible();
  await expect(page.getByRole("button", { name: /alert sound/i })).toHaveCount(0);
  await page.goto("/dispatch?view=live");
  const alerts = page.getByRole("region", { name: "Alerts" });
  await expect(alerts.getByRole("link", { name: "See all alerts" })).toBeVisible();
  const take = alerts.getByRole("button", { name: "Take it" }).first();
  await take.click();
  await expect(alerts).toContainText("Nora Lind is working on it");
});

test("alerts follow the country and stay usable at 390px", async ({ page }) => {
  await session(page);
  await page.goto("/alerts?country=FR");
  await expect(page.getByRole("heading", { name: "Alerts in France" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 860 });
  await page.goto("/alerts");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
  await page.getByRole("button", { name: /^Alerts, \d+ open$/ }).click();
  await expect(page.getByRole("dialog", { name: "Newest alerts" })).toBeVisible();
});
