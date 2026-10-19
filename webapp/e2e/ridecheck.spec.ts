import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("rc-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("rc-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function switchTo(page: Page, agentId: string) {
  await page.evaluate((id) => localStorage.setItem("movera-admin-session", id), agentId);
  await page.reload();
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

const banner = (page: Page) => page.getByRole("region", { name: "Ride check alert" });

test("Dispatch › Safety: Ride check triggers with their numbers, limits and change lines", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=safety");
  const card = page.getByRole("region", { name: "Ride check", exact: true });
  await expect(card).toContainText("Finished far from drop-off");
  await expect(card.getByTestId("ride-check-far")).toContainText("More than 3 km");
  await expect(card.getByTestId("ride-check-stop")).toContainText("More than 2 min");
  await expect(card.getByLabel("Off the route from")).toHaveValue("2");
  await expect(card.getByLabel("Longer than expected from")).toHaveValue("50");
  await expect(card.getByLabel("Possible crash on")).toBeChecked();

  // A number outside its limits (0.5 to 20 km) stays as typed and is marked with the limit (UI-10).
  await card.getByLabel("Off the route from").fill("45");
  await card.getByLabel("Off the route from").blur();
  await expect(card.getByLabel("Off the route from")).toHaveValue("45");
  await expect(card.getByLabel("Off the route from")).toHaveAttribute("aria-invalid", "true");
  await expect(card.locator(".num-field-error")).toContainText("Max 20");
  await card.getByLabel("Off the route from").fill("3");
  await card.getByLabel("Possible crash on").uncheck();
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const changes = page.getByRole("list", { name: "Changes not live yet" });
  await expect(changes).toContainText("Off the route from (km): 2 → 3");
  await expect(changes).toContainText("Ride check on a possible crash: on → off");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Ride check", exact: true }).getByLabel("Off the route from")).toHaveValue("3");

  await page.goto("/risk");
  await expect(page.getByRole("complementary", { name: "Zones" })).toContainText("Ride check (Dispatch)");
  await expect(page.getByRole("complementary", { name: "Zones" })).toContainText("stop over 2 min");
  await expect(page.getByRole("complementary", { name: "Zones" })).not.toContainText("possible crash");
});

test("Ride check triggers: one shared setting edited from Dispatch Safety, Dispatch Live and the Dashboard", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=safety");
  const triggers = page.getByRole("region", { name: "Ride check triggers" });
  await expect(triggers.getByLabel("Finished far from drop-off")).toHaveValue("3");
  await expect(triggers.getByLabel("Unexpected long stop")).toHaveValue("2");
  await triggers.getByLabel("Finished far from drop-off").fill("0");
  await expect(triggers).toContainText("must be more than 0 km");
  await expect(triggers.getByRole("button", { name: "Save" })).toBeDisabled();
  await triggers.getByLabel("Finished far from drop-off").fill("5");
  await triggers.getByLabel("Unexpected long stop").fill("10");
  await triggers.getByRole("button", { name: "Save" }).click();
  await confirm(page);
  await expect(triggers).toContainText("Everything is saved");
  await expect(page.getByRole("region", { name: "Ride check", exact: true }).getByTestId("ride-check-far")).toContainText("More than 5 km");

  await page.goto("/dispatch?view=live");
  await expect(page.getByRole("region", { name: "Ride check triggers" }).getByLabel("Unexpected long stop")).toHaveValue("10");
  await page.getByRole("region", { name: "Ride check triggers" }).getByLabel("Unexpected long stop").fill("8");
  await page.getByRole("region", { name: "Ride check triggers" }).getByRole("button", { name: "Save" }).click();
  await confirm(page);
  await expect(page.getByRole("region", { name: "Ride check triggers" })).toContainText("Everything is saved");

  await page.goto("/?tab=work");
  await expect(page.getByRole("region", { name: "Ride check triggers" }).getByLabel("Finished far from drop-off")).toHaveValue("5");
  await expect(page.getByRole("region", { name: "Ride check triggers" }).getByLabel("Unexpected long stop")).toHaveValue("8");
});

test("a ride check alert: red banner on every page and in Live until opened, then the incident with both answers", async ({ page }) => {
  await session(page);
  await page.goto("/");
  await expect(banner(page)).toContainText("Ride check: Accident or collision (driver)");
  await expect(banner(page)).toContainText("Is anyone hurt? Not sure");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("movera-admin-ridecheck-heard") ?? "")).toContain("ride_check:RC-1001");
  await page.goto("/drivers");
  await expect(banner(page)).toBeVisible();
  await page.goto("/dispatch?view=live");
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole("list", { name: "Ride checks in Live" })).toContainText("Accident or collision (driver)");

  await banner(page).getByRole("button", { name: "Open ride check" }).click();
  await expect(page).toHaveURL(/\/incidents\?case=INC-RC-1/);
  await expect(banner(page)).toHaveCount(0);
  const view = page.getByRole("article", { name: "Case INC-RC-1" });
  const answers = view.getByRole("region", { name: "Ride check answers" });
  await expect(answers).toContainText("Possible crash");
  await expect(answers.getByLabel("Driver answer")).toContainText("Accident or collision");
  await expect(answers.getByLabel("Driver answer")).toContainText("Is anyone hurt? Not sure");
  await expect(answers.getByLabel("Rider answer")).toContainText("There was an accident");
  await expect(answers).toContainText("Alert opened by Nora Lind");
  await expect(view.getByRole("region", { name: "Call" }).getByRole("button", { name: /Call driver/ })).toBeEnabled();
  await expect(view.getByRole("region", { name: "Call" }).getByRole("button", { name: /Call rider/ })).toBeEnabled();
  await expect(view.getByRole("img", { name: "Where the car of INC-RC-1 is" })).toBeVisible();
  await expect(view.getByRole("region", { name: "People and trip" })).toContainText("MVR 145");
  await expect(view.getByRole("region", { name: "People and trip" }).getByRole("link", { name: "T0046" })).toBeVisible();
  await expect(view.getByRole("region", { name: "What happened" })).toContainText("Nora Lind: Opened the alert");

  await page.reload();
  await expect(page.getByRole("article", { name: "Case INC-RC-1" })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await switchTo(page, "lena");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 2 })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
});

test("a dispatcher sees the banner too and opens the trip", async ({ page }) => {
  await session(page, "daniel");
  await page.goto("/trips");
  await expect(banner(page)).toContainText("Accident or collision (driver)");
  await banner(page).getByRole("button", { name: "Open ride check" }).click();
  await expect(page).toHaveURL(/\/trips\/T0046/);
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByTestId("trip-timeline")).toContainText("Ride check, driver: Accident or collision");
});

test("ride check log: every check with filters, repeats, and links to the trip", async ({ page }) => {
  await session(page);
  await page.goto("/incidents");
  await page.getByRole("tab", { name: /Ride checks/ }).click();
  await expect(page.getByRole("heading", { name: "Ride checks in Sweden" })).toBeVisible();
  const rows = page.getByRole("table", { name: "Ride check log" }).locator("tbody tr");
  // The log loads after the tab opens; wait for it before counting.
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(12);
  const all = await rows.count();
  expect(all).toBeGreaterThanOrEqual(12);
  await page.getByLabel("Trigger", { exact: true }).selectOption({ label: "Dropped far away" });
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Dropped far away");
  await page.getByLabel("Trigger", { exact: true }).selectOption({ label: "Every trigger" });
  await page.getByLabel("Answer", { exact: true }).selectOption({ label: "Alert sent" });
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole("table", { name: "Ride check log" })).toContainText("INC-RC-1");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(all);
  await page.getByLabel("Zone", { exact: true }).selectOption({ label: "Södertälje" });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("The car broke down");
  await page.getByLabel("Zone", { exact: true }).selectOption({ label: "Every zone" });
  await page.getByRole("region", { name: "Keeps coming back" }).getByRole("button", { name: /Ella Ek/ }).click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByLabel("Driver", { exact: true })).toHaveValue("D0030");
  await page.getByLabel("From date", { exact: true }).fill("2030-01-01");
  await expect(page.getByText("No ride check matches these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByRole("table", { name: "Ride check log" }).getByRole("link", { name: "T0138" }).click();
  await expect(page).toHaveURL(/\/trips\/T0138/);
  const timeline = page.getByTestId("trip-timeline");
  await expect(timeline).toContainText("Ride check: Dropped far away · Trip ended 800 m from the drop-off");
  await expect(timeline).toContainText("Ride check, driver: I'm OK");
  await expect(timeline).toContainText("Ride check, rider: I feel unsafe · Are you in danger right now? No");
  await expect(timeline.getByRole("link", { name: "INC-RC-2" })).toBeVisible();
});
