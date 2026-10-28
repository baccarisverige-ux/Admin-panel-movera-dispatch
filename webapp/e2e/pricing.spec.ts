import { expect, test, type Page } from "@playwright/test";

/** Q24: at 1280 px and below the country picker, Inbox and Sign out are in the top bar's "⋯" menu. */
async function topbarMore(page: Page) {
  const more = page.getByRole("button", { name: "More options", exact: true });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("test a ride follows the zone price list, in each country's currency", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Pricing" })).toBeVisible();
  await expect(page.getByLabel("Norrmalm Movera Price per km")).toHaveValue("12");
  await page.getByRole("button", { name: /^Test a ride/ }).click();
  const quote = page.getByTestId("quote-preview");
  await quote.getByLabel("Quote surge").fill("1");
  // 29 base + 8 km × 12 + 18 min × 4 = 197, plus 10% app fee = 216.70, rounded to 217
  await expect(page.getByTestId("quote-total")).toHaveText("217,00 kr");
  await quote.getByLabel("Quote waiting minutes").fill("8");
  // 3 paid minutes × 12.26 kr after 5 free (owner Q41): 233.78 × 1.1 = 257.16
  await expect(page.getByTestId("quote-total")).toHaveText("257,00 kr");
  // Owner 2026-10-27: no seat numbers; the seat fee row is only on Child Seat (a grey "—" elsewhere).
  await expect(quote.getByLabel("Quote baby seats")).toHaveCount(0);
  await expect(page.getByLabel("Norrmalm Movera Child seat fee")).toHaveCount(0);
  await expect(page.getByLabel("Child seat fee: not on Movera", { exact: true })).toHaveText("—");
  await expect(page.getByLabel("Norrmalm Child Seat Child seat fee")).toHaveValue("15");

  await topbarMore(page);
  await page.getByRole("radio", { name: "France" }).click();
  await expect(page.getByText(/prices in EUR, VAT included/)).toBeVisible();
  await expect(page.getByLabel("Paris Centre Movera Price per km")).toHaveValue("1.15");
  await expect(page.getByLabel("Paris Centre Child Seat Child seat fee")).toBeVisible();
  if (process.env.SHOTS) {
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `docs/gates/g09/pricing-${width}.png`, fullPage: true });
    }
  }
});

test("pickup pay is set per category: tiered ranges and a maximum for the driver, a fixed fee for the rider", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  await page.getByRole("tab", { name: "Pickup pay" }).click();
  await expect(page.getByRole("heading", { name: "Pickup pay", exact: true })).toBeVisible();
  // Default: the first km is a free range, then 3 kr/km + 1 kr/min.
  await expect(page.getByLabel("Comfort range 1 per km")).toHaveValue("0");
  await expect(page.getByLabel("Comfort range 2 per km")).toHaveValue("3");
  await expect(page.getByText("Normal reservations taken from Scheduled rides")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Pickup pay for normal reservations from Scheduled rides" })).toBeDisabled();
  await expect(page.getByText(/The old "Long pickup fee"/)).toHaveCount(0);

  const toggle = (name: string) => page.locator("label.mini-switch", { has: page.getByRole("switch", { name, exact: true }) }).click();
  const example = page.getByTestId("pickup-example");
  // 4.2 km / 9 min, first km free: 3.2 × 3 + 9 × (3.2 / 4.2) × 1 = 9.60 + 6.86 = 16.46
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("16,46 kr");
  // One range for everything: 4.2 × 3 + 9 × 1 = 21.60
  await page.getByRole("button", { name: "Delete Comfort range 1 (0–1 km)" }).click();
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("21,60 kr");

  // Tiered: 0–10 km at 3/km, then >10 km and above at 4/km. Each km is paid at its own range's rate.
  await page.getByRole("group", { name: "Comfort pickup ranges" }).getByRole("button", { name: "Add range" }).click();
  await page.getByLabel("Comfort range 2 per km").fill("4");
  await expect(example.getByTestId("pickup-example-range")).toHaveCount(1);
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("21,60 kr");
  await example.getByLabel("Example pickup km").fill("12");
  // 0–10: 10 × 3 + 7.5 min × 1 = 37.50; >10: 2 × 4 + 1.5 min × 1 = 9.50 → 47.00
  await expect(example.getByTestId("pickup-example-range").nth(1)).toContainText(">10 km and above");
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("47,00 kr");

  // The maximum per ride caps the total of all ranges.
  await toggle("Comfort maximum per ride");
  await page.getByLabel("Comfort maximum pickup pay per ride").fill("30");
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("30,00 kr");
  await expect(example.getByTestId("pickup-max-from")).toContainText("the maximum of 30,00 kr applies");
  await example.getByLabel("Example pickup km").fill("4.2");

  // The rider's fixed pickup fee is a line in the price; the driver's pay does not change.
  const riderBefore = await example.getByTestId("pickup-rider-pays").textContent();
  await toggle("Comfort rider pickup fee for Live rides (Radar & Exclusive)");
  await expect(example.getByTestId("pickup-rider-fee")).toHaveText("15,00 kr");
  await expect(example.getByTestId("pickup-rider-pays")).not.toHaveText(riderBefore ?? "");
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("21,60 kr");

  await toggle("Pickup pay for Radar trips");
  await expect(page.getByRole("switch", { name: "Pickup pay for Radar trips", exact: true })).not.toBeChecked();

  await page.getByRole("region", { name: "Unpublished changes" }).getByRole("button", { name: "Publish changes" }).click();
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Published as pricing revision/)).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText(/Pickup pay for Radar trips turned off/).first()).toBeVisible();
  await expect(page.getByText(/Comfort · pickup ranges 0–1 km 0\/km 0\/min, >1 km and above 3\/km 1\/min → 0–10 km 3\/km 1\/min, >10 km and above 4\/km 1\/min/).first()).toBeVisible();
  await expect(page.getByText(/Comfort · pickup pay maximum per ride none → 30/).first()).toBeVisible();
  await expect(page.getByText(/Comfort · rider pickup fee for live rides turned on/).first()).toBeVisible();
});

test("rider cancel fees are not set in Pricing: the Cancellation group points to Dispatch › Rider cancel fees", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  const prices = page.getByRole("region", { name: "Prices in Norrmalm" });
  await expect(prices.getByLabel("Norrmalm Movera No-show fee")).toBeVisible();
  await expect(prices.getByText("Rider free cancellation window")).toHaveCount(0);
  await expect(prices.getByText("Cancellation fee (after the window)")).toHaveCount(0);
  const pointer = page.getByTestId("rider-cancel-fees-pointer");
  await expect(pointer).toContainText("Rider cancel fees are set in Dispatch › Rides & stops › Rider cancel fees.");
  await pointer.getByRole("button", { name: "Open Rider cancel fees" }).click();
  await expect(page).toHaveURL(/\/dispatch\/rules\?zone=Z001&tab=rides/);
  await expect(page.getByRole("tab", { name: "Rides & stops" })).toHaveAttribute("aria-selected", "true");
  const card = page.getByRole("region", { name: "Rider cancel fees" });
  await expect(card).toBeInViewport();
  await expect(card.getByRole("group", { name: "Live trips cancel fees" })).toBeVisible();
});
