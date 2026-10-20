import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "daniel") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page, target?: string) {
  const modal = page.locator(".modal.open");
  if (target) {
    const input = modal.getByLabel(`Type ${target} to confirm`);
    if (await input.count()) await input.fill(target);
  }
  // Cancel and refund dialogs start with no reason (A-O1): pick the first one when none is chosen.
  const reason = modal.getByLabel("Reason", { exact: true });
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("R11 policy changes create a new version without rewriting existing reservation snapshots", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=reservations");
  const policy = page.getByTestId("reservation-policy");
  await expect(policy).toContainText("res-2");
  await policy.getByLabel("Give-up time").fill("40");
  await expect(policy.getByRole("alert")).toContainText("Give-up time cannot exceed assignment lead time.");
  await expect(policy.getByRole("button", { name: "Save reservation policy" })).toBeDisabled();
  await policy.getByLabel("Give-up time").fill("5");
  await policy.getByLabel("Booking horizon").fill("10");
  await policy.getByRole("button", { name: "Save reservation policy" }).click();
  await confirm(page);
  await expect(page.getByText(/Reservation policy saved as res-3/)).toBeVisible();
  await expect(policy).toContainText("res-3");

  await page.goto("/reservations");
  await expect(page.getByTestId("reservation-settings-link")).toContainText("res-3");
  await page.getByRole("cell", { name: "B021" }).click();
  await expect(page).toHaveURL(/\/reservations\/B021$/);
  await expect(page.getByTestId("reservation-policy-snapshot")).toContainText("Policy snapshot · res-1");
  await expect(page.getByTestId("reservation-policy-snapshot")).toContainText("Booking horizon 5 days");
});

test("R11 assignment contact return unassign and cancel lifecycle persists", async ({ page }) => {
  test.setTimeout(90_000);
  // The demo reservations are seeded around 2026-10-05 16:00 UTC; pin the clock there so B021 stays in the future.
  await page.clock.setFixedTime(new Date("2026-10-05T16:00:00Z"));
  await session(page);
  await page.goto("/reservations/B021");

  await expect(page.getByRole("button", { name: "Assign driver" })).toBeEnabled();
  await expect(page.getByTestId("reservation-dispatch")).toContainText("The driver must accept.");
  const first = await page.getByLabel("Reservation driver").inputValue();

  // Assigned by Movera: the driver must accept. A no lets the admin pick someone else.
  await page.getByRole("button", { name: "Assign driver" }).click();
  await confirm(page);
  await expect(page.getByText(`Sent to ${first} as “Assigned by Movera”. Waiting for the driver to accept.`)).toBeVisible();
  await expect(page.getByTestId("reservation-ask")).toContainText(`waiting for`);
  await expect(page.getByTestId("reservation-ask")).toContainText("30 s left");
  await expect(page.getByRole("button", { name: "Assign driver" })).toBeDisabled();
  await expect(page.getByTestId("reservation-summary")).toContainText("Driver Unassigned");
  await page.getByRole("button", { name: "Driver said no (demo)" }).click();
  await confirm(page);
  await expect(page.getByTestId("reservation-ask")).toContainText("said no. Pick someone else.");
  await expect(page.getByLabel("Reservation driver").locator("option", { hasText: "did not accept" })).toHaveCount(1);
  // Another eligible driver is picked first when there is one; here the admin may also ask the same driver again.
  const chosen = await page.getByLabel("Reservation driver").inputValue();

  await page.getByRole("button", { name: "Assign driver" }).click();
  await confirm(page);
  await page.getByRole("button", { name: "Driver accepted (demo)" }).click();
  await confirm(page);
  await expect(page.getByText(/accepted. The ride is theirs./)).toBeVisible();
  await expect(page.getByTestId("reservation-summary")).toContainText(`Driver ${chosen}`);
  await expect(page.getByRole("list", { name: "Reservation offer history" })).toContainText("accepted");
  await expect(page.getByRole("list", { name: "Reservation offer history" })).toContainText("declined");

  await page.getByLabel("Contact note").fill("Rider confirmed pickup");
  await page.getByRole("button", { name: "Log contact" }).click();
  await confirm(page);
  await expect(page.getByText("SMS contact logged.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Reservation contacts" })).toContainText("Rider confirmed pickup");

  await page.getByLabel("Return pickup").fill("2026-10-06T18:00");
  await page.getByRole("button", { name: "Save return ride" }).click();
  await confirm(page);
  await expect(page.getByText("Return ride saved with Stockholm DST validation.")).toBeVisible();
  await expect(page.getByTestId("reservation-summary")).not.toContainText("Return Not scheduled");

  await page.getByRole("button", { name: "Unassign" }).click();
  await confirm(page);
  await expect(page.getByText("Driver unassigned. Reservation returned to waiting.")).toBeVisible();
  await expect(page.getByTestId("reservation-summary")).toContainText("Driver Unassigned");

  await page.getByRole("button", { name: "Cancel reservation" }).click();
  await confirm(page, "B021");
  await expect(page.getByText(/Reservation cancelled. Policy res-1 remains/)).toBeVisible();
  await expect(page.getByTestId("reservation-policy-snapshot")).toContainText("res-1");

  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Reservation B021" })).toBeVisible();
  await expect(page.getByText(/Cancelled/).first()).toBeVisible();
  await expect(page.getByTestId("reservation-policy-snapshot")).toContainText("res-1");
  await expect(page.getByRole("list", { name: "Reservation contacts" })).toContainText("Rider confirmed pickup");
});

test("R11 Stockholm DST validation rejects spring gap and disambiguates fall overlap", async ({ page }) => {
  await session(page);
  await page.goto("/reservations/B021");

  await page.getByLabel("Return pickup").fill("2026-03-29T02:30");
  await expect(page.getByText(/does not exist because of the DST clock change/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save return ride" })).toBeDisabled();

  await page.getByLabel("Return pickup").fill("2026-10-25T02:30");
  await expect(page.getByText(/occurs twice because the DST clock moves back/)).toBeVisible();
  await expect(page.getByLabel("DST disambiguation")).toBeEnabled();
  await page.getByLabel("DST disambiguation").selectOption("later");
  await expect(page.getByRole("button", { name: "Save return ride" })).toBeEnabled();
});

test("R11 viewer can inspect but cannot mutate reservation policy or dispatch", async ({ page }) => {
  await session(page, "anna");
  await page.goto("/dispatch?zone=Z001&tab=reservations");
  await expect(page.getByTestId("reservation-policy").getByLabel("Booking horizon")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save reservation policy" })).toBeDisabled();

  await page.goto("/reservations/B021");
  await expect(page.getByRole("button", { name: "Assign driver" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Raise the fare" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel reservation" })).toBeDisabled();
  await expect(page.getByLabel("Return pickup")).toBeDisabled();
});

test("R11 reservation detail remains usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reservations/B021");
  await expect(page.getByTestId("reservation-summary")).toBeVisible();
  await expect(page.getByTestId("reservation-dispatch")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
