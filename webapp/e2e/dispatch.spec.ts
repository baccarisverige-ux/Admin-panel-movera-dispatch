import { readFileSync } from "node:fs";
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
  const modal = page.locator(".modal.open").last();
  // Cancel and refund dialogs start with no reason (A-O1): pick the first one when none is chosen.
  const reason = modal.getByLabel("Reason", { exact: true });
  if ((await reason.count()) && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
}

const zone = (page: Page, name: string) => page.getByRole("navigation", { name: "Zones" }).getByRole("button", { name: new RegExp(`^${name}`) });

test("dispatch has its own menu item, a back button, and every zone with its mode", async ({ page }) => {
  await session(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Dispatch" }).click();
  await expect(page).toHaveURL(/\/dispatch\/map$/);
  await page.getByTestId("dispatch-section-tabs").getByRole("link", { name: "Rules" }).click();
  await expect(page.getByRole("heading", { name: "Dispatch rules in Sweden" })).toBeVisible();
  await expect(zone(page, "Norrmalm")).toContainText("Automatic");
  await expect(zone(page, "Arlanda")).toBeVisible();
  await zone(page, "Norrmalm").click();
  await expect(page.getByRole("heading", { name: /Norrmalm/ })).toBeVisible();
  await expect(page.getByTestId("dx-moved-modes")).toBeVisible();
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).not.toHaveURL(/zone=/);
  // Back from Rules returns to the tab it came from: the Live map.
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/dispatch\/map$/);
});

test("change Radar, publish now, see it in history, then undo", async ({ page }) => {
  await session(page);
  await page.goto("/offers?zone=Z001");
  await page.getByLabel("Radar drivers").fill("8");
  const bar = page.getByRole("region", { name: "Publish" });
  await expect(bar).toContainText("1 change not live yet");
  await expect(bar).toContainText("not saved");
  await bar.getByRole("button", { name: "See changes" }).click();
  await expect(page.getByRole("list", { name: "Changes not live yet" })).toContainText("Radar drivers: 5 → 8");
  await page.getByLabel("Publish note").fill("More drivers for Friday");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();
  await expect(bar).toContainText("Everything is live");
  await page.reload();
  await expect(page.getByLabel("Radar drivers")).toHaveValue("8");

  await page.goto("/dispatch?view=history");
  const versions = page.getByRole("list", { name: "Versions" });
  await expect(versions).toContainText("Norrmalm: Radar drivers: 5 → 8");
  await expect(versions).toContainText("More drivers for Friday");
  await versions.getByRole("button", { name: "Undo this version" }).first().click();
  await confirm(page);
  await expect(page.getByText(/undone/)).toBeVisible();
  await page.goto("/offers?zone=Z001");
  await expect(page.getByLabel("Radar drivers")).toHaveValue("5");
});

test("a big change waits for a second admin, who approves it", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z002");
  await page.getByRole("radiogroup", { name: "How the mode is chosen" }).getByText("By hand").click();
  await page.getByRole("radiogroup", { name: "Main mode" }).getByText("Radar").click();
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  await expect(page.getByRole("list", { name: "Changes not live yet" })).toContainText("Needs a second admin");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Waiting for a second admin: Södermalm.")).toBeVisible();
  const approvals = page.getByRole("region", { name: "Waiting for a second admin" });
  await expect(approvals).toContainText("How the mode is chosen: Automatic → By hand");
  await expect(approvals.getByRole("button", { name: "Approve" })).toBeDisabled();

  await page.evaluate(() => localStorage.setItem("movera-admin-session", "lena"));
  await page.reload();
  await page.getByRole("region", { name: "Waiting for a second admin" }).getByRole("button", { name: "Approve" }).click();
  await confirm(page);
  await expect(page.getByRole("region", { name: "Waiting for a second admin" })).toHaveCount(0);
  await expect(zone(page, "Södermalm")).toContainText("Radar");
});

test("save a draft, test a ride with my changes, map full screen and hide", async ({ page }) => {
  test.setTimeout(60_000);
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=best");
  await page.getByLabel("Rating on").uncheck();
  await page.getByRole("region", { name: "Publish" }).getByRole("button", { name: "Save draft" }).click();
  await confirm(page);
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Publish" })).toContainText("saved as a draft");
  await page.getByRole("region", { name: "Publish" }).getByRole("button", { name: "Test it" }).click();
  await expect(page.getByRole("radiogroup", { name: "Rules to test" }).getByRole("radio", { name: "My changes" })).toBeChecked();
  const result = page.getByRole("region", { name: "Test result" });
  await expect(result.getByRole("list", { name: "What happens second by second" })).toContainText("Search stops");
  await expect(result).not.toContainText(/rating \d/);
  await page.getByRole("radiogroup", { name: "Rules to test" }).getByText("Live now").click();
  await expect(result).toContainText(/rating \d/);
  await page.getByLabel("Woman driver only on").check();
  await result.getByRole("button", { name: /Show drivers who cannot take it/ }).click();
  await expect(result.getByRole("list", { name: "Drivers who cannot take it" })).toContainText("woman driver");

  const map = page.getByRole("region", { name: "Test map" });
  await map.getByRole("button", { name: "Full screen" }).click();
  await expect(map).toHaveClass(/full/);
  await map.getByRole("button", { name: "Back" }).click();
  await expect(map).not.toHaveClass(/full/);
  await map.getByRole("button", { name: "Hide map" }).click();
  await expect(map).toContainText("The map is hidden");
  await map.getByRole("button", { name: "Show map" }).click();
  await expect(page.getByTestId("dispatch-test-map")).toBeVisible();
});

test("rider waiting steps: change the message and see it in the rider app", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=waiting");
  await page.getByLabel("Suggest an upgrade message").fill("Comfort is free in 2 min. Switch?");
  const phone = page.getByLabel("Rider waiting preview");
  await phone.getByRole("button", { name: "2 min" }).click();
  await expect(phone.getByLabel("Rider screen")).toContainText("Comfort is free in 2 min. Switch?");
  await page.getByLabel("Busy, try later on").uncheck();
  await expect(phone.getByRole("button", { name: "8 min" })).toHaveCount(0);
  await page.getByLabel("Suggest an upgrade message").fill("");
  await expect(page.getByLabel("Norrmalm rules").getByRole("alert")).toContainText("each step that is on needs a message");
  await expect(page.getByRole("region", { name: "Publish" }).getByRole("button", { name: "Publish now" })).toBeDisabled();
});

test("live: alerts, pause a zone needs approval, send a rider to a radar", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=live");
  await expect(page.getByRole("region", { name: "Alerts" })).toContainText(/waited|free driver/);
  await page.getByRole("button", { name: "Pause Norrmalm" }).click();
  await confirm(page);
  await expect(page.getByText("Pause Norrmalm: waiting for a second admin to approve.")).toBeVisible();
  const list = page.getByRole("list", { name: "Riders waiting" });
  const first = list.getByRole("listitem").first();
  await first.getByRole("button", { name: /Nearby drivers for / }).click();
  const panel = page.getByTestId("assign-panel");
  await expect(panel.getByTestId("assign-exclusive")).toBeVisible();
  // A real radar (like "Send to radar"): no reason to type; it shows in the offers with its countdown.
  await panel.getByTestId("assign-radar").getByRole("button", { name: /^Send radar/ }).click();
  await expect(panel.getByTestId("handled-line")).toContainText(/Sent to radar/);
  await expect(panel.getByRole("list", { name: "Offers" })).toContainText("Radar group 1");
  await page.keyboard.press("Escape");
  await expect(first).toContainText(/Sent to radar/);
  const map = page.getByRole("region", { name: /Live map/ });
  await map.getByRole("button", { name: "Full screen" }).click();
  await page.keyboard.press("Escape");
  await expect(map).not.toHaveClass(/full/);
});

test("cancel checks: the automatic fee decision can be changed by hand", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=cancels");
  const record = page.getByRole("list", { name: "Cancel checks" }).getByRole("listitem").first();
  await expect(record).toContainText("No fee");
  await expect(record).toContainText("inside the free 2 min");
  await expect(record.getByRole("img", { name: /Route from accept to cancel/ })).toBeVisible();
  await record.getByRole("button", { name: /Give the fee to the driver/ }).click();
  await confirm(page);
  await expect(record).toContainText("Changed by nora");
  await expect(record).toContainText("Fee 35 kr");
  await expect(record).toContainText("35 kr fixed");
});

test("events: open the driver bonus builder with the event's area and message", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=events");
  const event = page.getByRole("list", { name: "Events" }).getByRole("listitem").filter({ hasText: "Concert at Friends Arena" });
  await event.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Event name")).toHaveValue("Concert at Friends Arena");
  await page.getByRole("button", { name: "Also make a driver bonus" }).click();
  await expect(page).toHaveURL(/drivers\?view=bonuses/);
  await expect(page.getByLabel("Bonus name")).toHaveValue("Concert at Friends Arena");
  await expect(page.getByLabel("Message to drivers")).toHaveValue(/north gate/);
  await expect(page.getByRole("list", { name: "Bonus areas" }).getByLabel("Area 1 name")).toHaveValue("Concert at Friends Arena");
});

test("test a ride during an event uses the event's rules", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=test&zone=Z007");
  await page.getByLabel("Test time").selectOption({ label: "During Concert at Friends Arena" });
  await expect(page.getByRole("region", { name: "Test result" })).toContainText("Event Concert at Friends Arena: Radar with 12 drivers.");
});

test("a zone's RiderAppConfig and DriverAppConfig download next to the rules file, in minor units", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch");
  await expect(page.getByRole("button", { name: "Rider app config" })).toHaveCount(0);
  await page.goto("/dispatch?zone=Z001");
  const read = async (name: string) => {
    const button = page.getByRole("button", { name });
    await expect(button).toBeEnabled();
    const download = page.waitForEvent("download");
    await button.click();
    const file = await download;
    const path = await file.path();
    return { name: file.suggestedFilename(), doc: JSON.parse(readFileSync(path, "utf8")) };
  };
  const rider = await read("Rider app config");
  expect(rider.name).toMatch(/^movera-rider-app-config-Z001-v\d+\.json$/);
  expect(rider.doc).toMatchObject({ zoneId: "Z001", currency: "SEK", timeZone: "Europe/Stockholm", booking: { maxStops: 3 } });
  expect(rider.doc.cancelFees.live.economy).toEqual({ freeMin: 2, type: "fixed", value: 3500, min: null, max: null });
  expect(rider.doc.catalog.categories.map((item: { id: string }) => item.id)).toContain("economy");
  await expect(page.getByRole("status").filter({ hasText: "RiderAppConfig downloaded for Norrmalm" })).toBeVisible();
  const driver = await read("Driver app config");
  expect(driver.name).toMatch(/^movera-driver-app-config-Z001-v\d+\.json$/);
  expect(driver.doc.waiting).toMatchObject({ noShowAfterMin: 5, driverSharePct: 80, noShowFee: { amountMinor: 6500, currency: "SEK" } });
  expect(driver.doc.offers).toMatchObject({ radarSeconds: 15, exclusiveSeconds: 15 });

  await page.goto("/dispatch?country=TN&zone=TN-TC");
  const tn = await read("Rider app config");
  expect(tn.doc.currency).toBe("TND");
  expect(tn.doc.cancelFees.live.economy.value).toBe(10500);
});

test("rules file, other countries, read-only roles and phones", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Rules file" }).click();
  expect((await download).suggestedFilename()).toMatch(/movera-dispatch-rules-SE-rev\d+\.json/);

  await page.goto("/dispatch?country=FR&zone=FR-PC&tab=rides");
  await expect(page.getByRole("heading", { name: "Dispatch rules in France" })).toBeVisible();
  await expect(page.getByLabel("Live trips Movera fee", { exact: true })).toHaveValue("3.35");

  await page.setViewportSize({ width: 390, height: 860 });
  await page.goto("/dispatch?zone=Z001");
  await expect(page.getByRole("button", { name: "All zones" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
});

test("radar offers in the driver app and going offline automatically", async ({ page }) => {
  await session(page);
  await page.goto("/offers?zone=Z001");
  const tabs = page.getByRole("tablist", { name: "Zone settings" });
  await page.getByLabel("Offers in the popup").fill("3");
  const phone = page.getByLabel("Driver offer preview");
  await expect(phone.getByLabel("3 offers stacked")).toHaveCount(1);
  await expect(phone).toContainText("1 of 3 offers");
  await page.getByLabel("Offers on full-screen radar").fill("10");
  await phone.getByRole("button", { name: "Full screen" }).click();
  await expect(phone.getByLabel("Full-screen radar")).toContainText("10 offers max");
  await expect(phone.getByRole("button", { name: "While driving" })).toHaveCount(0);
  await tabs.getByRole("tab", { name: "Exclusive" }).click();
  await page.getByLabel("Exclusive while driving on").uncheck();
  await phone.getByRole("tab", { name: "Exclusive" }).click();
  await phone.getByRole("button", { name: "While driving" }).click();
  await expect(phone).toContainText("No offers while driving a rider in this zone.");
  await tabs.getByRole("tab", { name: "Radar" }).click();
  await page.getByLabel("Offline after offers not accepted").fill("4");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Offers in the popup: 2 → 3");
  await expect(list).toContainText("Exclusive while driving: on → off");
  await expect(list).toContainText("Offline after offers not accepted: 10 → 4");
  await page.getByLabel("Go offline automatically on").uncheck();
  await expect(page.getByLabel("Offline after offers not accepted")).toBeDisabled();
});

test("reservations: who gets them, the Home popup, Exclusive, Radar trips and a driver cancel", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=reservations");
  const card = page.getByRole("region", { name: "Reservations" });
  await expect(card).toContainText("Two drivers take it at the same time → the first tap wins; exact same moment → the system picks one at random.");
  const steps = card.getByRole("list", { name: "Reservation steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(0)).toContainText("All drivers in the zone");
  await expect(steps.nth(1)).toContainText("+10 min");
  await expect(steps.nth(2)).toContainText("+2 h 40 min");
  await expect(steps.nth(3)).toContainText("Never labelled Exclusive");
  await card.getByLabel("Home popup after booking").fill("15");
  await expect(steps.nth(1)).toContainText("+15 min");
  await card.getByRole("radiogroup", { name: "Scheduled rides go to" }).getByText("Home near pickup").click();
  await expect(card.getByLabel("Home distance from pickup")).toHaveValue("5");
  await expect(steps.nth(0)).toContainText("home is within 5 km of the pickup");
  await expect(steps.nth(0)).toContainText("Still untaken after 30 min: every driver in the zone sees it.");
  await card.getByRole("radiogroup", { name: "Scheduled rides go to" }).getByText("Random group").click();
  await expect(card.getByLabel("Random group size")).toHaveValue("10");
  await expect(steps.nth(0)).toContainText("A random group of 10 drivers");
  await card.getByRole("radiogroup", { name: "Scheduled rides go to" }).getByText("High rating only").click();
  await expect(card.getByLabel("Lowest rating for Scheduled rides")).toHaveValue("4.5");
  await expect(steps.nth(0)).toContainText("Only drivers rated 4.5 or more");
  await card.getByRole("radiogroup", { name: "Sample booking" }).getByText("30 min").click();
  await expect(steps.nth(1)).toContainText("already Exclusive");

  const alert = page.getByLabel("Norrmalm rules").getByRole("alert");
  const bar = page.getByRole("region", { name: "Publish" });
  await card.getByLabel("Radar trips before pickup").fill("25");
  await expect(alert).toContainText("Radar trips must come after Exclusive");
  await expect(bar.getByRole("button", { name: "Publish now" })).toBeDisabled();
  await card.getByLabel("Radar trips before pickup").fill("10");
  await expect(alert).toHaveCount(0);
  await card.getByRole("radiogroup", { name: "After a driver cancels" }).getByText("Exclusive").click();
  await card.getByLabel("Becomes an Exclusive trip on").uncheck();
  await expect(alert).toContainText("cannot become Exclusive");
  await card.getByLabel("Becomes an Exclusive trip on").check();
  await expect(alert).toHaveCount(0);

  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Home popup after booking: 10 → 15");
  await expect(list).toContainText("Scheduled rides go to: all drivers in the zone → drivers with a high rating");
  await expect(list).toContainText("Radar trips before pickup: 15 → 10");
  await expect(list).toContainText("After a driver cancels: by time left → Exclusive");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Reservations" }).getByLabel("Home popup after booking")).toHaveValue("15");
});

test("reservations in one place: a driver group, the Home popup, smart gap, cancels, a fare raise and rides given by Movera", async ({ page }) => {
  test.setTimeout(90_000);
  await session(page);
  await page.goto("/dispatch?zone=Z001");
  await expect(page.getByRole("region", { name: "Reservations" })).toHaveCount(0);
  await page.getByTestId("dx-moved-modes").getByRole("link", { name: "Reservations" }).click();
  await expect(page).toHaveURL(/\/dispatch\/bookings\?/);
  const card = page.getByRole("region", { name: "Reservations" });
  const steps = card.getByRole("list", { name: "Reservation steps" }).getByRole("listitem");

  // Who gets it: one saved group from Events & groups. The Home popup can go wider.
  await card.getByRole("radiogroup", { name: "Scheduled rides go to" }).getByText("A driver group").click();
  await expect(card.getByLabel("Driver group for Scheduled rides")).toHaveValue("G-airport");
  await expect(card).toContainText("The group Airport drivers has no drivers yet");
  await card.getByLabel("Driver group for Scheduled rides").selectOption("G-comfort");
  await expect(steps.nth(0)).toContainText("Only drivers in the group Comfort drivers");
  await expect(steps.nth(1)).toContainText("the same drivers as the list");
  await expect(steps.nth(1)).toContainText("back as an Exclusive");
  await card.getByRole("radiogroup", { name: "Home popup goes to" }).getByText("All drivers in the zone").click();
  await expect(steps.nth(1)).toContainText("every online driver in the zone");
  await card.getByLabel("Closed with ×: comes back as Exclusive if nobody took it on").uncheck();
  await expect(steps.nth(1)).not.toContainText("back as an Exclusive");

  // Smart gap and the times per kind of ride.
  const gap = page.getByRole("region", { name: "Smart gap" });
  await expect(gap.getByLabel("Normal spare minutes")).toHaveValue("15");
  await expect(gap.getByLabel("Smart gap example")).toContainText("08:50");
  await gap.getByLabel("Normal spare minutes").fill("20");
  await expect(gap.getByLabel("Smart gap example")).toContainText("08:55");
  await expect(gap.getByLabel("Airport be online before")).toHaveValue("60");
  await expect(gap.getByLabel("Comfort and Premium be online before")).toHaveValue("45");
  await gap.getByLabel("Airport first reminder").fill("10");
  const alert = page.getByLabel("Norrmalm rules").getByRole("alert");
  await expect(alert).toContainText("Reservations, Airport: the first reminder must come before the second");
  await gap.getByLabel("Airport first reminder").fill("90");
  await expect(alert).toHaveCount(0);

  // Running late: the arrival time is watched from Leave now; an offline driver loses the ride after its own minutes.
  const late = page.getByRole("region", { name: "Running late" });
  await expect(late.getByRole("switch", { name: "Watch arrival time on" })).toBeChecked();
  await expect(late.getByLabel("Minutes late allowed")).toHaveValue("3");
  await expect(late.getByLabel("Check every (seconds)")).toHaveValue("60");
  await expect(late.getByLabel("Offline driver loses the ride after")).toHaveValue("5");
  await expect(late.getByLabel("Running late example")).toContainText("07:44");
  await expect(late.getByLabel("Running late example")).toContainText("Exclusive offer to nearest driver");
  await late.getByLabel("Minutes late allowed").fill("5");
  await expect(late.getByLabel("Running late example")).toContainText("07:46");
  await late.getByRole("radiogroup", { name: "Late ride goes to" }).getByText("Back to dispatch").click();
  await expect(late.getByLabel("Running late example")).toContainText("Back to dispatch");
  await late.getByLabel("Check every (seconds)").fill("10");
  await late.getByLabel("Check every (seconds)").blur();
  await expect(late.getByLabel("Check every (seconds)")).toHaveAttribute("aria-invalid", "true");
  await expect(late.locator(".num-field-error")).toContainText("Min 15");
  await late.getByLabel("Check every (seconds)").fill("90");
  await late.getByLabel("Offline driver loses the ride after").fill("8");

  // Cancels: drivers never pay; riders free until 1 h before.
  const cancels = page.getByRole("region", { name: "Cancels" });
  await expect(cancels).toContainText("Drivers never pay");
  await expect(cancels.getByLabel("Driver late cancel, hours before pickup")).toHaveValue("1");
  await expect(cancels.getByLabel("Late cancels before a pause")).toHaveValue("2");
  // The rider's fees are in Rider cancel fees, on its Reservations tab.
  await cancels.getByRole("button", { name: "Open Rider cancel fees" }).click();
  await expect(page.getByRole("tab", { name: "Rides & stops" })).toHaveAttribute("aria-selected", "true");
  const fees = page.getByRole("region", { name: "Rider cancel fees" });
  await expect(fees.getByRole("tab", { name: "Reservations" })).toHaveAttribute("aria-selected", "true");
  await expect(fees).toContainText("Booked for later (also Exclusive reservations)");
  await expect(fees.getByLabel("Reservations Movera free cancel minutes")).toHaveValue("60");
  await expect(fees.getByLabel("Reservations Premium free cancel minutes")).toHaveValue("120");
  await expect(fees.getByLabel("Reservations Movera fee", { exact: true })).toHaveValue("50");
  await fees.getByLabel("Reservations Movera fee", { exact: true }).fill("75");
  await page.getByTestId("dispatch-tab-bookings").click();
  await page.getByRole("tablist", { name: "Zone settings" }).getByRole("tab", { name: "Reservations" }).click();

  // No driver near pickup: raise from Movera's commission, never over 500 kr.
  const none = page.getByRole("region", { name: "No driver near pickup" });
  await expect(none.getByLabel("Highest fare raise")).toHaveValue("500");
  const trial = none.getByRole("group", { name: "Try a raise" });
  await trial.getByLabel("Sample raise").fill("50");
  await expect(trial.getByRole("status")).toContainText("All from Movera's commission");
  await trial.getByLabel("Sample raise").fill("200");
  await expect(trial.getByRole("status")).toContainText("beyond Movera's commission");
  await none.getByLabel("Highest fare raise").fill("900");
  await none.getByLabel("Highest fare raise").blur();
  // Over the limit stays as typed and is marked, instead of silently becoming 500 (UI-10).
  await expect(none.getByLabel("Highest fare raise")).toHaveValue("900");
  await expect(none.getByLabel("Highest fare raise")).toHaveAttribute("aria-invalid", "true");
  await expect(none.locator(".num-field-error")).toContainText("Max 500");
  await none.getByLabel("Highest fare raise").fill("300");

  await page.getByRole("region", { name: "Movera gives a ride to a driver" }).getByLabel("Time to accept a ride assigned by Movera").fill("90");

  // The driver's phone and the rider's phone follow the settings.
  const phone = page.getByLabel("Driver reservation preview");
  await phone.getByRole("button", { name: "Assigned by Movera" }).click();
  await expect(phone.getByLabel("90 seconds to accept")).toBeVisible();
  await phone.getByRole("button", { name: "Late" }).click();
  await expect(phone.getByLabel("Island")).toContainText("Head to your 07:40 pickup");
  await expect(phone).toContainText("Offline: another driver gets it in 8 min");
  await page.getByRole("tab", { name: "Rider app" }).click();
  await expect(page.getByLabel("Rider reservation preview")).toContainText("Your driver");
  await expect(page.getByLabel("Rider reservation preview")).toContainText("Free cancel until 06:40 · then 75 kr");

  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Scheduled rides go to: all drivers in the zone → a driver group");
  await expect(list).toContainText("Driver group for Scheduled rides: none → G-comfort");
  await expect(list).toContainText("Home popup goes to: same drivers as the list → all drivers in the zone");
  await expect(list).toContainText("Closed popup comes back as Exclusive: on → off");
  await expect(list).toContainText("Normal rides: spare minutes: 15 → 20");
  await expect(list).toContainText("Airport rides: first reminder: 60 → 90");
  await expect(list).toContainText("Reservations, Movera: fee: 50 → 75");
  await expect(list).toContainText("Highest fare raise: 500 → 300");
  await expect(list).toContainText("Time to accept a ride assigned by Movera: 30 → 90");
  await expect(list).toContainText("Minutes late allowed: 3 → 5");
  await expect(list).toContainText("Check arrival every (seconds): 60 → 90");
  await expect(list).toContainText("Late ride goes to: Exclusive offer to nearest driver → back to dispatch");
  await expect(list).toContainText("Offline driver loses the ride after: 5 → 8");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Smart gap" }).getByLabel("Normal spare minutes")).toHaveValue("20");
  await expect(page.getByRole("region", { name: "Reservations" }).getByLabel("Driver group for Scheduled rides")).toHaveValue("G-comfort");
  await expect(page.getByRole("region", { name: "Running late" }).getByLabel("Minutes late allowed")).toHaveValue("5");
});

test("a viewer can look but not change", async ({ page }) => {
  await session(page, "anna");
  await page.goto("/offers?zone=Z001");
  await expect(page.getByText("You can view these rules.")).toBeVisible();
  await expect(page.getByLabel("Radar on", { exact: true })).toBeDisabled();
});

test("offer card details, no Exclusive reasons (G4-E7), rider raise limit (G4-E4), hidden Radar trips and going offline after 1 to 99 offers", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001");
  const phone = page.getByLabel("Driver offer preview");
  const offer = phone.getByLabel("Offer card");
  // v0.18.6 (owner decision 3): the rider's rating with one decimal, no trip count.
  await expect(offer).toContainText("rider rating");
  await expect(offer.getByTestId("preview-rider-rating")).toHaveText("4.8 rider rating");
  const card = page.getByRole("region", { name: "Offer card" });
  await card.getByRole("radiogroup", { name: "Fare on the offer card" }).getByText("Driver's share").click();
  await expect(offer).toContainText("your share");
  await card.getByRole("radiogroup", { name: "Drop-off on the offer card" }).getByText("Area only").click();
  await expect(offer).toContainText("Drop-off area: Vasastan");
  await card.getByLabel("Show rider rating on offers on").uncheck();
  await expect(offer.getByTestId("preview-rider-rating")).toHaveCount(0);
  await card.getByLabel("Pickup address on").uncheck();
  await expect(offer).toContainText("Pickup nearby");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Offer card shows the driver's share: off → on");
  await expect(list).toContainText("Offer card: drop-off area only: off → on");
  await expect(list).toContainText("Show rider rating on offers: on → off");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();

  // v0.18.6 (owner G4-E4 "2×, admin can change"): the rider raise limit per zone, 1× to 3×.
  const raise = page.getByRole("region", { name: "Rider raise limit" });
  await expect(raise.getByLabel("Rider raise limit")).toHaveValue("2");
  await raise.getByLabel("Rider raise limit").fill("3.5");
  await raise.getByLabel("Rider raise limit").blur();
  await expect(raise.getByLabel("Rider raise limit")).toHaveAttribute("aria-invalid", "true");
  await expect(raise.getByText(/^Max 3\b/)).toBeVisible();
  await raise.getByLabel("Rider raise limit").fill("1.5");
  await expect(raise.getByLabel("Rider raise limit")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Norrmalm rules").getByRole("alert")).toHaveCount(0);
  await bar.getByRole("button", { name: "See changes" }).click();
  await expect(list).toContainText("Rider raise limit: 2 → 1.5");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(bar).toContainText("Everything is live");

  // v0.18.6 (owner G4-E7 "Remove short line explain"): no "why you" reasons editor and no reason on the card.
  await page.goto("/offers?zone=Z001&tab=exclusive");
  const tabs = page.getByRole("tablist", { name: "Zone settings" });
  await expect(page.getByRole("region", { name: "Exclusive" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Exclusive reasons" })).toHaveCount(0);
  await phone.getByRole("tab", { name: "Exclusive" }).click();
  await expect(offer).not.toContainText("Best match");
  await expect(offer).not.toContainText("Only for you");
  await phone.getByRole("button", { name: "While driving" }).click();
  await expect(offer).not.toContainText("Finishing nearby");
  await expect(offer).toContainText("you are driving a rider");

  await tabs.getByRole("tab", { name: "Radar" }).click();
  await page.getByLabel("Hidden Radar trip comes back after").fill("5");
  // v0.18.6 (owner G4-E2/E3): the contract's rule text with the zone's limit: hand-sent offers count, Radar does not.
  await expect(page.getByRole("region", { name: "Go offline automatically" })).toContainText("The driver goes offline after 10 missed or declined Exclusive or hand-sent offers in a row (Radar does not count).");
  await page.getByLabel("Offline after offers not accepted").fill("1");
  await expect(page.getByLabel("Norrmalm rules").getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Offline after offers not accepted").fill("150");
  await page.getByLabel("Offline after offers not accepted").blur();
  await expect(page.getByLabel("Offline after offers not accepted")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/^Max 99\b/)).toBeVisible();
  await page.getByLabel("Offline after offers not accepted").fill("99");
  await expect(page.getByLabel("Offline after offers not accepted")).not.toHaveAttribute("aria-invalid", "true");

  await bar.getByRole("button", { name: "See changes" }).click();
  await expect(list).toContainText("Hidden Radar trip comes back after: 2 → 5");
  await expect(list).toContainText("Offline after offers not accepted: 10 → 99");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();
  await page.goto("/dispatch?zone=Z001");
  await expect(page.getByRole("region", { name: "Rider raise limit" }).getByLabel("Rider raise limit")).toHaveValue("1.5");
});

test("waiting at pickup: Pricing's values per category, ride type and distance rules, driver's share, all zones", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=rides");
  const wait = page.getByRole("region", { name: "Waiting at pickup" });
  const pricing = wait.getByRole("group", { name: "Waiting from Pricing" });
  await expect(pricing.getByRole("row").filter({ has: page.getByRole("cell", { name: "Movera", exact: true }) })).toContainText("5 min");
  await expect(pricing.getByRole("link", { name: "Change in Pricing" })).toHaveAttribute("href", /\/pricing\?country=SE&zone=Z001/);
  const examples = wait.getByRole("group", { name: "Waiting examples" }).getByRole("listitem");
  await expect(examples.filter({ hasText: "Normal ride" })).toContainText("5 min free · then 12,26 kr/min · no-show after 5 min · fee 65 kr (driver gets 52 kr)");
  await expect(examples.filter({ hasText: "Scheduled ride" })).toContainText("5 min free");
  await expect(examples.filter({ hasText: "Airport pickup" })).toContainText("15 min free · then 12,26 kr/min · no-show after 20 min");
  await expect(examples.filter({ hasText: "Far pickup" })).toContainText("1 min free · then 12,26 kr/min · no-show after 5 min · fee 85 kr");
  // Q41/Q43: no-show comes at the end of Pricing's free wait (no own setting), and the waiting money is all the driver's.
  await expect(wait.getByRole("textbox", { name: "No-show after", exact: true })).toHaveCount(0);
  await expect(wait.getByTestId("wait-share-fixed")).toContainText("waiting money 100% (fixed)");
  // Q44: the no-show fee share is one rule for the whole country.
  await wait.getByLabel("Driver's share of the no-show fee").fill("100");
  await expect(examples.filter({ hasText: "Normal ride" })).toContainText("(driver gets 65 kr)");
  const far = wait.getByRole("group", { name: "Far pickups" });
  await far.getByText("Price per minute").click();
  await far.getByLabel("Far pickup price per minute").fill("8");
  await expect(examples.filter({ hasText: "Far pickup" })).toContainText("then 8 kr/min");
  await wait.getByLabel("Event pickup rule on").uncheck();
  await expect(examples.filter({ hasText: "Event pickup" })).toContainText("5 min free");
  await wait.getByRole("button", { name: "Use in all zones" }).click();
  await expect(wait.getByRole("status")).toContainText("Copied to 11 zones. Not live yet.");

  const bar = page.getByRole("region", { name: "Publish" });
  await expect(bar).toContainText("Södermalm");
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list.getByRole("listitem").filter({ hasText: "Sweden" }).first()).toContainText("Driver's share of the no-show fee: 80% → 100%");
  await expect(list).toContainText("Far pickup: price per minute: same as the zone → 8");
  await expect(list).toContainText("Event pickup rule: on → off");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText(/Live now: Norrmalm, Södermalm/)).toBeVisible();
  await page.goto("/dispatch?zone=Z002&tab=rides");
  await expect(page.getByRole("region", { name: "Waiting at pickup" }).getByLabel("Driver's share of the no-show fee")).toHaveValue("100");
});

test("cancel reasons per language with Doesn't count, cancel rate limit and driving limit warnings", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?view=reasons");
  await expect(page.getByRole("heading", { name: "Cancel reasons in Sweden" })).toBeVisible();
  const before = page.getByRole("list", { name: "Driver, before the trip reasons" });
  await expect(before.getByLabel("Reason text rider_no_show")).toHaveValue("Rider did not arrive");
  await expect(before.getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("list", { name: "Driver, during the trip reasons" }).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("list", { name: "Driver, scheduled rides reasons" }).getByRole("listitem")).toHaveCount(6);
  const notAtPickup = before.getByRole("listitem").filter({ has: page.getByLabel("Reason text rider_not_at_pickup") });
  await notAtPickup.getByText("Doesn't count").click();

  await page.getByRole("radiogroup", { name: "Language" }).getByText("Swedish").click();
  const scheduled = page.getByRole("list", { name: "Driver, scheduled rides reasons" });
  await expect(scheduled.getByLabel("Reason text scheduled_other")).toHaveAttribute("placeholder", "Other reason");
  await scheduled.getByLabel("Reason text scheduled_other").fill("Annat skäl");
  await page.getByRole("radiogroup", { name: "Language" }).getByText("Arabic").click();
  await expect(scheduled.getByLabel("Reason text scheduled_other")).toHaveAttribute("dir", "rtl");
  await page.getByRole("radiogroup", { name: "Language" }).getByText("English").click();

  const rider = page.getByRole("region", { name: "Rider" });
  await rider.getByRole("button", { name: "Remove Something else" }).click();
  await rider.getByRole("button", { name: "Add a reason" }).click();
  const head = page.getByRole("region", { name: "Cancel reasons in Sweden" });
  await expect(head.getByRole("alert")).toContainText("Cancel reasons, rider: each reason needs an English text.");
  await rider.getByRole("listitem").last().getByRole("textbox").first().fill("Found another ride");
  await expect(head.getByRole("alert")).toHaveCount(0);

  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  const list = page.getByRole("list", { name: "Changes not live yet" });
  await expect(list).toContainText("Cancel reasons, driver, before the trip: “Rider not at pickup” counts → doesn't count");
  await expect(list).toContainText("Cancel reasons, driver, scheduled rides: “Other reason” Swedish text changed");
  await expect(list).toContainText("Cancel reasons, rider: added “Found another ride”");
  await expect(list).toContainText("Cancel reasons, rider: removed “Something else”");
  await bar.getByRole("button", { name: "Publish now" }).click();
  await confirm(page);
  await expect(page.getByText("Live now in Sweden.")).toBeVisible();
  await page.reload();
  await page.getByRole("radiogroup", { name: "Language" }).getByText("Swedish").click();
  await expect(page.getByRole("list", { name: "Driver, scheduled rides reasons" }).getByLabel("Reason text scheduled_other")).toHaveValue("Annat skäl");

  await page.goto("/dispatch?zone=Z001&tab=drivers");
  const rate = page.getByRole("region", { name: "Cancel rate · all of Sweden" });
  await expect(rate.getByLabel("Cancel rate limit")).toHaveValue("30");
  await expect(rate).toContainText("Never shown to drivers");
  await expect(rate).toContainText("Keep your cancel rate low to keep full access to trips");
  const rest = page.getByRole("region", { name: "Rest after long work · all of Sweden" });
  await expect(rest.getByLabel("First driving limit warning")).toHaveValue("30");
  await expect(rest.getByLabel("Second driving limit warning")).toHaveValue("10");
  await expect(rest.getByLabel("Block going online at the limit on")).toBeChecked();
  await rate.getByLabel("Cancel rate limit").fill("25");
  await rest.getByLabel("First driving limit warning").fill("45");
  await bar.getByRole("button", { name: "See changes" }).click();
  await expect(list).toContainText("Cancel rate limit: 30% → 25%");
  await expect(list).toContainText("First driving limit warning: 30 → 45 min");
});

test("documents that expire are warned and blocked, and the driver page explains categories", async ({ page }) => {
  await session(page);
  await page.goto("/onboarding?view=steps");
  const docs = page.getByRole("region", { name: "Documents that expire" });
  await expect(docs.getByLabel("Document warning 1")).toHaveValue("30");
  await expect(docs.getByLabel("Document warning 2")).toHaveValue("7");
  await expect(docs.getByLabel("Document warning 3")).toHaveValue("1");
  await expect(docs.getByLabel("Block at expiry on")).toBeChecked();
  await docs.getByLabel("Document warning 2").fill("40");
  await expect(page.getByText("Document warnings: each warning must come after the one before (fewer days).")).toBeVisible();
  await docs.getByLabel("Document warning 2").fill("14");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("Everything is published")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Documents that expire" }).getByLabel("Document warning 2")).toHaveValue("14");

  await page.goto("/drivers/D0001");
  await expect(page.getByText("can switch some of them off")).toBeVisible();
});

test("rider cancel fees per car type: live trips and reservations, % with min and max, same for all and copy to zones", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=rides");
  const card = page.getByRole("region", { name: "Rider cancel fees" });
  await expect(card.getByRole("tab", { name: "Live trips" })).toHaveAttribute("aria-selected", "true");
  await expect(card).toContainText("Booked now (Radar, Exclusive): free for a few minutes after the driver accepts, then the fee.");
  await expect(page.getByRole("region", { name: "Rider cancels: smart check" })).toContainText("see Rider cancel fees");
  const live = page.getByRole("group", { name: "Live trips cancel fees" });
  // Every car type from Pricing, also the ones without their own row (they start as a copy of Movera).
  for (const name of ["Movera", "Comfort", "Premium", "Priority", "Movera XL", "Electric", "Pet", "Child Seat"]) await expect(live.getByRole("rowheader", { name, exact: true })).toBeVisible();
  await expect(live.getByLabel("Live trips Pet fee", { exact: true })).toHaveValue("35");
  await expect(live.getByLabel("Live trips Comfort fee", { exact: true })).toHaveValue("45");
  await expect(live.getByLabel("Live trips: rider sees")).toContainText("Free cancel for 2 min after the driver accepts · then 45 kr");
  await live.getByRole("radiogroup", { name: "Live trips Comfort fee type" }).getByText("% of price").click();
  await live.getByLabel("Live trips Comfort lowest fee").fill("200");
  await expect(page.getByLabel("Norrmalm rules").getByRole("alert")).toContainText("Rider cancels, Comfort: the lowest fee must not be more than the highest.");
  await live.getByLabel("Live trips Comfort lowest fee").fill("");
  await expect(page.getByLabel("Norrmalm rules").getByRole("alert")).toHaveCount(0);
  await expect(live.getByLabel("Live trips: rider sees")).toContainText("then 37,5 kr (15%, at most 150 kr)"); // X4: 15% of 250 kr, whole öre like the apps (was rounded to 38 kr)
  await live.getByRole("button", { name: "Same for all car types" }).click();
  await live.getByRole("group", { name: /use one car type's rule for all/ }).getByRole("button", { name: "Movera", exact: true }).click();
  await expect(live.getByLabel("Live trips Comfort fee", { exact: true })).toHaveValue("35");
  await expect(live.getByLabel("Live trips Movera XL fee", { exact: true })).toHaveValue("35");
  await live.getByRole("button", { name: "Copy to other zones…" }).click();
  await page.locator(".modal.open").getByText("Södermalm").click();
  await page.locator(".modal.open").getByRole("button", { name: "Copy to 1 zone" }).click();
  await expect(page.getByText("Live trip cancel fees copied from Norrmalm to 1 zone. Not live yet.")).toBeVisible();

  await card.getByRole("tab", { name: "Reservations" }).click();
  const resv = page.getByRole("group", { name: "Reservations cancel fees" });
  await expect(resv.getByLabel("Reservations: rider sees")).toContainText("Free cancel until 12:00 · then 105 kr (25%, between 80 kr and 300 kr)");

  await page.setViewportSize({ width: 390, height: 860 });
  await expect(resv.getByLabel("Reservations Premium highest fee")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
});

test("A-O3: a rider cancel fee moved more than 50% asks Are you sure before it is published", async ({ page }) => {
  await session(page);
  await page.goto("/dispatch?zone=Z001&tab=rides");
  const fee = page.getByLabel("Live trips Movera fee", { exact: true });
  await expect(fee).toHaveValue("35", { timeout: 20_000 });
  await fee.fill("100");
  await page.getByRole("region", { name: "Publish" }).getByRole("button", { name: "Publish now" }).click();
  const modal = page.locator(".modal.open").last();
  await expect(modal.getByTestId("large-change-warning")).toContainText("Are you sure?");
  await expect(modal.getByTestId("large-change-warning")).toContainText("Norrmalm · Rider cancels, Movera: fee 35 → 100 kr (+186%)");
  await expect(modal.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await modal.getByLabel("Yes, I'm sure").check();
  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Live now: Norrmalm.")).toBeVisible();
});
