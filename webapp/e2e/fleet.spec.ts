import { expect, test, type Page } from "@playwright/test";

async function signInAs(page: Page, id = "nora") {
  await page.addInitScript((agent) => {
    localStorage.setItem("movera-admin-session", agent);
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, id);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
}

test("the menu groups fleet owners with drivers", async ({ page }) => {
  await signInAs(page);
  await page.goto("/");
  await expect(page.getByText("Fleet & Drivers", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Fleet owners", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Fleet owners" })).toBeVisible();
  await page.getByRole("cell", { name: "FO-SE-01" }).click();
  await expect(page).toHaveURL(/\/fleets\/O1/);
  await expect(page.getByRole("heading", { level: 2, name: "Johan Ekström" })).toBeVisible();
  await page.getByRole("tab", { name: "Fleets" }).click();
  const north = page.getByRole("list", { name: "Drivers in North fleet" });
  await expect(north).toContainText("Erik Söder");
  await north.locator(".fd-crew-name", { hasText: "Erik Söder" }).click();
  await expect(page).toHaveURL(/\/drivers\/D0001/);
  await expect(page.getByText("North fleet").first()).toBeVisible();
});

test("each driver document has its own status, expiry date and colour", async ({ page }) => {
  await signInAs(page);
  await page.goto("/drivers/D0002?tab=documents");
  const row = page.getByTestId("doc-vehicle_insurance");
  const expiry = row.getByLabel("Vehicle insurance expiry date");
  // Pick a date that differs from the seeded one, or Save never appears.
  const current = await expiry.inputValue();
  let soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  if (soon === current) soon = new Date(Date.now() + 11 * 86_400_000).toISOString().slice(0, 10);
  await expiry.fill(soon);
  await expect(row).toContainText("Expires in");
  await row.getByRole("button", { name: "Save Vehicle insurance" }).click();
  await expect(page.getByText(/Vehicle insurance saved: Expires in/)).toBeVisible();
  await expect(page.getByTestId("doc-vehicle_insurance")).toHaveClass(/doc-expiring/);

  const licence = page.getByTestId("doc-driver_license");
  await licence.getByLabel("Driving licence status").selectOption("rejected");
  await licence.getByLabel("Driving licence note").fill("Photo is cut off");
  await licence.getByRole("button", { name: "Save Driving licence" }).click();
  await confirm(page);
  await expect(page.getByTestId("doc-driver_license")).toHaveClass(/doc-invalid/);
  await page.reload();
  await expect(page.getByTestId("doc-driver_license")).toContainText("Wrong");
  await expect(page.getByTestId("doc-driver_license")).toContainText("Photo is cut off");
  await expect(page.getByText(/missing, wrong or expired. Consider putting the account on hold/)).toBeVisible();
});

test("a driver can be put on hold, messaged and has performance and earnings", async ({ page }) => {
  await signInAs(page);
  await page.goto("/drivers/D0002");
  await page.getByLabel("Reason shown to the driver").fill("Insurance expired");
  await page.getByRole("button", { name: "Put on hold" }).click();
  await page.locator(".modal.open").getByLabel("Type D0002 to confirm").fill("D0002");
  await confirm(page);
  await expect(page.getByText("Driver account is now on hold.")).toBeVisible();

  await page.getByRole("tab", { name: "Messages" }).click();
  await page.getByPlaceholder("Write to Sara Nyström").fill("Please upload the new insurance.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Messages with Sara Nyström")).toContainText("Please upload the new insurance.");

  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(page.getByText("Cancellation rate")).toBeVisible();
  await page.getByRole("tab", { name: "Earnings" }).click();
  await expect(page.locator("#tabpanel-earnings").getByText("Net earnings").first()).toBeVisible();
  await page.getByRole("radio", { name: "Year" }).click();
  await expect(page).toHaveURL(/period=year/);
});

test("a fleet owner's documents are separate from a driver's", async ({ page }) => {
  await signInAs(page);
  await page.goto("/fleets/O4?country=FR&tab=documents");
  const docs = page.getByRole("list", { name: "Fleet owner documents" });
  await expect(docs).toContainText("Operator licence");
  await expect(docs).toContainText("Fleet insurance");
  await expect(docs).not.toContainText("Driving licence");
  await expect(page.getByTestId("doc-fleet_insurance")).toHaveClass(/doc-invalid/);
});

test("drivers show their code and online state, and open on the dashboard map", async ({ page }) => {
  await signInAs(page);
  await page.goto("/drivers");
  await page.getByRole("button", { name: "Online now", exact: true }).click();
  const row = page.locator("tbody tr").first();
  await expect(row).toContainText(/MV-SE-\d{4}/);
  await expect(row).toContainText("Online");
  await expect(row.getByRole("button", { name: /^Call / })).toBeVisible();
  const map = row.getByRole("link", { name: /on the map$/ });
  await map.click();
  await expect(page).toHaveURL(/focus=D\d{4}/);
  await expect(page.getByRole("dialog", { name: /^Driver / })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Driver / })).toContainText(/MV-SE-\d{4}/);
});

test("the message shortcut opens the driver's conversation", async ({ page }) => {
  await signInAs(page);
  await page.goto("/drivers");
  await page.locator("tbody tr").first().getByRole("link", { name: /^Message / }).click();
  await expect(page).toHaveURL(/\/drivers\/D\d{4}\?tab=messages/);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("a driver on a trip shows the trip, route, next pickup and waybill on the map", async ({ page }) => {
  await signInAs(page);
  await page.goto("/?country=SE&focus=D0050");
  const panel = page.getByRole("dialog", { name: "Driver Sara Wallin" });
  await expect(panel).toBeVisible();
  const trip = panel.getByRole("region", { name: "Current trip" });
  await expect(trip).toContainText("Going to drop-off with");
  await expect(trip).toContainText("Pickup");
  await expect(trip).toContainText("Drop-off");
  await expect(trip).toContainText("Next pickup");
  await expect(trip.getByRole("button", { name: "Hide route" })).toBeVisible();
  await trip.getByRole("button", { name: "Hide route" }).click();
  await expect(trip.getByRole("button", { name: "Show route" })).toBeVisible();
  await panel.getByRole("button", { name: "Follow live" }).click();
  await expect(panel.getByRole("button", { name: "Following live" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Open driver" })).toBeVisible();
  await trip.getByRole("button", { name: "Waybill" }).click();
  const waybill = page.getByRole("dialog", { name: /^Waybill WB-SE-/ });
  await expect(waybill).toContainText("Movera Sverige AB");
  await expect(waybill).toContainText("MV-SE-0050");
  await page.keyboard.press("Escape");
  await expect(waybill).toHaveCount(0);
});

test("the driver profile shows the current trip with a link to its route", async ({ page }) => {
  await signInAs(page);
  await page.goto("/drivers/D0002");
  const trip = page.getByRole("region", { name: "Current trip" });
  await expect(trip).toContainText("Going to pickup");
  await trip.getByRole("link", { name: "See route on map" }).click();
  await expect(page).toHaveURL(/focus=D0002/);
  await expect(page.getByRole("dialog", { name: "Driver Sara Nyström" }).getByRole("region", { name: "Current trip" })).toBeVisible();
});

test("riders waiting for a driver can be sent to the nearest driver with the radar", async ({ page }) => {
  await signInAs(page);
  await page.goto("/?country=SE&tab=live");
  const list = page.getByRole("list", { name: "Riders looking for a driver" });
  await expect(list.locator("li").first()).toBeVisible();
  const row = list.locator("li").filter({ has: page.getByRole("button", { name: "Exclusive to nearest", disabled: false }) }).first();
  const rider = (await row.locator(".request-who strong").innerText()).trim();
  await row.getByRole("button", { name: "Exclusive to nearest" }).click();
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(new RegExp(`${rider}'s ride offered to .+ \\(MV-SE-\\d{4}\\)`))).toBeVisible();
  // A real exclusive offer: recorded for every place, and in the rider's offers with its countdown.
  const sentRow = list.locator("li").filter({ hasText: rider }).first();
  await expect(sentRow).toContainText(/Sent to .+ by nora/);
  await sentRow.getByRole("button", { name: `Nearby drivers for ${rider}` }).click();
  await expect(page.getByTestId("assign-panel").getByRole("list", { name: "Offers" })).toContainText("Direct assign (exclusive)");
});

test("a waiting rider opens on the map with assign actions and a link to the rider", async ({ page }) => {
  await signInAs(page);
  await page.goto("/?country=SE&tab=live");
  const first = page.getByRole("list", { name: "Riders looking for a driver" }).locator("li").first();
  await first.getByRole("button", { name: /on the map$/ }).click();
  const panel = page.getByRole("dialog", { name: /^Rider / });
  await expect(panel).toContainText("Looking for a driver");
  await expect(panel.getByRole("group", { name: "Quick actions" }).getByRole("button", { name: "Radar" })).toBeVisible();
  await panel.getByRole("button", { name: "Nearby driver", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Send exclusive offer" })).toBeVisible();
  await panel.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/riders\/R\d{4}/);
});

test("admins choose which categories a driver can drive", async ({ page }) => {
  await signInAs(page);
  await page.goto("/drivers/D0002");
  const premium = page.getByRole("button", { name: /^Premium: off/ });
  await premium.click();
  await page.locator(".modal.open").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Premium turned on for Sara Nyström.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Premium: on/ })).toBeVisible();
  await page.goto("/drivers");
  await expect(page.locator("tbody tr").filter({ hasText: "MV-SE-0002" })).toContainText("Premium");
});
