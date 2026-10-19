import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

const dialog = (page: Page) => page.locator(".modal.open");

test("UI-02: payout and incident addresses show the record, and a missing one says so", async ({ page }) => {
  await session(page);
  await page.goto("/payouts/PO1");
  await expect(page.getByTestId("record-detail")).toContainText("Week 1");
  await expect(page.getByTestId("record-detail").getByRole("link", { name: /^D\d+$/ })).toBeVisible();
  await page.getByRole("link", { name: "Open in Payouts" }).click();
  await expect(page).toHaveURL(/\/payouts\?payout=PO1/);

  await page.goto("/payouts/NOPE");
  await expect(page.getByTestId("record-missing")).toBeVisible();
  await expect(page.getByTestId("record-detail")).toHaveCount(0);

  await page.goto("/incidents/INC-1");
  await expect(page.getByTestId("record-detail")).toBeVisible();
  await page.getByRole("link", { name: "Open the case" }).click();
  await expect(page).toHaveURL(/\/incidents\?case=INC-1/);
  await page.goto("/incidents/INC-NOPE");
  await expect(page.getByTestId("record-missing")).toBeVisible();
});

test("UI-03 + UI-12: reasons fit the command, Other needs text, and a cancelled dialog starts clean", async ({ page }) => {
  await session(page);
  await page.goto("/drivers/D0002");
  await page.getByRole("button", { name: "Put on hold" }).first().click();
  const reasons = await dialog(page).getByLabel("Reason", { exact: true }).locator("option").allInnerTexts();
  expect(reasons).toContain("Safety concern");
  expect(reasons).not.toContain("Blurry");
  await dialog(page).getByLabel("Reason", { exact: true }).selectOption("Other");
  const confirmButton = dialog(page).getByRole("button", { name: "Confirm" });
  const typedBox = dialog(page).getByLabel(/^Type D0002 to confirm/);
  await typedBox.fill("D0002");
  await expect(confirmButton).toBeDisabled();
  await dialog(page).getByLabel("Describe the reason").fill("Waiting for the police report");
  await expect(confirmButton).toBeEnabled();
  await typedBox.fill("D000");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Put on hold" }).first().click();
  await expect(dialog(page).getByLabel(/^Type D0002 to confirm/)).toHaveValue("");
  await expect(dialog(page).getByLabel("Reason", { exact: true })).toHaveValue("Safety concern");
  await expect(dialog(page).getByLabel("Describe the reason")).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await page.goto("/pricing");
  await page.getByLabel("Norrmalm Movera Base fare").fill("31");
  await page.getByRole("button", { name: "Publish changes" }).click();
  const pricingReasons = await dialog(page).getByLabel("Reason", { exact: true }).locator("option").allInnerTexts();
  expect(pricingReasons).toContain("Planned change");
  expect(pricingReasons).not.toContain("Blurry");
  expect(pricingReasons).not.toContain("Wrong document");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
});

test("UI-04: a refund asks for a reason and the payment id, and Retry refund is only for a refund that did not go through", async ({ page }) => {
  await session(page);
  await page.goto("/payments/PAY0003");
  const retry = page.getByRole("button", { name: "Retry refund" });
  await expect(retry).toBeDisabled();
  await page.getByRole("button", { name: "Refund payment" }).click();
  await expect(dialog(page)).toBeVisible();
  const reasons = await dialog(page).getByLabel("Reason", { exact: true }).locator("option").allInnerTexts();
  expect(reasons).toContain("Charged twice");
  await expect(dialog(page).getByRole("button", { name: "Confirm" })).toBeDisabled();
  await dialog(page).getByLabel("Reason", { exact: true }).selectOption("Rider was overcharged");
  await dialog(page).getByLabel("Type PAY0003 to confirm").fill("PAY0003");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("payment-timeline")).toContainText("Refunded");
  await expect(page.getByTestId("refund-block")).toContainText("Already refunded");
  await expect(page.getByRole("button", { name: "Refund payment" })).toBeDisabled();
  await expect(retry).toBeDisabled();

  await page.goto("/audit");
  await expect(page.getByText("Rider was overcharged").first()).toBeVisible();
});

test("UI-05 + UI-10: an out-of-range or malformed price stays visible as an error and cannot be published", async ({ page }) => {
  await session(page);
  await page.goto("/pricing");
  const base = page.getByLabel("Norrmalm Movera Base fare");
  await base.fill("100000");
  await expect(base).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".num-field-error")).toHaveText("Max 1000 kr.");
  await base.blur();
  await expect(base).toHaveValue("100000");

  await page.getByLabel("Norrmalm Movera Price per km").fill("13");
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Unpublished changes" })).toContainText("Max 1000 kr.");

  await base.fill("1e5");
  await expect(page.locator(".num-field-error")).toContainText("Enter a number like 12.5");
  await base.fill("-50");
  await expect(page.locator(".num-field-error")).toHaveText("Must be 0 or more.");
  await base.fill("35");
  await expect(base).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeEnabled();

  await page.getByRole("button", { name: "Discard" }).click();
  await page.goto("/payouts?tab=schedule");
  const fee = page.getByLabel("Cash-out fee");
  await fee.fill("500");
  await expect(page.locator(".num-field-error")).toHaveText("Max 10%.");
  await expect(fee).toHaveValue("500");
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeDisabled();
});

test("UI-07 + UI-08: on a phone the topbar stays on screen, and the menu closes with Escape or a tap outside", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/alerts");
  await expect(page.locator(".topbar")).toBeVisible();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const top = await page.locator(".topbar").evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(top)).toBeLessThan(2);

  const toggle = page.getByRole("button", { name: "Open menu" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.locator(".sidebar.open")).toHaveCount(1);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar.open")).toHaveCount(0);
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(page.locator(".sidebar.open")).toHaveCount(1);
  const url = page.url();
  await page.mouse.click(360, 600);
  await expect(page.locator(".sidebar.open")).toHaveCount(0);
  expect(page.url()).toBe(url);

  await toggle.click();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(page.locator(".sidebar.open")).toHaveCount(0);
});

test("UI-09: leaving Pricing with unpublished changes asks first", async ({ page }) => {
  await session(page);
  await page.goto("/pricing");
  await page.getByLabel("Norrmalm Movera Base fare").fill("33");
  let asked = "";
  page.once("dialog", (prompt) => {
    asked = prompt.message();
    void prompt.dismiss();
  });
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect.poll(() => asked).toContain("unsaved changes");
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByLabel("Norrmalm Movera Base fare")).toHaveValue("33");
});

test("UI-11: Escape closes Test a ride and the dashboard driver panel", async ({ page }) => {
  await session(page);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Test a ride/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Test a ride" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Test a ride" })).toHaveCount(0);

  await page.goto("/?focus=D0002");
  const panel = page.locator(".driver-panel");
  // The live map loads first; give it time when the machine is busy.
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("UI-13: a long unbroken note is capped and wraps inside its card", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/drivers/D0002?tab=notes");
  const box = page.getByLabel("Private internal note");
  await expect(box).toHaveAttribute("maxlength", "2000");
  await box.fill("https://example.com/" + "a".repeat(2500));
  expect((await box.inputValue()).length).toBe(2000);
  await page.getByRole("button", { name: "Save private note" }).click();
  if (await dialog(page).count()) await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Private driver note saved.")).toBeVisible();
  const note = page.locator(".fd-note");
  const overflow = await note.evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("C-10: a screen loaded before someone else's change gets a conflict instead of overwriting it", async ({ page }) => {
  await session(page);
  await page.goto("/trips/T0004");
  await expect(page.getByRole("button", { name: "Cancel trip" })).toBeEnabled();

  // Another admin, in another tab, commits a change after this screen was read.
  const other = await page.context().newPage();
  await other.goto("/payments/PAY0005");
  await other.getByRole("button", { name: "Refund payment" }).click();
  await other.locator(".modal.open").getByLabel("Type PAY0005 to confirm").fill("PAY0005");
  await other.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
  await expect(other.getByTestId("payment-timeline")).toContainText("Refunded");
  await other.close();

  await page.getByRole("button", { name: "Cancel trip" }).click();
  await dialog(page).getByLabel("Type T0004 to confirm").fill("T0004");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Someone else changed this/).first()).toBeVisible();
  await expect(page.getByTestId("trip-waybill")).not.toContainText("Cancelled by admin");

  // The conflict reloaded the screen, so the next try goes through.
  await page.getByRole("button", { name: "Cancel trip" }).click();
  await dialog(page).getByLabel("Type T0004 to confirm").fill("T0004");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("trip-waybill")).toContainText("Cancelled by admin");
});

test("C-11: a Tunisia reservation shows and takes Tunis time", async ({ page }) => {
  await session(page);
  await page.goto("/reservations/B2001?country=TN");
  const summary = page.getByTestId("reservation-summary");
  await expect(summary).toContainText("Africa/Tunis");
  await expect(summary).not.toContainText("Europe/Stockholm");
  const pickupIso = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("movera-demo-v5") ?? "null");
    const ops = db?.slices?.reservationOps?.reservations?.B2001;
    const row = db?.reservations?.find((item: { id: string }) => item.id === "B2001");
    return (ops?.pickupAt ?? row?.pickupAt ?? null) as string | null;
  });
  if (pickupIso) {
    const tunis = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(pickupIso));
    await expect(summary).toContainText(`· ${tunis}`);
  }
  await expect(page.getByTestId("reservation-return")).toContainText("Africa/Tunis");
});
