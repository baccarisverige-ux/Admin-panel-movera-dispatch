import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "astrid") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("fn-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("fn-test-session", "1");
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

test("payments: groups, who gets what, and a payment page with the rider and trip", async ({ page }) => {
  await session(page);
  await page.goto("/payments");
  await expect(page.getByRole("tab", { name: "Payments" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("navigation", { name: "Payment groups" }).getByRole("button", { name: /Failed/ }).click();
  await expect(page.locator("tbody tr").first()).toContainText("Failed");
  await page.getByRole("cell", { name: "PAY0001", exact: true }).click();
  await expect(page).toHaveURL(/\/payments\/PAY0001/);
  await expect(page.getByRole("region", { name: "Numbers" })).toContainText("Driver gets");
  await expect(page.getByRole("region", { name: "Payment details" })).toContainText("Tried");
  await expect(page.getByText(/Your refund limit is/)).toBeVisible();
});

test("failed payments retry, disputes get an answer, numbers per method", async ({ page }) => {
  await session(page);
  await page.goto("/payments?tab=failed");
  const failed = page.getByRole("list", { name: "Failed payments" });
  const first = failed.getByRole("listitem").filter({ hasText: "Our side" }).first();
  const id = (await first.getByRole("link").first().innerText()).trim();
  await first.getByRole("button", { name: "Retry now" }).click();
  await confirm(page);
  await expect(failed).not.toContainText(id);
  await page.getByRole("tab", { name: "Disputes" }).click();
  const dispute = page.getByRole("list", { name: "Disputes" }).getByRole("listitem").first();
  await expect(dispute).toContainText("Answer by");
  await dispute.getByRole("textbox").fill("Route, chat and GPS from the trip page");
  await dispute.getByRole("button", { name: "Send proof" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Disputes" }).getByRole("listitem").first()).toContainText("evidence sent");
  await page.getByRole("tab", { name: "Numbers" }).click();
  await expect(page.getByRole("table", { name: "Payment methods" })).toContainText("Apple Pay");
  // Q7 FINAL: no Swish, Klarna or PayPal anywhere in Payments.
  await expect(page.getByRole("table", { name: "Payment methods" })).not.toContainText(/Swish|Klarna|PayPal/);
});

test("payment rules: retries, owing riders and refund limits per role", async ({ page }) => {
  await session(page);
  await page.goto("/payments?tab=rules");
  await page.getByLabel("Finance refund limit").fill("50");
  await page.getByRole("button", { name: "Save payment rules" }).click();
  await confirm(page);
  await expect(page.getByText("Everything is saved")).toBeVisible();
  await page.goto("/payments/PAY0002");
  await expect(page.getByText("Over your refund limit of 50,00 kr. Ask a finance admin.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund payment" })).toBeDisabled();
});

test("payouts: the next run, line by line, hold with a reason, retry a failed payout, and the schedule", async ({ page }) => {
  await session(page);
  await page.goto("/payouts");
  await expect(page.getByRole("region", { name: "Next payout run" })).toContainText("Every Monday at 08:00");
  const lines = page.getByRole("region", { name: "Line by line" });
  await expect(lines).toContainText("Movera commission 20%");
  await expect(lines).toContainText("Driver gets");
  await lines.getByLabel("Hold reason").fill("Damage claim open");
  await lines.getByRole("button", { name: "Hold payout" }).click();
  await confirm(page);
  await expect(lines).toContainText("On hold by Astrid Ek: Damage claim open");
  await expect(page.getByRole("button", { name: "Mark paid" })).toBeDisabled();
  await lines.getByRole("button", { name: "Release payout" }).click();
  await confirm(page);
  await page.getByRole("cell", { name: "PO7", exact: true }).click();
  await expect(lines).toContainText("The bank returned the payment");
  await lines.getByRole("button", { name: "Retry payout" }).click();
  await confirm(page);
  await expect(lines).not.toContainText("The bank returned the payment");
  await page.getByRole("tab", { name: "Schedule and rules" }).click();
  await page.getByLabel("Approval over").fill("5000");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await confirm(page);
  await page.getByRole("tab", { name: "Payouts" }).click();
  await expect(page.getByRole("region", { name: "Next payout run" })).toContainText("a second admin must approve the run");
  await switchTo(page, "nora");
  await page.goto("/payouts");
  await page.getByRole("button", { name: "Approve run" }).click();
  await confirm(page);
  await expect(page.getByRole("region", { name: "Next payout run" })).toContainText("Approved by Nora Lind");
});

test("finance pages fit a phone", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 860 });
  for (const path of ["/payments", "/payments?tab=failed", "/payments/PAY0001", "/payouts", "/payouts?tab=schedule"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(392);
  }
});
