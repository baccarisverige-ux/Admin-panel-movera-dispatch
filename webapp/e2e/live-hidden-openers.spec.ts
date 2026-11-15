import { expect, test } from "@playwright/test";
import { fakeTripServer, signIn } from "./live-fake";

/**
 * C10 (audit A16 §2, D1/D4/D9/D10/D11): on live, an editor whose Save is hidden (the server has no command for it
 * yet) is not opened either: the opener is hidden the same way (hide only, Rule 21).
 */
test.beforeEach(async ({ page }) => {
  await fakeTripServer(page);
  await signIn(page);
});

// BQ-V44 (contract 0.18.103): D1 hid the tab while the demo builder had no server. Now the tab shows the server's
// bonus campaigns (/admin/bonuses); the demo builder (ride / area bonuses) stays demo-only (Rule 21).
test("D1 → V44: Drivers › Bonuses on live shows the server's campaigns, not the demo builder", async ({ page }) => {
  await page.goto("/drivers?view=bonuses");
  await expect(page.getByRole("heading", { level: 2, name: "Drivers" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Bonuses" })).toBeVisible();
  await expect(page.getByTestId("live-bonus-campaigns")).toBeVisible();
  await expect(page.getByText("No bonus campaign here yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /New campaign/ })).toBeVisible();
  await expect(page.getByText("New ride bonus")).toHaveCount(0);
  await expect(page.getByText("New area bonus")).toHaveCount(0);
});

test("D4/D9: Trips has no Save view and no Settings on live; ?view=settings shows the list", async ({ page }) => {
  await page.goto("/trips?view=settings&status=completed");
  await expect(page.getByRole("heading", { level: 2, name: "Trips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save view" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Trip settings" })).toHaveCount(0);
});

test("D4/D10/D11: Reports has no Save view, no Schedule and no Who sees other admins' work on live", async ({ page }) => {
  await page.goto("/reports?tab=work");
  await expect(page.getByRole("heading", { level: 2, name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save view" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Schedule" })).toHaveCount(0);
  await expect(page.getByText("Who sees other admins' work")).toHaveCount(0);
});
