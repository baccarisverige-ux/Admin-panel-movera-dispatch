import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Payments", exact: true })).toBeVisible();
}

test("a timed-out double click still refunds once", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page);
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page.getByTestId("payment-count")).toContainText("300 payments");
  await page.getByRole("tab", { name: "Methods and tools" }).click();
  await expect(page.getByTestId("bank-check")).toContainText("SEB");
  await expect(page.getByTestId("bank-check")).toContainText("IBAN checks");
  await page.goto("/system");
  await page.getByLabel("Simulate errors").selectOption("slow");
  await page.goto("/payments/PAY0002");
  const refund = page.getByRole("button", { name: "Refund payment" });
  await refund.click();
  // A refund asks for a reason and the payment id (UI-04); a double click on Confirm still refunds once.
  const modal = page.locator(".modal.open");
  await modal.getByLabel("Type PAY0002 to confirm").fill("PAY0002");
  await modal.getByRole("button", { name: "Confirm" }).dblclick();
  await expect(page.getByText("Unknown. Check the audit before trying again.")).toBeVisible();
  await expect(page.getByTestId("payment-timeline")).toContainText("Refunded");
  await expect(page.getByTestId("refund-count")).toHaveText("1");
  // Nothing is left to retry once the refund went through.
  await expect(page.getByRole("button", { name: "Retry refund" })).toBeDisabled();
  await expect(page.getByTestId("refund-count")).toHaveText("1");
  if (process.env.SHOTS) {
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `docs/gates/g10/payment-${width}.png`, fullPage: true });
    }
    await page.goto("/payments");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "docs/gates/g10/payments-1440.png", fullPage: false });
  }
  await page.goto("/system");
  await page.getByLabel("Simulate errors").selectOption("none");
});
