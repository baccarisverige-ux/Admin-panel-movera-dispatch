import { expect, test, type Page } from "@playwright/test";

async function session(page: Page, agentId = "nora") {
  await page.addInitScript((id) => {
    if (!sessionStorage.getItem("dx-test-session")) {
      localStorage.setItem("movera-admin-session", id);
      sessionStorage.setItem("dx-test-session", "1");
    }
    localStorage.setItem("movera-admin-activity", String(Date.now()));
  }, agentId);
}

async function confirm(page: Page) {
  await page.locator(".modal.open").last().getByRole("button", { name: "Confirm" }).click();
}

const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("a driver's scheduled rides: late cancels, the pause by the rule and an admin choice", async ({ page }) => {
  await session(page);
  await page.goto("/drivers/D0006");
  const card = page.getByRole("region", { name: "Scheduled rides for this driver" });
  const state = card.getByTestId("scheduled-access").getByRole("status").first();
  await expect(state).toHaveText(/Paused until \d{4}-\d{2}-\d{2}: 2 late cancels in 7 days/);
  await expect(card.getByRole("list", { name: "Late cancels in the period" }).getByRole("listitem")).toHaveCount(2);
  await expect(card).toContainText("Rule: 2 late cancels in 7 days pause scheduled rides for 7 days.");
  await expect(card.getByRole("radiogroup", { name: "Scheduled rides for the driver" }).getByRole("radio", { name: "On" })).toBeChecked();
  await card.getByLabel("Days", { exact: true }).fill("3");
  await card.getByRole("button", { name: "Save for Ingrid Lund" }).click();
  await confirm(page);
  await expect(state).toHaveText(`On until ${day(3)}, set by nora. The late-cancel pause is skipped.`);
  await page.reload();
  await expect(state).toContainText(`On until ${day(3)}, set by nora`);
  await expect(card.getByRole("list", { name: "Scheduled rides changes" })).toContainText("Scheduled rides on for 3 days · nora");
  await card.getByRole("button", { name: "Back to the rule" }).click();
  await confirm(page);
  await expect(state).toHaveText(/Paused until/);
});

test("the same scheduled rides control is in Reservations and Dispatch", async ({ page }) => {
  await session(page);
  await page.goto("/reservations");
  const desk = page.getByRole("region", { name: "Drivers' access to scheduled rides" });
  const list = desk.getByRole("list", { name: "Drivers paused or off" });
  await expect(list).toContainText("Ingrid Lund");
  await expect(list).toContainText("2 late cancels in 7 days");
  await desk.getByLabel("Driver for scheduled rides").selectOption("D0002");
  await desk.getByRole("radiogroup", { name: "Scheduled rides for the driver" }).getByText("Off", { exact: true }).click();
  await desk.getByRole("radiogroup", { name: "How long" }).getByText("Until a date").click();
  await desk.getByLabel("Last day").fill(day(-1));
  await expect(desk.getByRole("alert")).toHaveText("The last day must be in the future.");
  await desk.getByLabel("Last day").fill(day(10));
  await desk.getByRole("button", { name: "Save for Sara Nyström" }).click();
  await confirm(page);
  await expect(list.getByRole("listitem").first()).toContainText(`Sara Nyström`);
  await expect(list.getByRole("listitem").first()).toContainText(`Off until ${day(10)}, set by nora`);

  await page.goto("/dispatch?zone=Z001&tab=reservations");
  const same = page.getByRole("region", { name: "Drivers' access to scheduled rides" });
  await expect(same.getByRole("list", { name: "Drivers paused or off" }).getByRole("listitem").first()).toContainText(`Off until ${day(10)}, set by nora`);
  await same.getByRole("list", { name: "Drivers paused or off" }).getByRole("listitem").first().getByRole("link", { name: "Open driver" }).click();
  await expect(page).toHaveURL(/\/drivers\/D0002/);
  await expect(page.getByRole("region", { name: "Scheduled rides for this driver" }).getByTestId("scheduled-access")).toContainText(`Off until ${day(10)}`);
});

test("the trip page shows the offer log and the cash of a cash trip, and the payout takes it off", async ({ page }) => {
  await session(page);
  await page.goto("/trips/T1084?country=FR");
  const log = page.getByRole("list", { name: "Offer log" });
  await expect(log.getByRole("listitem").first()).toContainText("Exclusive");
  await expect(log.getByRole("listitem").first()).toContainText(/no answer in 15 s|said no/);
  await expect(log).toContainText(/Radar\s*Seen by \d+ drivers within \d km/);
  await expect(log).toContainText("tapped first");
  await expect(log).toContainText("No longer available");
  await expect(page.getByTestId("trip-payment")).toContainText("Cash");
  const cash = page.getByTestId("trip-cash");
  await expect(cash).toContainText("Cash collected by driver");
  await expect(cash).toContainText(/Owed to Movera\s*7,50\s€/);
  await expect(cash).toContainText("taken from the driver's next payout");

  await page.goto("/trips/T1012?country=FR");
  const scheduled = page.getByRole("list", { name: "Offer log" }).getByRole("listitem");
  await expect(scheduled.nth(0)).toContainText(/Scheduled rides\s*Shown to \d+ drivers in Scheduled rides/);
  await expect(scheduled.nth(1)).toContainText("Home popup");

  await page.goto("/payouts?country=FR");
  await page.getByRole("cell", { name: "PO-FR-4" }).click();
  const detail = page.getByRole("region", { name: "Line by line" });
  await expect(detail).toContainText("Cash rides: owed to Movera (1 trip)");
  await expect(detail).toContainText(/7,50\s€/);
  await expect(detail).toContainText("trips paid in the app");
});

test("Content › Driver app texts: per language, empty is the default, with a live preview", async ({ page }) => {
  await session(page);
  await page.goto("/content");
  await page.getByRole("tab", { name: "Driver app texts" }).click();
  await expect(page).toHaveURL(/view=driver-texts/);
  await expect(page.getByRole("radiogroup", { name: "Text language" }).getByRole("radio", { name: "Swedish" })).toBeChecked();
  const online = page.getByLabel("Radar online in Swedish", { exact: true });
  await expect(online).toHaveAttribute("placeholder", "Default: Radar online");
  await online.fill("Radar på");
  await expect(page.getByTestId("preview-island")).toHaveText("Radar på");
  const leave = page.getByLabel("Leave now for {time} pickup in Swedish", { exact: true });
  await leave.fill("Åk nu");
  await expect(page.getByRole("alert").filter({ hasText: "Keep {time}. The app fills it in." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save texts" })).toBeDisabled();
  await leave.fill("Åk nu till {time}");
  await expect(page.getByTestId("preview-island")).toHaveText("Åk nu till 07:40");

  await page.getByRole("radiogroup", { name: "Where in the app" }).getByText("Trip buttons").click();
  await page.getByLabel("Collect cash in Swedish", { exact: true }).fill("Ta betalt kontant");
  await expect(page.getByTestId("preview-trip")).toContainText("Ta betalt kontant");
  await page.getByRole("radiogroup", { name: "Text language" }).getByText("Arabic").click();
  const arabic = page.getByLabel("Collect cash in Arabic", { exact: true });
  await expect(arabic).toHaveAttribute("dir", "rtl");
  await expect(arabic).toHaveValue("");
  await arabic.focus();
  await expect(page.getByTestId("preview-trip")).toContainText("Collect cash");

  const pending = page.getByRole("list", { name: "Changes not saved" });
  await expect(pending).toContainText("Swedish · Radar online: default → “Radar på”");
  await expect(pending).toContainText("Swedish · Collect cash: default → “Ta betalt kontant”");
  await page.getByRole("button", { name: "Save texts" }).click();
  await confirm(page);
  await expect(page.getByText("Driver app texts saved: 3 changes.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Radar online in Swedish", { exact: true })).toHaveValue("Radar på");
  await expect(page.getByRole("list", { name: "Driver app text changes" })).toContainText("Swedish · Leave now for {time} pickup: default → “Åk nu till {time}”");
  await expect(page.locator(".dt-file pre")).toContainText("\"island.online\": \"Radar på\"");

  await page.getByRole("button", { name: "Use the default for Radar online" }).click();
  await expect(page.getByLabel("Radar online in Swedish", { exact: true })).toHaveValue("");
  await expect(page.getByTestId("preview-island")).toHaveText("Radar online");
});

test("Messages › Driver notifications: on/off, texts, limits and a demand message with an area", async ({ page }) => {
  await session(page);
  await page.goto("/messages");
  await page.getByRole("tab", { name: "Driver notifications" }).click();
  await expect(page).toHaveURL(/tab=drivers/);
  const ride = page.getByRole("list", { name: "Ride alerts notifications" });
  const exclusive = ride.getByRole("listitem", { name: "Exclusive offer" });
  await expect(exclusive).toContainText("Always goes through");
  await expect(exclusive).toContainText("Exclusive offer · 8 s to accept");
  await exclusive.getByLabel("Exclusive offer on").click();
  await expect(page.getByRole("list", { name: "Account and money notifications" }).getByRole("listitem")).toHaveCount(6);

  const demand = page.getByRole("list", { name: "Demand and events notifications" });
  await demand.getByRole("listitem", { name: "High demand" }).getByRole("button", { name: "Text" }).click();
  const editor = page.getByRole("complementary", { name: "Notification text" });
  await expect(editor.getByRole("radiogroup", { name: "Notification language" }).getByRole("radio", { name: "Swedish" })).toBeChecked();
  await editor.getByLabel("Notification title").fill("Mycket att göra i {area}");
  await expect(editor.getByTestId("notice-preview")).toContainText("Mycket att göra i Stockholm City");
  await expect(editor.getByTestId("notice-island")).toHaveText("High demand · City");
  await editor.getByLabel("Notification text").fill("Kör nu {fare}");
  await expect(page.getByText("High demand: {fare} is not a value here. Use {area}.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save notifications" })).toBeDisabled();
  await editor.getByLabel("Notification text").fill("Gå online nu");

  const limits = page.getByRole("region", { name: "N4 Limits · Sweden" });
  await limits.getByLabel("Promo messages per day").fill("3");
  await expect(limits).toContainText("Ride alerts and reminders always go through");
  const pending = page.getByRole("list", { name: "Notification changes not saved" });
  await expect(pending).toContainText("Exclusive offer: off");
  await expect(pending).toContainText("High demand: Swedish title “Mycket att göra i {area}”");
  await expect(pending).toContainText("SE: promo messages 2 → 3 a day");
  await page.getByRole("button", { name: "Save notifications" }).click();
  await confirm(page);
  await expect(page.getByText("Driver notifications saved: 4 changes.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Ride alerts notifications" }).getByLabel("Exclusive offer on")).not.toBeChecked();

  const send = page.getByRole("region", { name: "Send a demand or event message" });
  await send.getByLabel("Zone for the message").selectOption({ label: "Norrmalm" });
  await send.getByLabel("Area", { exact: true }).selectOption("Stockholm Central Station");
  await expect(send.getByLabel("Message title")).toHaveValue("High demand in Stockholm Central Station");
  await expect(send.getByTestId("notice-area-map")).toBeVisible();
  await expect(send.getByTestId("notice-reach")).toContainText(/Reaches \d+ drivers?: \d+ online, \d+ offline\./);
  await send.getByRole("radiogroup", { name: "Which drivers" }).getByText("Online now").click();
  await expect(send.getByTestId("notice-reach")).toContainText(/, 0 offline\./);
  await send.getByRole("button", { name: /^Send to \d+ drivers/ }).click();
  await confirm(page);
  await expect(page.getByText(/Sent “High demand in Stockholm Central Station” to \d+ drivers/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Sent driver messages" })).toContainText("High demand in Stockholm Central Station · Norrmalm · Stockholm Central Station");
});

test("Safety points to the one cancel rate limit, and document colours follow the country's first warning", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=safety");
  const checks = page.getByRole("region", { name: "Checks before a driver gets a request" });
  await expect(checks.getByTestId("safety-cancel-limit")).toContainText("Over 30%");
  await expect(checks.getByLabel("Highest cancel rate")).toHaveCount(0);
  await expect(checks.getByLabel("Over the cancel rate limit on")).toBeChecked();
  await checks.getByRole("link", { name: "Cancel rate limit for all of Sweden" }).click();
  await expect(page).toHaveURL(/tab=drivers/);
  const rate = page.getByRole("region", { name: "Cancel rate · all of Sweden" });
  await expect(rate.getByLabel("Cancel rate limit")).toHaveValue("30");
  await expect(rate).toContainText("“Over the cancel rate limit” on in Safety");

  await page.goto("/drivers/D0002?tab=documents");
  const licence = page.getByTestId("doc-driver_license");
  await licence.getByLabel("Driving licence status").selectOption("approved");
  await licence.getByLabel("Driving licence expiry date").fill(day(20));
  await expect(licence.locator(".fd-health")).toHaveText("Expires in 20 days");

  await page.goto("/onboarding?view=steps");
  const docs = page.getByRole("region", { name: "Documents that expire" });
  await docs.getByLabel("Document warning 1").fill("14");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("Everything is published")).toBeVisible();

  await page.goto("/drivers/D0002?tab=documents");
  const again = page.getByTestId("doc-driver_license");
  await again.getByLabel("Driving licence status").selectOption("approved");
  await again.getByLabel("Driving licence expiry date").fill(day(20));
  await expect(again.locator(".fd-health")).toHaveText("Approved");
  await again.getByLabel("Driving licence expiry date").fill(day(10));
  await expect(again.locator(".fd-health")).toHaveText("Expires in 10 days");
});
