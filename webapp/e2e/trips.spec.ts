import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("nora@movera.se");
  await page.getByLabel("Password").fill("movera");
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Trips" })).toBeVisible();
}

// Contract v0.3.0: an admin can cancel every non-terminal status. T0001–T0011 are draft … approaching_dropoff in the seed.
const ALLOWED = new Set(["T0001", "T0002", "T0003", "T0004", "T0005", "T0006", "T0007", "T0008", "T0009", "T0010", "T0011"]);

test("trips list uses all 600 and a trip page is complete", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.getByRole("link", { name: "Trips" }).click();
  await expect(page.getByTestId("trip-count")).toContainText("600 trips");
  await expect(page.getByTestId("trip-count")).toContainText("18 statuses");
  await page.getByLabel("Trip status").selectOption("completed");
  await expect(page.getByTestId("trip-count")).toContainText("33 match");
  await page.getByLabel("Trip status").selectOption("all");
  await page.getByLabel("From date").fill("2030-01-01");
  await expect(page.getByText("Nothing to show.")).toBeVisible();
  await page.getByLabel("From date").fill("");
  await page.getByLabel("Search this table").fill("T0004");
  await page.getByRole("cell", { name: "T0004", exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/T0004/);
  await expect(page.getByTestId("trip-timeline")).toContainText("Searching");
  await expect(page.getByTestId("trip-route")).toContainText("Pickup");
  await expect(page.getByTestId("trip-fare")).toContainText(/price-/);
  await expect(page.getByTestId("trip-fare")).toContainText("Waiting time charged");
  await expect(page.getByTestId("trip-waybill")).toContainText("Licence plate");
  await expect(page.getByTestId("trip-waybill")).toContainText("Passenger capacity");
  await expect(page.getByTestId("trip-pin")).toHaveText(/PIN verified (Yes|No)/);
  await expect(page.getByTestId("trip-payment")).toBeVisible();
  await expect(page.getByTestId("trip-rating")).toBeVisible();
  await expect(page.getByTestId("trip-pin")).not.toContainText(/\d{4}/);

  for (let index = 1; index <= 18; index += 1) {
    const id = `T${String(index).padStart(4, "0")}`;
    await page.goto(`/trips/${id}`);
    const button = page.getByRole("button", { name: "Cancel trip" });
    await expect(button).toBeVisible();
    if (ALLOWED.has(id)) {
      // Q27: one dialog with the cancel reason code and an optional note. A-O1: no reason is preselected.
      await expect(button).toBeEnabled();
      await button.click();
      const modal = page.locator(".modal.open");
      await expect(modal.getByLabel("Cancel reason")).toHaveValue("");
      await expect(modal.getByLabel("Note (optional)")).toBeVisible();
      await expect(modal.getByRole("button", { name: "Confirm" })).toBeDisabled();
      await modal.getByLabel("Cancel reason").selectOption({ index: 1 });
      await expect(modal.getByRole("button", { name: "Confirm" })).toBeEnabled();
      await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    } else {
      // Refused by the trip's status.
      await expect(button).toBeDisabled();
    }
  }

  await page.goto("/trips/T0012");
  await expect(page.getByTestId("cancel-block")).toContainText("completed");
  await page.goto("/trips/T0004");
  await page.getByRole("button", { name: "Cancel trip" }).click();
  // Only one dialog opens: the reason code and the optional note.
  await expect(page.locator(".modal.open")).toHaveCount(1);
  await expect(page.getByLabel("Reason", { exact: true })).toHaveCount(0);
  await page.getByLabel("Cancel reason").selectOption("admin_safety");
  await page.getByLabel("Note (optional)").fill("Rider called about the driver");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Trip T0004");
  await expect(page.getByTestId("trip-waybill")).toContainText("Cancelled by admin");
  await expect(page.getByTestId("trip-timeline")).toContainText("Safety");
  await page.reload();
  await expect(page.getByTestId("trip-waybill")).toContainText("Cancelled by admin");
  await expect(page.getByTestId("trip-timeline")).toContainText("Safety");
  await expect(page.getByTestId("trip-timeline")).toContainText("Rider called about the driver");
  await expect(page.getByRole("button", { name: "Cancel trip" })).toBeDisabled();
  if (process.env.SHOTS) {
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `docs/gates/g08/trip-${width}.png`, fullPage: true });
    }
    await page.goto("/trips");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "docs/gates/g08/trips-1440.png", fullPage: false });
  }
});
