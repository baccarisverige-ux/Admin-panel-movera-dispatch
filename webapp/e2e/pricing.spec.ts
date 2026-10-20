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
  await quote.getByLabel("Quote waiting minutes").fill("5");
  // 3 paid minutes × 12.26 kr after 2 free: 233.78 × 1.1 = 257.16
  await expect(page.getByTestId("quote-total")).toHaveText("257,00 kr");
  await quote.getByLabel("Quote baby seats").fill("1");
  await expect(page.getByTestId("quote-lines")).toContainText("1 baby seat");

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

test("pickup pay is set per category, paid by Movera, and published with the zone", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Pricing", exact: true }).click();
  await page.getByRole("tab", { name: "Pickup pay" }).click();
  await expect(page.getByRole("heading", { name: "Pickup pay · paid by Movera" })).toBeVisible();
  await expect(page.getByLabel("Comfort pickup per km")).toHaveValue("3");
  await expect(page.getByText("Normal reservations taken from Scheduled rides")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Pickup pay for normal reservations from Scheduled rides" })).toBeDisabled();
  await expect(page.getByText(/The old "Long pickup fee"/)).toBeVisible();

  const toggle = (name: string) => page.locator("label.mini-switch", { has: page.getByRole("switch", { name, exact: true }) }).click();
  const example = page.getByTestId("pickup-example");
  // Comfort 3 kr/km + 1 kr/min, 4.2 km / 9 min, 1 km and 2 min free: 3.2 × 3 + 7 × 1 = 16.60
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("16,60 kr");
  await toggle("Comfort free first km");
  await toggle("Comfort free first minutes");
  // No free part: 4.2 × 3 + 9 × 1 = 21.60
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("21,60 kr");

  // Pay by distance: 0–10 km at 3/km, then >10 km and above at 4/km. 4.2 km falls in 0–10.
  await page.getByRole("group", { name: "Comfort pickup ranges" }).getByRole("button", { name: "Add range" }).click();
  await expect(page.getByLabel("Comfort pickup per km")).toBeDisabled();
  await page.getByRole("group", { name: "Comfort pickup ranges" }).getByRole("button", { name: "Add range" }).click();
  await page.getByLabel("Comfort range 2 per km").fill("4");
  await expect(example.getByTestId("pickup-example-range")).toContainText("0–10 km");
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("21,60 kr");
  await example.getByLabel("Example pickup km").fill("12");
  // 12 km is in >10 and above: 12 × 4 + 9 × 1 = 57
  await expect(example.getByTestId("pickup-example-range")).toContainText(">10 km and above");
  await expect(example.getByTestId("pickup-pay-total")).toHaveText("57,00 kr");
  await example.getByLabel("Example pickup km").fill("4.2");

  await page.getByRole("radio", { name: "Fare + pickup line" }).click();
  await expect(page.getByTestId("offer-breakdown")).toContainText("incl. 21,60 kr pickup · 4.2 km · 9 min");
  await toggle("Pickup pay for Radar trips");
  await expect(page.getByRole("switch", { name: "Pickup pay for Radar trips", exact: true })).not.toBeChecked();

  await page.getByRole("region", { name: "Unpublished changes" }).getByRole("button", { name: "Publish changes" }).click();
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Published as pricing revision/)).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText(/Pickup pay for Radar trips turned off/).first()).toBeVisible();
  await expect(page.getByText(/Comfort · pickup ranges one rate → 0–10 km 3\/km 1\/min, >10 km and above 4\/km 1\/min/).first()).toBeVisible();
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
  await expect(page).toHaveURL(/\/dispatch\?zone=Z001&tab=rides/);
  await expect(page.getByRole("tab", { name: "Rides & stops" })).toHaveAttribute("aria-selected", "true");
  const card = page.getByRole("region", { name: "Rider cancel fees" });
  await expect(card).toBeInViewport();
  await expect(card.getByRole("group", { name: "Live trips cancel fees" })).toBeVisible();
});
