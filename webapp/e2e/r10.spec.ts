import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "astrid") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  const modal = page.locator(".modal.open");
  // Cancel and refund dialogs start with no reason (A-O1): pick the first one when none is chosen.
  const reason = modal.getByLabel("Reason", { exact: true });
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("R10 payment policy voucher and reconciliation persist", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/payments?tab=tools");

  await expect(page.getByRole("heading", { level: 2, name: "Payments" })).toBeVisible();
  await page.getByLabel("cash method").uncheck();
  await page.getByRole("button", { name: "Save payment methods" }).click();
  await confirm(page);
  await expect(page.getByText("Payment-method policy saved. Existing authorisations continue.")).toBeVisible();

  await page.getByLabel("Voucher rider").fill("R0001");
  await page.getByLabel("Voucher amount").selectOption("20000");
  await page.getByLabel("Voucher reason").fill("Service recovery");
  await page.getByRole("button", { name: "Issue wallet voucher" }).click();
  await confirm(page);
  await expect(page.getByText(/Wallet voucher 200,00\skr posted for R0001/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Wallet ledger" })).toContainText("WV-1 · R0001 · 200,00 kr · posted");

  await page.getByLabel("Reconciliation note").fill("R10 daily close");
  await page.getByRole("button", { name: "Save reconciliation" }).click();
  await confirm(page);
  await expect(page.getByText("Reconciliation snapshot saved.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Reconciliation history" })).toContainText("R10 daily close");

  await page.reload();
  await expect(page.getByLabel("cash method")).not.toBeChecked();
  await expect(page.getByRole("list", { name: "Wallet ledger" })).toContainText("WV-1 · R0001 · 200,00 kr · posted");
  await expect(page.getByRole("list", { name: "Reconciliation history" })).toContainText("R10 daily close");
});

test("R10 payout requires reviewed bank and stays paid once", async ({ page }) => {
  await session(page);
  await page.goto("/payouts");
  await expect(page.getByRole("heading", { level: 2, name: "Payouts" })).toBeVisible();

  await page.getByRole("button", { name: "Mark paid" }).click();
  await confirm(page);
  await expect(page.getByText("Bank details are still in review.")).toBeVisible();

  await page.getByLabel("Bank review note").fill("Account holder and IBAN verified");
  await page.getByRole("button", { name: "Approve bank" }).click();
  await confirm(page);
  await expect(page.getByText("Bank details approved.")).toBeVisible();

  await page.getByRole("button", { name: "Mark paid" }).click();
  await confirm(page);
  await expect(page.getByText("Payout marked paid once. Reusing the operation key cannot pay it twice.")).toBeVisible();
  await expect(page.getByTestId("payout-detail")).toContainText("payout paid");

  await page.reload();
  await expect(page.getByTestId("payout-detail")).toContainText("payout paid");
  await expect(page.getByRole("button", { name: "Mark paid" })).toBeDisabled();
});

test("R10 large refund requires and executes a second-agent decision", async ({ page }) => {
  await session(page);
  await page.goto("/payments/PAY0200");
  await expect(page.getByText("600,00 kr")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request refund approval" })).toBeEnabled();

  await page.getByRole("button", { name: "Request refund approval" }).click();
  await page.locator(".modal.open").getByLabel("Type PAY0200 to confirm").fill("PAY0200");
  await confirm(page);
  await expect(page.getByText(/Pending approval/)).toBeVisible();

  await page.goto("/audit");
  const approvalsPanel = page.getByRole("heading", { level: 3, name: "Pending approvals" }).locator("..");
  const row = approvalsPanel.getByRole("row", { name: /PAY0200/ });
  await expect(row).toContainText("600,00 kr");
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();

  // Ops can decide approvals but cannot refund, so it cannot approve a refund (C-02).
  const ops = await page.context().newPage();
  await session(ops, "lena");
  await ops.goto("/audit");
  const opsRow = ops.getByRole("heading", { level: 3, name: "Pending approvals" }).locator("..").getByRole("row", { name: /PAY0200/ });
  await expect(opsRow.getByRole("button", { name: "Approve" })).toBeDisabled();
  await ops.close();

  const reviewer = await page.context().newPage();
  await session(reviewer, "nora");
  await reviewer.goto("/audit");
  const decisionPanel = reviewer.getByRole("heading", { level: 3, name: "Pending approvals" }).locator("..");
  const decisionRow = decisionPanel.getByRole("row", { name: /PAY0200/ });
  await expect(decisionRow.getByRole("button", { name: "Approve" })).toBeEnabled();
  await decisionRow.getByRole("button", { name: "Approve" }).click();
  await confirm(reviewer);
  await expect(decisionPanel.getByRole("row", { name: /PAY0200/ })).toHaveCount(0);
  await reviewer.close();

  await page.goto("/payments/PAY0200");
  await expect(page.getByTestId("payment-timeline")).toContainText("Refunded");
  await expect(page.getByTestId("refund-count")).toHaveText("1");
});

test("R10 bank review rejects invalid bank details without a business write", async ({ page }) => {
  await session(page);
  await page.goto("/payouts");
  await page.getByLabel("Payout IBAN").fill("SE0000000000000000000000");
  await expect(page.getByTestId("payout-bank-check")).toContainText("IBAN failed");
  await expect(page.getByRole("button", { name: "Approve bank" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject bank" })).toBeEnabled();
});

test("R10 finance workspaces remain usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/payments?tab=tools");
  await expect(page.getByTestId("payment-policy")).toBeVisible();
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await page.goto("/payouts");
  await expect(page.getByTestId("payout-detail")).toBeVisible();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
