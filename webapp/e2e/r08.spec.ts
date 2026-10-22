import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    localStorage.setItem("movera-admin-session", id);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page, target?: string) {
  const modal = page.locator(".modal.open");
  if (target) await modal.getByLabel(`Type ${target} to confirm`).fill(target);
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("R8 live quick dispatch offers an open request to an eligible vehicle-backed driver", async ({ page }) => {
  await session(page);
  await page.goto("/live");
  await expect(page.getByRole("heading", { level: 2, name: "Live map" })).toBeVisible();

  // T0003's only eligible drivers are in SOS or without GPS: nobody can take it, so quick dispatch says so.
  await page.getByRole("list", { name: "Open requests" }).getByRole("button", { name: /Open T0003/ }).click();
  await expect(page.getByTestId("quick-dispatch")).toBeVisible();
  await expect(page.getByRole("button", { name: "Offer request" })).toBeDisabled();

  // T0004 has free eligible drivers: a real exclusive offer (offer record, countdown), shown on the trip.
  await page.getByRole("list", { name: "Open requests" }).getByRole("button", { name: /Open T0004/ }).click();
  await expect(page.getByRole("button", { name: "Offer request" })).toBeEnabled();
  await page.getByRole("button", { name: "Offer request" }).click();
  await confirm(page);
  await expect(page.getByText(/T0004 offered to D\d+/)).toBeVisible();

  await page.goto("/trips/T0004");
  await expect(page.getByRole("heading", { level: 2, name: "Trip T0004" })).toBeVisible();
  await expect(page.getByText("Offered", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("trip-assign").getByRole("list", { name: "Offers" })).toContainText("Direct assign (exclusive)");
});

test("R8 waiting and bounded fare corrections persist and are audited", async ({ page }) => {
  await session(page);
  await page.goto("/trips/T0008");
  await expect(page.getByRole("heading", { level: 2, name: "Trip T0008" })).toBeVisible();
  await expect(page.getByTestId("waiting-block")).toContainText("Waiting time can be corrected");
  await expect(page.getByTestId("adjust-block")).toContainText("±15%");

  await page.getByLabel("Waiting minutes").fill("7");
  await page.getByRole("button", { name: "Save waiting time" }).click();
  await confirm(page);
  await expect(page.getByTestId("trip-fare")).toContainText("Waiting time charged: 7 min");

  await page.getByLabel("Fare adjustment percent").fill("12");
  await page.getByRole("button", { name: "Apply fare adjustment" }).click();
  await confirm(page);
  await expect(page.getByTestId("trip-fare")).toContainText("Charged 62,72 kr");

  await expect(page.getByRole("list", { name: "Trip intervention audit" })).toContainText("admin.trip.waiting");
  await expect(page.getByRole("list", { name: "Trip intervention audit" })).toContainText("admin.trip.adjust");

  await page.reload();
  await expect(page.getByTestId("trip-fare")).toContainText("Waiting time charged: 7 min");
  await expect(page.getByTestId("trip-fare")).toContainText("Charged 62,72 kr");
});

test("R8 trip actions follow lifecycle state", async ({ page }) => {
  await session(page);

  await page.goto("/trips/T0004");
  await expect(page.getByRole("button", { name: "Cancel trip" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Offer to driver" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reassign" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Apply fare adjustment" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save waiting time" })).toBeDisabled();

  await page.goto("/trips/T0044");
  await expect(page.getByRole("button", { name: "Offer to driver" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reassign" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Apply fare adjustment" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Save waiting time" })).toBeEnabled();

  await page.goto("/trips/T0048");
  // Disabled by the trip's status.
  await expect(page.getByRole("button", { name: "Cancel trip" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reassign" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Apply fare adjustment" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refund" })).toBeEnabled();
});

test("R8 dispatch rules are versioned and restorable in Dispatch, the one place to change them", async ({ page }) => {
  await session(page);
  await page.goto("/live");
  await expect(page.getByTestId("dispatch-link")).toContainText("Norrmalm");
  await expect(page.getByLabel("Norrmalm offer time")).toHaveCount(0);

  await page.goto("/offers?zone=Z001&tab=exclusive");
  await page.getByLabel("Exclusive time").fill("20");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();

  await page.goto("/live");
  await expect(page.getByRole("list", { name: "Live dispatch values" }).getByRole("listitem").filter({ hasText: "Norrmalm" })).toContainText("Exclusive 20 s");

  await page.goto("/dispatch?view=history");
  const versions = page.getByRole("list", { name: "Versions" });
  await expect(versions).toContainText("Norrmalm: Exclusive time to accept: 15 → 20");
  await versions.getByRole("button", { name: "Undo this version" }).first().click();
  await confirm(page);
  await expect(page.getByText(/undone/)).toBeVisible();
  await page.goto("/live");
  await expect(page.getByRole("list", { name: "Live dispatch values" }).getByRole("listitem").filter({ hasText: "Norrmalm" })).toContainText("Exclusive 15 s");
});

test("R8 scoped dispatcher sees only assigned zones in Dispatch and cannot change the rules", async ({ page }) => {
  await session(page, "daniel");
  await page.goto("/offers?tab=exclusive");
  const rail = page.getByRole("navigation", { name: "Zones" });
  await expect(rail.getByRole("button", { name: /^Norrmalm/ })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^Kista/ })).toHaveCount(0);
  await rail.getByRole("button", { name: /^Norrmalm/ }).click();
  await expect(page.getByText("You can view these rules.")).toBeVisible();
  await expect(page.getByLabel("Exclusive time")).toBeDisabled();
});

test("R8 trip page remains usable at 390px", async ({ page }) => {
  await session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trips/T0008");
  await expect(page.getByRole("heading", { level: 2, name: "Trip T0008" })).toBeVisible();
  await expect(page.getByLabel("Waiting minutes")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
