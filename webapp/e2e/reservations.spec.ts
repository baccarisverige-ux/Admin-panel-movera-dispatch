import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("reservation queue uses seeded records and preserves booked policy snapshots", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Reservations", exact: true }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Reservations" })).toBeVisible();
  await expect(page.getByTestId("reservation-settings-link")).toContainText("res-2");
  await expect(page.getByLabel("Booking horizon")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "B021" })).toBeVisible();

  await page.getByRole("cell", { name: "B021" }).click();
  await expect(page).toHaveURL(/\/reservations\/B021$/);
  await expect(page.getByTestId("reservation-policy-snapshot")).toContainText("Policy snapshot · res-1");
  await expect(page.getByTestId("reservation-policy-snapshot")).toContainText("Booking horizon 5 days");
});

test("reservation settings live in Radar · Exclusive · Reservations; the Reservations page keeps the list and a link", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Reservations", exact: true }).click();
  await page.getByRole("link", { name: "Open reservation settings" }).click();
  // The old Dispatch › Reservations link lands in the new section (same rules, same behaviour), on its first zone.
  await expect(page).toHaveURL(/\/offers\?.*tab=reservations/);
  await expect(page.getByRole("heading", { name: /^Radar · Exclusive · Reservations in / })).toBeVisible();
  await page.getByRole("navigation", { name: "Zones" }).getByRole("button", { name: /^Norrmalm/ }).click();
  await expect(page.getByRole("tab", { name: "Reservations" })).toHaveAttribute("aria-selected", "true");
  const policy = page.getByTestId("reservation-policy");
  await expect(policy).toContainText("Reservation policy · all zones · res-2");
  await expect(policy.getByLabel("Booking horizon")).toHaveValue("7");
  await expect(policy.getByLabel("Assignment lead")).toHaveValue("30");
  await expect(policy.getByLabel("Give-up time")).toHaveValue("5");
  await expect(policy.getByLabel("Included waiting")).toHaveValue("5");
  // Rider free cancel and fees are only in Rides & stops › Rider cancel fees, not in the policy.
  await expect(policy.getByLabel("Free cancel after accept")).toHaveCount(0);
  await expect(policy).not.toContainText("Free cancel");
});

test("no driver near pickup: raise the driver's fare from Movera's commission, never over the cap", async ({ page }) => {
  // The demo reservations are seeded around 2026-10-05 16:00 UTC; pin the clock there so B021 stays in the future.
  await page.clock.setFixedTime(new Date("2026-10-05T16:00:00Z"));
  await signIn(page);
  await page.goto("/reservations/B021");
  const panel = page.getByTestId("reservation-raise");
  await expect(panel).toContainText("Movera's commission");
  await expect(panel).toContainText("highest raise 500,00 kr");
  await panel.getByLabel("Fare raise").fill("50");
  await expect(panel.getByRole("status")).toContainText("All from Movera's commission");
  await panel.getByLabel("Fare raise").fill("250");
  await expect(panel.getByRole("status")).toContainText("beyond Movera's commission. Movera pays the difference.");
  await panel.getByLabel("Fare raise").fill("600");
  await expect(panel.getByRole("alert")).toContainText("The raise can be at most 500 kr.");
  await expect(panel.getByRole("button", { name: "Raise the fare" })).toBeDisabled();
  await panel.getByLabel("Fare raise").fill("120");
  await panel.getByRole("button", { name: "Raise the fare" }).click();
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Driver fare raised by 120,00\skr\. Drivers see the new fare\./)).toBeVisible();
  await expect(page.getByTestId("reservation-raise-now")).toContainText("Drivers see +120,00 kr on the offer.");
});
