import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

test("team: admins list, an admin page linked to Reports, and a custom role given to an admin", async ({ page }) => {
  await session(page);
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Team and roles", level: 2 })).toBeVisible();
  await page.getByLabel("Search admins").fill("camille");
  const list = page.getByRole("list", { name: "Admin list" });
  await expect(list.getByRole("link")).toHaveCount(1);
  await expect(list).toContainText("France");
  await page.getByRole("tab", { name: "Roles and permissions" }).click();
  await page.getByRole("button", { name: /Support agent/ }).click();
  await expect(page.getByRole("switch", { name: "Answer support on" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Answer support on" })).toBeDisabled();
  await page.getByRole("button", { name: "New role" }).click();
  await page.getByLabel("Role name").fill("Night support");
  await page.getByRole("switch", { name: "Change or cancel trips on" }).check();
  await expect(page.getByText("1 added, 0 removed")).toBeVisible();
  await page.getByRole("button", { name: "Save role" }).click();
  await confirm(page);
  await expect(page.getByText("Role Night support saved.")).toBeVisible();
  await page.goto("/team/maja");
  await expect(page.getByRole("heading", { name: "Maja Holm", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: "All their work in Reports" })).toHaveAttribute("href", "/reports?tab=work&admin=maja");
  await page.getByLabel("Custom role").selectOption({ label: "Night support" });
  await page.getByRole("button", { name: "Save role" }).click();
  await confirm(page);
  await expect(page.getByText("Maja Holm now has Night support.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Act permissions" })).toContainText("Change or cancel trips");
  await page.goto("/team");
  await expect(page.getByRole("list", { name: "Admin list" })).toContainText("Night support");
});

test("team: limits and sign-in safety each have switches and are kept", async ({ page }) => {
  await session(page);
  await page.goto("/team?tab=limits");
  await page.getByLabel("Limits for role").selectOption("support");
  await page.getByLabel("Credit limit").fill("150");
  await page.getByRole("button", { name: "Save limits" }).click();
  await confirm(page);
  await expect(page.getByText("Limits for Support agent saved.")).toBeVisible();
  await page.getByRole("tab", { name: "Sign-in safety" }).click();
  await expect(page.getByRole("switch", { name: "2-step code for Super admin on" })).toBeDisabled();
  await page.getByRole("switch", { name: "2-step code for Viewer / analyst on" }).uncheck();
  await page.getByLabel("Idle minutes").fill("30");
  await page.getByRole("button", { name: "Save sign-in safety" }).click();
  await confirm(page);
  await expect(page.getByText("Sign-in safety saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Idle minutes")).toHaveValue("30");
  await expect(page.getByRole("switch", { name: "2-step code for Viewer / analyst on" })).not.toBeChecked();
});

test("team: saved settings that nothing applies yet say so (C-12)", async ({ page }) => {
  await session(page);
  for (const tab of ["roles", "limits", "security"]) {
    await page.goto(`/team?tab=${tab}`);
    await expect(page.getByTestId("not-enforced")).toHaveCount(1);
    await expect(page.getByTestId("not-enforced")).toContainText("Not enforced yet.");
  }
  await page.goto("/team/maja");
  await expect(page.getByRole("heading", { name: "Maja Holm", level: 2 })).toBeVisible();
  await expect(page.getByTestId("not-enforced")).toContainText("Not enforced yet. The custom role, the 2-step setting and the idle time are saved for the backend.");
});

test("audit: search, filters, details with who and before/after, and export", async ({ page }) => {
  await session(page);
  await page.goto("/settings");
  await page.getByRole("checkbox", { name: "Wallet", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved through AdminApi.")).toBeVisible();
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 3, name: "Pending approvals" })).toBeVisible();
  await page.getByLabel("Search the audit", { exact: true }).fill("configuration");
  const log = page.getByRole("list", { name: "Audit log" });
  await expect(log.getByRole("listitem").first()).toContainText("admin.config.save");
  await page.getByLabel("Admin", { exact: true }).selectOption("nora");
  await log.getByRole("button").first().click();
  await expect(log.getByRole("link", { name: "All their work" })).toHaveAttribute("href", "/reports?tab=work&admin=nora");
  await expect(log.getByRole("link", { name: "Nora Lind" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Export \d+ rows$/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^movera-audit-.*\.csv$/);
  await page.getByLabel("Search the audit", { exact: true }).fill("nothing-like-this");
  await expect(page.getByText("No action matches these filters.")).toBeVisible();
});

test("to confirm: a money approval shows in the inbox and a product value is confirmed", async ({ page }) => {
  await session(page);
  await page.goto("/audit");
  await page.getByRole("button", { name: "Refund 600 kr" }).click();
  const modal = page.locator(".modal.open").last();
  await modal.getByLabel("Type RF-LARGE to confirm").fill("RF-LARGE");
  await modal.getByLabel("Reason", { exact: true }).selectOption("Charged twice");
  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Pending approvals" }).locator("..")).toContainText("RF-LARGE");
  await page.goto("/confirm");
  await expect(page.getByRole("heading", { level: 2, name: "To confirm" })).toBeVisible();
  const inbox = page.getByRole("list", { name: "Inbox" });
  await expect(inbox).toContainText("600,00 kr for RF-LARGE");
  await expect(inbox.getByRole("button", { name: "Approve" }).first()).toBeDisabled();
  await page.getByRole("button", { name: "Confirm quote" }).click();
  await page.getByLabel("Value to confirm").fill("90 seconds");
  await page.getByLabel("Note for the team").fill("Decided in the October meeting");
  await page.getByRole("button", { name: "Save confirmation" }).click();
  await confirm(page);
  await expect(page.getByText("Quote validity confirmed.")).toBeVisible();
  await page.reload();
  await expect(page.locator("#value-quote")).toContainText("Confirmed: 90 seconds · nora");
  await expect(page.getByLabel("Quote validity")).toHaveValue("2 minutes");
});

test("settings: find a setting, compare versions, settings elsewhere, and developer pages hidden by default", async ({ page }) => {
  await session(page);
  await page.goto("/settings");
  await page.getByLabel("Find a setting").fill("booking");
  await expect(page.getByRole("link", { name: "Booking rules" })).toBeVisible();
  await page.getByLabel("Find a setting").fill("review");
  await expect(page.getByRole("link", { name: /Review rules/ })).toHaveAttribute("href", "/reviews?tab=rules");
  await page.getByRole("tab", { name: "Compare versions" }).click();
  await expect(page.getByLabel("Compare to")).toHaveValue("draft");
  await page.getByRole("tab", { name: "Settings in other sections" }).click();
  await expect(page.getByRole("link", { name: /Vehicle rules/ })).toHaveAttribute("href", "/vehicles?view=rules");
  await expect(page.getByRole("link", { name: "System", exact: true })).toHaveCount(0);
  await page.goto("/system");
  await expect(page.getByText(/hidden from the menu/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
});

test("developer pages are not shown to other roles even when switched on", async ({ page }) => {
  await session(page);
  await page.goto("/settings?tab=panel");
  await page.getByRole("button", { name: "Show developer pages" }).click();
  await confirm(page);
  await expect(page.getByRole("link", { name: "Release gates", exact: true })).toBeVisible();
  const other = await page.context().newPage();
  await other.addInitScript(() => {
    localStorage.setItem("movera-admin-session", "lena");
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  });
  await other.goto("/team");
  await expect(other.getByRole("link", { name: "Release gates", exact: true })).toHaveCount(0);
  await other.close();
});

test("platform pages fit a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 860 });
  await session(page);
  for (const path of ["/team", "/team/maja", "/audit", "/settings", "/confirm"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), path).toBe(true);
  }
});
