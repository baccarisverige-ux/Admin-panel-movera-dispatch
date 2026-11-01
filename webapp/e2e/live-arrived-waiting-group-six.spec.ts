import { expect, test, type Page } from "@playwright/test";
import { ADMIN, CANCELLED_TRIP, COMPLETED_TRIP, RIDERS, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * Driver group 6 "Arrived and waiting" (contract v0.18.8, Rules decisions/driver-g6.md), the admin parts on live
 * against a faked server:
 * - Dispatch › Safety "Rider PIN before Start" (DriverAppConfig.pickupPin, default off) and the stop free wait
 *   (waiting.stopFreeWaitMin) are read from and published to the zone's driver document.
 * - Trip page: paid waiting minutes, the applied rule, the rider PIN for admins, "Reverse no-show" with a required
 *   reason and the "take back the driver's share" tick (default off), sent with an Idempotency-Key.
 * - Trips list: the paid waiting minutes are the server's waiting.paidMinutes.
 * - Content › Legal: an older admin text without {waitingRules} gets paragraphs 3.1–3.5.
 */

const G6_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene"] };
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

/** Anna waited 23 min at Arlanda (airport rule: 15 min free, no-show after 20); Omar never came. Paid 3 min (rounded up). */
const NO_SHOW = {
  ...CANCELLED_TRIP, tripId: "T2006", status: "no_show", version: 6, riderId: "R502", driverId: "D1001", vehicleId: "V1", driver: COMPLETED_TRIP.driver,
  acceptedAt: "2026-10-26T07:01:00Z", fare: SEK(8500), fareLines: [{ code: "no_show_fee", amount: SEK(8500) }], paymentMethod: "card", paymentStatus: "paid",
  pinRequired: true, pickupPin: "0427", pinVerified: false, pinAttempts: 2,
  waiting: { arrivedAt: "2026-10-26T07:05:00Z", freeUntil: "2026-10-26T07:20:00Z", noShowAt: "2026-10-26T07:25:00Z", chargedSeconds: 130, paidMinutes: 3, rules: ["airport"], freeWaitMin: 15, noShowAfterMin: 20, noShowFee: SEK(8500), noShowDriverShare: SEK(6800) },
  cancellation: { actor: "driver", reasonCode: "no_show", at: "2026-10-26T07:28:00Z", fee: SEK(8500), feeStatus: "paid", feeKind: "no_show", driverShare: SEK(6800) },
};

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { admin: G6_ADMIN, trips: [{ ...COMPLETED_TRIP }, structuredClone(NO_SHOW)] as never, riders: [{ ...RIDERS[0] }, { ...RIDERS[1] }] });
  const settings = await fakeSettings(page);
  await signIn(page, "Dashboard");
  await page.goto(path);
  return { state, settings };
}

test("PIN switch + stop free wait: read from the driver document, off by default, published back with the contract's bounds", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: G6_ADMIN });
  const settings = await fakeSettings(page);
  const driver = settings.docs.get("driver_app_config:Z002")!;
  settings.docs.set("driver_app_config:Z002", { ...driver, document: { ...driver.document, waiting: { ...(driver.document["waiting"] as object), stopFreeWaitMin: 4 } } });
  await signIn(page, "Dashboard");
  await page.goto("/dispatch?zone=Z002&tab=rides");
  await expect(page.getByRole("region", { name: "Stops" }).getByLabel("Free wait per stop")).toHaveValue("4");
  await page.goto("/dispatch?zone=Z002&tab=safety");
  const card = page.getByRole("region", { name: "Rider PIN before Start" });
  await expect(card).toContainText("The driver must enter the rider’s 4-digit code before the trip starts.");
  await expect(card.getByTestId("pickup-pin-compat")).toContainText("only when the driver app with the PIN step is live");
  const toggle = card.getByLabel("Rider PIN before Start on");
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  const tries = card.getByLabel("Wrong tries before lock");
  await expect(tries).toHaveValue("5");
  await expect(tries).toHaveAttribute("max", "10");
  await tries.fill("3");
  await expect(card.getByLabel("Lock minutes")).toHaveValue("5");
  const bar = page.getByRole("region", { name: "Publish" });
  await bar.getByRole("button", { name: "See changes" }).click();
  await expect(page.getByRole("list", { name: "Changes not live yet" })).toContainText("Rider PIN before Start");
  await bar.getByRole("button", { name: "Publish now" }).click();
  const modal = page.locator(".modal.open").last();
  const reason = modal.getByLabel(/^Reason$/);
  if ((await reason.count()) && (await reason.evaluate((node) => node.tagName)) === "SELECT" && (await reason.inputValue()) === "") await reason.selectOption({ index: 1 });
  await modal.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => settings.sent.some((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")).toBe(true);
  const put = settings.sent.find((s) => s.method === "PUT" && s.path.endsWith("/admin/config/driver_app_config") && s.body!["zoneId"] === "Z002")!;
  const doc = put.body!["document"] as Record<string, Record<string, unknown>>;
  expect(doc["pickupPin"]).toEqual({ required: true, maxAttempts: 3, lockMinutes: 5 });
  expect(doc["waiting"]["stopFreeWaitMin"]).toBe(4);
});

test("trip page: paid waiting minutes, the airport rule, the PIN for admins; Reverse no-show needs a reason, sends the tick and an Idempotency-Key, and shows the result", async ({ page }) => {
  const { state } = await open(page, "/trips/T2006");
  const waiting = page.getByTestId("trip-waiting-facts");
  await expect(waiting.getByTestId("trip-paid-minutes")).toHaveText("3 min");
  await expect(waiting.getByTestId("trip-waiting-rules")).toHaveText("Airport pickup");
  await expect(waiting).toContainText("15 min · 20 min");
  const pin = page.getByTestId("trip-pin-box");
  await expect(page.getByTestId("trip-pin")).toContainText("PIN verified Not yet");
  await expect(pin.getByTestId("trip-pin-code")).toHaveText("0427");
  await expect(pin).toContainText("Not yet");
  await expect(pin).toContainText("Wrong tries2");
  await page.getByRole("button", { name: "Reverse no-show" }).click();
  const dialog = page.getByTestId("reverse-no-show-dialog");
  await expect(dialog.getByTestId("reverse-take-back")).not.toBeChecked();
  await expect(dialog).toContainText("The driver keeps his share");
  await expect(dialog.getByRole("button", { name: "Confirm" })).toBeDisabled();
  await dialog.getByLabel("Reason (required)").fill("Rider waited at the other terminal door");
  await dialog.getByTestId("reverse-take-back").check();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => state.calls.some((call) => call.method === "POST" && call.path.endsWith("/admin/trips/T2006/reverse-no-show"))).toBe(true);
  const call = state.calls.find((item) => item.method === "POST" && item.path.endsWith("/admin/trips/T2006/reverse-no-show"))!;
  expect(call.body).toEqual({ expectedVersion: 6, reason: "Rider waited at the other terminal door", takeBackDriverShare: true });
  expect(call.headers["idempotency-key"]).toBeTruthy();
  await expect(page.getByRole("status").first()).toContainText("No-show reversed");
  await page.reload();
  await expect(page.getByTestId("trip-no-show-reversal")).toContainText("Rider waited at the other terminal door");
  await expect(page.getByTestId("trip-no-show-reversal")).toContainText("driver's share taken back");
  await expect(page.getByTestId("trip-fee-status")).toContainText(/refunded/i);
  await expect(page.getByRole("button", { name: "Reverse no-show" })).toHaveCount(0);
  for (const id of ["trip-waiting-facts", "trip-pin-box", "trip-cancel-fee"]) await expect(page.getByTestId(id)).not.toContainText("Not connected yet");
});

test("trip page in French: the waiting box, the PIN and the dialog have no English and no raw codes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { ...G6_ADMIN, language: "fr" }, trips: [structuredClone(NO_SHOW)] as never, riders: [{ ...RIDERS[1] }] });
  await fakeSettings(page);
  await signIn(page, "Tableau de bord");
  await page.goto("/trips/T2006");
  const waiting = page.getByTestId("trip-waiting-facts");
  await expect(waiting).toContainText("Attente payante");
  await expect(waiting.getByTestId("trip-waiting-rules")).toHaveText("Prise en charge à l’aéroport");
  await expect(page.getByTestId("trip-pin-box")).toContainText("Code PIN du passager");
  await page.getByRole("button", { name: "Annuler le client absent" }).click();
  const dialog = page.getByTestId("reverse-no-show-dialog");
  await expect(dialog).toContainText("Reprendre la part du chauffeur");
  await expect(dialog).toContainText("Motif (obligatoire)");
  await expect(dialog).not.toContainText("driver");
});

test("Trips list: the paid waiting column is the server's waiting.paidMinutes, '–' without waiting", async ({ page }) => {
  await open(page, "/trips");
  await expect(page.getByRole("columnheader", { name: "Paid waiting" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "T2006" });
  await expect(row).toContainText("3 min");
  const other = page.getByRole("row").filter({ hasText: "T2001" });
  await expect(other).toContainText("–");
});

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "*" };
const OLD_TERMS = (lang: string) => `Terms ${lang}\n\n3. Price and payment.\n\n4. Behaviour. Be kind.`;
const LEGAL_V2 = {
  country: "SE", version: 2, source: "admin", publishedAt: "2026-10-30T10:00:00Z", publishedBy: "A1", reaccept: false, company: {},
  terms: { title: { sv: "Villkor", fr: "Conditions", en: "Terms" }, text: { sv: OLD_TERMS("sv"), fr: OLD_TERMS("fr"), en: OLD_TERMS("en") } },
  privacy: { title: { sv: "Integritet", fr: "Confidentialité", en: "Privacy" }, text: { sv: "p", fr: "p", en: "p" } },
};

test("Content › Legal: an admin text from before v0.18.8 is told it lacks 3.1–3.5; the button adds them before paragraph 4 and they are published", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { permissions: ["overview.read", "settings.read", "settings.edit", "settings.publish", "zones.read"] } });
  const sent: Record<string, unknown>[] = [];
  await page.route(/\/api\/v1\/admin\/legal\/(SE|FR)(\/publish)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (request.method() === "GET") return reply({ live: LEGAL_V2, history: [LEGAL_V2] });
    const body = request.postDataJSON() as Record<string, unknown>;
    sent.push(body);
    return reply({ ...LEGAL_V2, ...body, version: 3 });
  });
  await signIn(page, "Dashboard");
  await page.goto("/content?view=legal");
  const editor = page.getByTestId("legal-editor");
  await expect(editor.getByTestId("legal-waiting-help")).toContainText("{waitingRules}");
  await expect(editor.getByTestId("legal-waiting-missing")).toBeVisible();
  await editor.getByRole("button", { name: "Add paragraphs 3.1–3.5" }).click();
  await expect(editor.getByTestId("legal-waiting-missing")).toHaveCount(0);
  await editor.getByTestId("legal-language").getByRole("button", { name: "English" }).click();
  const text = await editor.getByLabel("Terms of use text (English)").inputValue();
  expect(text).toMatch(/3\. Price and payment\.\n\n3\.1 Waiting at pickup\.[\s\S]*3\.5 The rules in your area now:\n\{waitingRules\}\n\n4\. Behaviour/);
  await editor.getByRole("button", { name: "Publish for Sweden" }).click();
  await page.locator(".modal.open").last().getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  const terms = sent[0]!["terms"] as { text: Record<string, string> };
  for (const language of ["sv", "fr", "en"]) expect(terms.text[language]).toContain("{waitingRules}");
  expect(terms.text["sv"]).toContain("3.1 ");
});
