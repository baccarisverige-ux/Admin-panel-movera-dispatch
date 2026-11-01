import { expect, test, type Page } from "@playwright/test";

/** Q24: at 1280 px and below the country picker, Inbox and Sign out are in the top bar's "⋯" menu. */
async function topbarMore(page: Page) {
  const more = page.getByRole("button", { name: "More options", exact: true });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") await more.click();
}

async function signInAs(page: Page, id: string) {
  await page.addInitScript((agent) => {
    localStorage.setItem("movera-admin-session", agent);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, id);
}

test("country first, then zones, then period drive the dashboard", async ({ page }) => {
  // "Today" just after midnight holds a minute of rides, so every zone reads 0 and picking one cannot change the number
  // (failed in CI at 00:01 Stockholm). Run at midday; e2e/midnight.spec.ts covers the minutes around midnight.
  await page.clock.install({ time: new Date("2026-10-14T12:00:00Z") });
  await signInAs(page, "nora");
  await page.goto("/");
  await expect(page.getByTestId("gross-bookings")).toContainText("kr");

  await topbarMore(page);
  await page.getByRole("radio", { name: "France" }).click();
  await expect(page).toHaveURL(/country=FR/);
  await expect(page.getByTestId("gross-bookings")).toContainText("€");
  const allZones = await page.getByTestId("gross-bookings").innerText();

  await page.getByRole("button", { name: /Zones:/ }).click();
  await page.getByRole("group", { name: "Zones in France" }).getByText("La Défense").click();
  await expect(page).toHaveURL(/scope=FR-LD/);
  await expect(page.getByRole("button", { name: "Zones: La Défense" })).toBeVisible();
  await expect(page.getByTestId("gross-bookings")).not.toHaveText(allZones);

  // Close the zone list and the "⋯" menu over the page (Escape closes one at a time).
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Month" }).click();
  await expect(page).toHaveURL(/period=month/);
  await page.getByLabel("Pick a date").fill("2026-09-15");
  await expect(page).toHaveURL(/period=date&on=2026-09-15/);

  await page.getByRole("link", { name: "Drivers", exact: true }).click();
  await expect(page).toHaveURL(/\/drivers\?country=FR&scope=FR-LD/);
  await topbarMore(page);
  await expect(page.getByRole("button", { name: "Zones: La Défense" })).toBeVisible();
});

test("a country manager only sees their country", async ({ page }) => {
  await signInAs(page, "yasmine");
  await page.goto("/?country=SE");
  await topbarMore(page);
  await expect(page.getByRole("radiogroup", { name: "Country" }).getByRole("radio")).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "Tunisia" })).toBeChecked();
  await expect(page.getByTestId("gross-bookings")).toContainText("DT");
});

test("scheduled rides show upcoming, past and calendar", async ({ page }) => {
  await signInAs(page, "nora");
  await page.goto("/");
  await page.getByRole("tab", { name: /^Work/ }).click();
  const rides = page.getByRole("region", { name: "Scheduled rides" }).or(page.locator(".rides-card"));
  await expect(rides.getByRole("cell").first()).toBeVisible();
  await rides.getByRole("tab", { name: /Past/ }).click();
  await page.getByRole("radio", { name: "Week" }).click();
  await expect(rides.getByText("completed").first()).toBeVisible();
  await rides.getByRole("tab", { name: "Calendar" }).click();
  await expect(rides.locator(".cal-day")).toHaveCount(7);
});

test("a passed reservation can be marked as no-show", async ({ page }) => {
  await signInAs(page, "nora");
  await page.goto("/reservations/B002");
  await page.getByRole("button", { name: "Mark no-show" }).click();
  const modal = page.locator(".modal.open");
  const input = modal.getByLabel("Type B002 to confirm");
  if (await input.count()) await input.fill("B002");
  await modal.getByLabel("Reason", { exact: true }).selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Reservation marked as no-show.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/· No show ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark no-show" })).toBeDisabled();
  await page.goto("/reservations");
  await page.getByRole("button", { name: "No-show" }).or(page.getByRole("tab", { name: "No-show" })).first().click();
  await expect(page.getByRole("cell", { name: "B002" })).toBeVisible();
});

test("the dashboard has four tabs with live widgets, activity and insights", async ({ page }) => {
  await signInAs(page, "nora");
  await page.goto("/?country=SE");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("status").filter({ hasText: /Live · updated/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset demo" })).toHaveCount(0);

  await page.getByRole("tab", { name: /^Live/ }).click();
  await expect(page).toHaveURL(/tab=live/);
  const supply = page.getByRole("region", { name: "Supply vs demand" });
  await expect(supply.getByRole("listitem").first()).toBeVisible();
  await supply.getByRole("button", { name: "Show on map" }).click();
  await expect(supply.getByRole("button", { name: "Hide on map" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Airport queue" })).toContainText("drivers waiting");
  await expect(page.getByRole("region", { name: "Surge and boost zones" })).toBeVisible();

  await page.getByRole("tab", { name: /^Work/ }).click();
  await expect(page.getByRole("region", { name: "Recent activity" })).toBeVisible();

  await page.getByRole("tab", { name: "Insights", exact: true }).click();
  const insights = page.getByRole("region", { name: "Insights" });
  await expect(insights.getByText("Best rating")).toBeVisible();
  await insights.getByRole("tab", { name: "Cancellations" }).click();
  await expect(insights.getByText("By rider")).toBeVisible();
  await insights.getByRole("tab", { name: "Ratings & complaints" }).click();
  await expect(insights.getByText("Average rating")).toBeVisible();

  await page.goto("/system");
  await expect(page.getByRole("region", { name: "Demo tools" }).or(page.getByRole("article", { name: "Demo tools" }))).toBeVisible();
});
