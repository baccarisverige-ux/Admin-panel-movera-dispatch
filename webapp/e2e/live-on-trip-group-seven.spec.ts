import { expect, test, type Page } from "@playwright/test";
import { ACTIVE_TRIP, ADMIN, COMPLETED_TRIP, RIDERS, RIDE_CHECK_SILENT, fakeSettings, fakeTripServer, signIn, type TripState } from "./live-fake";

/**
 * Driver group 7 "On trip" (contract v0.18.9 §35, Rules decisions/driver-g7.md, admin-fake-by-group.md G7), the admin
 * parts on live against a faked server — every item makes a real server call, none says "Not connected yet.":
 * - Dispatch › Safety: the server's ride check per zone (DriverAppConfig.rideCheck), read and published.
 * - Dispatch › Rides › Stops: route change switches (DriverAppConfig.routeChange incl. owner rule 16 beforePickup and
 *   fixedPriceTrips), max stops (booking.maxStops), free minutes at a stop default 0, the price from Pricing.
 * - Trip page: the ride check and route change of the trip, Flag, notes, Open case (visible or internal), Reveal phone
 *   with a reason; cancel, complete, no-show, reassign, price adjust and waiting go to the server.
 * - Trips list "Flagged only"; Incidents › Ride checks from GET /admin/ride-checks; Change level on a case.
 */

const G7_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene", "trips.annotate", "support.reply", "riders.viewSensitive", "drivers.viewSensitive", "incidents.read", "safety.edit"] };
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

const ON_TRIP = {
  ...ACTIVE_TRIP,
  tripId: "T2007",
  driverId: "D1001",
  driver: COMPLETED_TRIP.driver,
  rideCheck: { checkId: "srv_off_route_1", trigger: "off_route", askedAt: "2026-10-26T09:20:00Z", answerBy: "2026-10-26T09:22:00Z", answers: { rider: "ok" }, alertedAt: "2026-10-26T09:22:00Z" },
  routeChange: { changeId: "rtc_1", routeQuoteId: "rtq_1", status: "pending", dropoff: { address: "Brommaplan", lat: 59.3383, lng: 17.9393 }, stops: [], total: SEK(31000), difference: SEK(8000), askedAt: "2026-10-26T09:21:00Z", answerBy: "2026-10-26T09:22:00Z", driverEarnings: SEK(24800), earningsDifference: SEK(6400) },
};

async function open(page: Page, path: string, init: Partial<TripState> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { admin: G7_ADMIN, trips: [structuredClone(ON_TRIP), { ...COMPLETED_TRIP }] as never, riders: [{ ...RIDERS[0] }, { ...RIDERS[1] }], ...init });
  const settings = await fakeSettings(page);
  await signIn(page, "Dashboard");
  await page.goto(path);
  return { state, settings };
}

const posted = (state: TripState, suffix: string) => state.calls.find((call) => call.method === "POST" && call.path.endsWith(suffix));

async function publishDispatch(page: Page) {
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  await bar.getByRole("button", { name: "Publish now" }).click();
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^Reason$/);
  if ((await reason.count()) && (await reason.evaluate((node) => node.tagName)) === "SELECT" && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
}

test("Dispatch › Safety: the server's ride check is read from the zone's driver document and published back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: G7_ADMIN });
  const settings = await fakeSettings(page);
  const driver = settings.docs.get("driver_app_config:Z002")!;
  settings.docs.set("driver_app_config:Z002", { ...driver, document: { ...driver.document, rideCheck: { ...(driver.document["rideCheck"] as object), on: true, stopMinutes: 3, offRouteKm: 2, endFarMeters: 600, noAnswerSeconds: 120, repeatMinutes: 10, noAnswerAlarm: false } } });
  await signIn(page, "Dashboard");
  await page.goto("/dispatch?zone=Z002&tab=safety");
  const card = page.getByRole("region", { name: "Ride check" });
  await expect(card.getByLabel("Long stop", { exact: true })).toHaveValue("3");
  await expect(card.getByLabel("Off the route from", { exact: true })).toHaveValue("2");
  await expect(card.getByLabel("Ended far from the drop-off", { exact: true })).toHaveValue("600");
  await expect(card.getByLabel("Time to answer", { exact: true })).toHaveValue("120");
  await card.getByLabel("Time to answer", { exact: true }).fill("90");
  await card.getByLabel("No answer rings the alarm on").check();
  await publishDispatch(page);
  await expect.poll(() => settings.sent.some((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")).toBe(true);
  const put = settings.sent.find((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")!;
  const doc = put.body!["document"] as Record<string, Record<string, unknown>>;
  expect(doc["rideCheck"]).toMatchObject({ on: true, stopMinutes: 3, offRouteKm: 2, endFarMeters: 600, noAnswerSeconds: 90, repeatMinutes: 10, noAnswerAlarm: true });
  await expect(page.getByText("Not connected yet")).toHaveCount(0);
});

test("Dispatch › Rides › Stops: route change switches, max stops and free minutes (default 0) go to the driver document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: G7_ADMIN });
  const settings = await fakeSettings(page);
  await signIn(page, "Dashboard");
  await page.goto("/dispatch?zone=Z002&tab=rides");
  const stops = page.getByRole("region", { name: "Stops" });
  await expect(stops.getByLabel("Driver's time to answer", { exact: true })).toHaveValue("60");
  await expect(stops.getByLabel("Also before pickup on")).toBeChecked();
  await expect(stops.getByRole("radio", { name: "Cannot change" })).toBeChecked();
  // G7 live fix: the amount from Pricing (stopWaitPerMin per car type), still a link to Pricing.
  await expect(stops.getByTestId("stop-price-link")).toHaveText("Price per minute: 5 kr – 9 kr");
  await expect(stops.getByTestId("stop-price-link")).toHaveAttribute("href", "/pricing");
  await stops.getByLabel("Also before pickup on").uncheck();
  await stops.getByRole("radio", { name: "Change at the normal price" }).check();
  await stops.getByLabel("Driver's time to answer", { exact: true }).fill("45");
  await stops.getByLabel("Max stops", { exact: true }).fill("2");
  await publishDispatch(page);
  await expect.poll(() => settings.sent.some((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")).toBe(true);
  const put = settings.sent.find((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")!;
  const doc = put.body!["document"] as Record<string, Record<string, unknown>>;
  expect(doc["routeChange"]).toEqual({ on: true, driverCanRefuse: true, answerSeconds: 45, beforePickup: false, fixedPriceTrips: "switch_to_normal" });
  expect(doc["booking"]["maxStops"]).toBe(2);
});

test("trip page: ride check and route change of the trip; Flag, notes, Open case and Reveal phone are server calls", async ({ page }) => {
  const { state } = await open(page, "/trips/T2007");
  const tools = page.getByTestId("live-trip-tools");
  await expect(tools.getByTestId("trip-ride-check")).toContainText("The car is far from the planned route.");
  await expect(tools.getByTestId("trip-ride-check")).toContainText("No answer in time: the safety team was alerted.");
  await expect(tools.getByTestId("trip-route-change")).toContainText("Waiting for the driver");
  await expect(tools.getByTestId("trip-route-change")).toContainText("Brommaplan");

  await tools.getByLabel("Why flag").fill("Long detour");
  await tools.getByRole("button", { name: "Flag trip" }).click();
  await expect.poll(() => posted(state, "/admin/trips/T2007/flag")?.body).toEqual({ flagged: true, reason: "Long detour" });
  await expect(tools.getByRole("button", { name: "Remove flag" })).toBeVisible();

  await tools.getByLabel("Trip note").fill("Rider called about the detour");
  await tools.getByRole("button", { name: "Save note" }).click();
  await expect(tools.getByRole("list", { name: "Notes on this trip" })).toContainText("Rider called about the detour");

  await tools.getByLabel("Case about", { exact: true }).selectOption("driver");
  await tools.getByLabel("Case category").selectOption("safety");
  await tools.getByLabel("Case subject").fill("About the detour");
  await tools.getByLabel("What is the case about").fill("Please tell us what happened.");
  await tools.getByLabel("The person sees this case in their app").check();
  await tools.getByRole("button", { name: "Open case" }).click();
  await expect.poll(() => posted(state, "/admin/trips/T2007/case")?.body).toEqual({ about: "driver", category: "safety", subject: "About the detour", text: "Please tell us what happened.", visibleToPerson: true });
  await expect(tools.getByTestId("live-trip-tools-notice")).toContainText("Case tkt_1 opened.");

  await expect(tools.getByRole("button", { name: "Show number" })).toBeDisabled();
  await tools.getByLabel("Whose number").selectOption("driver");
  await tools.getByLabel("Why do you need the number").fill("Driver not answering in the app");
  await tools.getByRole("button", { name: "Show number" }).click();
  await expect(tools.getByTestId("trip-revealed-phone")).toContainText("+46701110001");
  expect(posted(state, "/admin/trips/T2007/reveal-contact")?.body).toEqual({ who: "driver", reason: "Driver not answering in the app" });
  for (const id of ["live-trip-tools", "trip-actions"]) await expect(page.getByTestId(id)).not.toContainText("Not connected yet");
});

test("trip page: price adjust, waiting and complete go to the server with the trip's version", async ({ page }) => {
  const { state } = await open(page, "/trips/T2007");
  const confirm = async () => {
    const modal = page.locator(".modal.open").last();
    const reason = modal.getByLabel(/Reason/).first();
    if (await reason.count()) {
      if ((await reason.evaluate((node) => node.tagName)) === "SELECT") await reason.selectOption({ index: 1 });
      else await reason.fill("Checked with the rider");
    }
    const typed = modal.getByLabel(/^Type T2007 to confirm$/);
    if (await typed.count()) await typed.fill("T2007");
    await modal.getByRole("button", { name: "Confirm" }).click();
  };
  await page.getByLabel("Fare adjustment percent").fill("-10");
  await page.getByRole("button", { name: "Apply fare adjustment" }).click();
  await confirm();
  await expect.poll(() => posted(state, "/admin/trips/T2007/adjust")?.body).toMatchObject({ expectedVersion: 3, fare: { amountMinor: 20700, currency: "SEK" } });
  state.calls.length = 0;
  await page.getByLabel("Waiting minutes").fill("4");
  await page.getByRole("button", { name: "Save waiting time" }).click();
  await confirm();
  await expect.poll(() => posted(state, "/admin/trips/T2007/adjust")?.body).toMatchObject({ expectedVersion: 4, waitingSeconds: 240 });
  await expect(page.getByRole("button", { name: "Complete trip" })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole("button", { name: "Complete trip" }).click();
  await confirm();
  await expect.poll(() => posted(state, "/admin/trips/T2007/complete")?.body).toMatchObject({ expectedVersion: 5 });
  expect(String((posted(state, "/admin/trips/T2007/complete")!.body as Record<string, unknown>)["note"])).not.toBe("");
  for (const id of ["live-trip-tools", "trip-actions"]) await expect(page.getByTestId(id)).not.toContainText("Not connected yet");
});

test("Trips list: Flagged only asks the server for flagged trips", async ({ page }) => {
  const flagged = { ...structuredClone(ON_TRIP), adminFlag: { flagged: true, reason: "Long detour", by: "A1", at: "2026-10-26T10:00:00Z" } };
  const { state } = await open(page, "/trips", { trips: [flagged, { ...COMPLETED_TRIP }] as never });
  await page.getByTestId("live-list-trips").getByLabel("Flagged only").check();
  await expect.poll(() => state.calls.some((call) => call.method === "GET" && call.path.startsWith("/api/v1/admin/trips?") && call.path.includes("flagged=true"))).toBe(true);
  await expect(page.getByText("T2001")).toHaveCount(0);
});

test("Incidents › Ride checks come from the server with both answers; Change level is sent to the server", async ({ page }) => {
  const rideChecks = [
    { tripId: "T2007", zoneId: "Z001", checkId: "srv_off_route_1", side: "rider", trigger: "off_route", origin: "server", shownAt: "2026-10-26T09:20:00Z", answer: "ok", answeredAt: "2026-10-26T09:20:30Z", createdAt: "2026-10-26T09:20:00Z" },
    { tripId: "T2007", zoneId: "Z001", checkId: "srv_off_route_1", side: "driver", trigger: "off_route", origin: "server", shownAt: "2026-10-26T09:20:00Z", answer: "no_answer", incidentId: "inc_4", createdAt: "2026-10-26T09:20:00Z" },
  ];
  const silent = { ...RIDE_CHECK_SILENT, severity: "high" };
  const { state } = await open(page, "/incidents?view=ridechecks", { rideChecks, incidents: [silent] as never });
  await expect.poll(() => state.calls.some((call) => call.path.startsWith("/api/v1/admin/ride-checks"))).toBe(true);
  await expect(page.getByRole("link", { name: "T2007" }).first()).toBeVisible();
  await page.goto("/incidents?case=inc_4");
  const view = page.getByRole("article", { name: "Case inc_4" });
  await view.getByRole("radiogroup", { name: "Case level" }).getByText("Low").click();
  await view.getByRole("button", { name: "Change level" }).click();
  const modal = page.locator(".modal.open").last();
  if (await modal.count()) await modal.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => posted(state, "/admin/incidents/inc_4/level")?.body).toMatchObject({ expectedVersion: 1, severity: "low" });
});

test("trip page in French: the trip tools have no English", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { ...G7_ADMIN, language: "fr" }, trips: [structuredClone(ON_TRIP)] as never, riders: [{ ...RIDERS[1] }] });
  await fakeSettings(page);
  await signIn(page, "Tableau de bord");
  await page.goto("/trips/T2007");
  const tools = page.getByTestId("live-trip-tools");
  await expect(tools).toContainText("La voiture est loin de l’itinéraire prévu.");
  await expect(tools).toContainText("Ouvrir un dossier");
  await expect(tools).toContainText("Afficher le téléphone");
  await expect(tools).not.toContainText("Open case");
  await expect(tools).not.toContainText("Reveal phone");
});
