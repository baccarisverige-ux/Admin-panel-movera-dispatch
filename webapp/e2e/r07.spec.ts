import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page, target?: string) {
  const modal = page.locator(".modal.open").last();
  if (target) await modal.getByLabel(`Type ${target} to confirm`).fill(target);
  // Cancel and refund dialogs start with no reason (A-O1): pick the first one when none is chosen.
  const reason = modal.getByLabel("Reason", { exact: true });
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("R7 rider account, wallet, refund, promotion, notes and sessions persist", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/riders/R0002");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

  await page.getByLabel("Account reason").fill("Payment check");
  await page.getByRole("button", { name: "Put on hold" }).click();
  await confirm(page, "R0002");
  await expect(page.locator(".fd-hero .fd-account")).toHaveText("On hold");
  await page.getByRole("button", { name: "Activate" }).click();
  await confirm(page, "R0002");
  await expect(page.getByRole("button", { name: "Put on hold" })).toBeVisible();

  await page.getByRole("tab", { name: "Wallet & refunds" }).click();
  await page.getByLabel("Wallet amount").fill("125");
  await page.getByLabel("Wallet reason").fill("Driver was late");
  await page.getByRole("button", { name: "Add to wallet" }).click();
  await confirm(page);
  await expect(page.getByText("Added 125 kr to")).toBeVisible();
  await expect(page.getByRole("list", { name: "Wallet credits" })).toContainText("+125 kr");
  await page.getByLabel("Wallet amount").fill("600");
  await expect(page.getByText("One credit can be at most 500 kr.")).toBeVisible();

  const ride = page.getByLabel("Ride to refund");
  await ride.selectOption({ index: 1 });
  await page.getByLabel("Refund amount").fill("20");
  await page.getByLabel("Refund reason").fill("Long route");
  await page.getByRole("radio", { name: /Movera wallet/ }).click();
  await page.getByRole("button", { name: /^Refund 20 kr/ }).click();
  await confirm(page);
  await expect(page.getByText("Refunded 20 kr to the rider's movera wallet.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Refunds" })).toContainText("Sent");

  await page.getByRole("tab", { name: "Promotions" }).click();
  await page.getByRole("button", { name: "Give promotion" }).click();
  await confirm(page);
  await expect(page.getByText("given to 1 rider.")).toBeVisible();
  await expect(page.locator(".rd-ticket-grid")).toContainText("0 of 10 used");

  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out all sessions" }).click();
  await confirm(page);
  await expect(page.getByText("Signed out of every active rider session.")).toBeVisible();
  await page.getByLabel("Private internal note").fill("Call rider before airport pickup");
  await page.getByRole("button", { name: "Save private note" }).click();
  await confirm(page);
  await expect(page.getByText("Call rider before airport pickup")).toBeVisible();
  await page.getByRole("button", { name: "Advance privacy" }).click();
  await confirm(page, "R0002");
  await expect(page.getByText("Privacy request advanced.")).toBeVisible();

  await page.getByRole("tab", { name: "Support" }).click();
  await page.getByLabel("Lost item", { exact: true }).fill("Black umbrella");
  await page.getByRole("button", { name: "Report lost item" }).click();
  await expect(page.getByRole("list", { name: "Lost items" })).toContainText("reported");
  await page.getByRole("button", { name: "Driver contacted" }).click();
  await expect(page.getByRole("list", { name: "Lost items" })).toContainText("driver contacted");

  await page.reload();
  await page.getByRole("tab", { name: "Wallet & refunds" }).click();
  await expect(page.getByRole("list", { name: "Wallet credits" })).toContainText("+125 kr");
  await page.getByRole("tab", { name: "Account" }).click();
  await expect(page.getByText("Call rider before airport pickup")).toBeVisible();
  await expect(page.getByText("Status: processing")).toBeVisible();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("list", { name: "Rider timeline" })).toContainText("Wallet +125 kr");
});

test("R7 big refunds wait for a second admin", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/riders?seg=top");
  await page.getByRole("list", { name: "Riders" }).getByRole("link").first().click();
  await page.getByRole("tab", { name: "Wallet & refunds" }).click();
  const options = await page.getByLabel("Ride to refund").locator("option").allTextContents();
  const fares = options.map((text) => Number((/· (\d[\d\s\u00a0\u202f]*,\d\d)\s*kr/.exec(text)?.[1] ?? "0").replace(/[^\d,]/g, "").replace(",", ".")));
  const big = fares.indexOf(Math.max(...fares));
  expect(fares[big]).toBeGreaterThan(550);
  await page.getByLabel("Ride to refund").selectOption({ index: big });
  await page.getByLabel("Refund amount").fill("550");
  await page.getByLabel("Refund reason").fill("Charged twice");
  await page.getByRole("button", { name: /^Refund 550 kr/ }).click();
  await confirm(page);
  await expect(page.getByText("Refund of 550 kr is waiting for a second admin to approve.")).toBeVisible();
  const refunds = page.getByRole("list", { name: "Refunds" });
  await expect(refunds).toContainText("Waiting for approval");
  await expect(refunds.getByRole("button", { name: "Approve" })).toBeDisabled();
});

test("R7 finance can open rider wallet without sensitive reveal permission", async ({ page }) => {
  await session(page, "astrid");
  await page.goto("/riders/R0002");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(page.getByText("Phone: restricted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Wallet & refunds" }).click();
  await page.getByLabel("Wallet reason").fill("Goodwill");
  await expect(page.getByRole("button", { name: "Add to wallet" })).toBeEnabled();
});

test("R7 rider detail remains usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/riders/R0002");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  await page.getByRole("tab", { name: "Wallet & refunds" }).click();
  await expect(page.getByLabel("Wallet amount")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
