import { expect, test, type Page } from "@playwright/test";
import { ADMIN, COMPLETED_TRIP, PAYOUTS, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * BQ-M24 / BQ-M22 admin part (contract v0.18.92 moneyBase.commissionRow.admin, moneyBase.lostDriverPaid,
 * priceDisplay.payoutSummary): the trip page's "Movera commission" rows show the server's moveraKeepsNow (never
 * commission, never worked out), "Paid to the driver who lost the trip" from lostDriverPaid, no "no money split" note on
 * an unpaid trip; the payout list, page and run card show the 2 lines of Payout.summary. Screenshots (en + sv, scale 2)
 * go to SHOTS.
 */
const SHOTS = process.env.SHOTS;
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });
test.use({ deviceScaleFactor: 2 });
test.setTimeout(120_000);

// contract moneyBase.lostDriverPaid.example: fare 200,00 kr, driver A lost it with 30,00 kr, driver B gets 150,00 kr.
const REASSIGNED = {
  ...COMPLETED_TRIP, tripId: "T2401", fare: SEK(20000), fareLines: [{ code: "base", amount: SEK(20000) }], driverEarnings: SEK(15000), commission: SEK(5000),
  driverTotal: SEK(15000), earningsBreakdown: [{ code: "trip", amount: SEK(15000) }],
  moneySplit: { riderPaid: SEK(20000), driverTotal: SEK(15000), movera: SEK(2000), debtCollected: SEK(0), lostDriverPaid: SEK(3000), refunded: SEK(0) },
  moveraKeepsNow: SEK(2000), lostDriverPaid: SEK(3000),
};
// An admin cancel with 30,00 kr paid to the lost driver: no moneySplit; the server's row = 0 − 30,00 kr.
const CANCELLED = {
  ...COMPLETED_TRIP, tripId: "T2402", status: "cancelled_by_admin", paymentStatus: "authorized", fare: SEK(20000), commission: SEK(0), driverEarnings: SEK(0),
  moveraKeepsNow: SEK(-3000), lostDriverPaid: SEK(3000), cancellation: { actor: "admin", reasonCode: "admin_cancel", at: "2026-10-25T08:20:00Z" },
};
const WITH_SUMMARY = [
  { ...PAYOUTS[0]!, status: "pending_approval", summary: { driverGets: SEK(43500), moveraGets: SEK(9850) } },
  { ...PAYOUTS[0]!, payoutId: "PY2", driverId: "D1002", driverName: "Omar Said", status: "pending_approval", amount: SEK(41600), summary: { driverGets: SEK(41600), moveraGets: SEK(10400) } },
];
const PERMS = [...ADMIN.permissions, "finance.edit", "settings.read"];

async function open(page: Page, language: "en" | "sv", path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { language, permissions: PERMS }, trips: [REASSIGNED, CANCELLED] as never, payouts: structuredClone(WITH_SUMMARY) as never });
  await fakeSettings(page);
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  await page.goto(path);
}
const shot = async (page: Page, name: string, testId: string) => {
  if (!SHOTS) return;
  // Page coordinates from the top, so the sticky top bar never covers the card.
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.getByTestId(testId).first().boundingBox();
  if (box) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, clip: box });
};

for (const language of ["en", "sv"] as const) {
  const t = language === "sv"
    ? { commission: "Moveras provision", lost: "Betalt till föraren som förlorade resan", driverGets: "Föraren får", moveraGets: "Movera får", notConnected: "Inte ansluten än" }
    : { commission: "Movera commission", lost: "Paid to the driver who lost the trip", driverGets: "Driver gets", moveraGets: "Movera gets", notConnected: "Not connected yet" };

  test(`${language}: paid reassigned trip — Movera commission 20,00 kr (moveraKeepsNow), lost-driver line 30,00 kr`, async ({ page }) => {
    await open(page, language, "/trips/T2401");
    const box = page.getByTestId("trip-who-gets-what");
    await expect(box.getByTestId("trip-movera-commission")).toContainText(t.commission);
    await expect(box.getByTestId("trip-movera-commission")).toContainText("20,00 kr");
    await expect(box.getByTestId("trip-lost-driver-line")).toContainText(t.lost);
    await expect(box.getByTestId("trip-lost-driver-line")).toContainText("30,00 kr");
    await expect(page.getByTestId("trip-split-live").getByTestId("split-commission")).toContainText("20,00 kr");
    await expect(page.getByTestId("trip-split-live").getByTestId("split-lost-driver")).toContainText("30,00 kr");
    await shot(page, `admin-trip-money-paid-${language}`, "trip-who-gets-what");
    await shot(page, `admin-trip-split-paid-${language}`, "trip-split-live");
  });

  test(`${language}: cancelled trip — no 'no money split' note, the row is the server's −30,00 kr`, async ({ page }) => {
    await open(page, language, "/trips/T2402");
    const box = page.getByTestId("trip-who-gets-what");
    await expect(box.getByTestId("trip-movera-commission")).toContainText("30,00 kr");
    await expect(box).not.toContainText("The server sends no money split");
    await expect(box).not.toContainText("Servern skickar ingen pengafördelning");
    await expect(box.getByTestId("trip-lost-driver-line")).toContainText("30,00 kr");
    await shot(page, `admin-trip-money-cancelled-${language}`, "trip-who-gets-what");
  });

  test(`${language}: payout list, page and run card — 2 lines Driver gets / Movera gets from Payout.summary`, async ({ page }) => {
    await open(page, language, "/payouts");
    const detail = page.getByTestId("live-payout-summary");
    await expect(detail.locator('[data-line="driverGets"]')).toContainText(t.driverGets);
    await expect(detail.locator('[data-line="driverGets"]')).toContainText("435,00 kr");
    await expect(detail.locator('[data-line="moveraGets"]')).toContainText(t.moveraGets);
    await expect(detail.locator('[data-line="moveraGets"]')).toContainText("98,50 kr");
    await expect(detail.locator("[data-line]")).toHaveCount(2);
    await expect(page.getByTestId("live-payout-lines")).toHaveCount(0);
    await expect(page.getByTestId("live-payout-detail")).not.toContainText("%");
    await expect(page.getByTestId("live-payout-row-summary")).toHaveCount(2);
    const run = page.getByTestId("live-payout-runs");
    await expect(run.getByTestId("live-payout-run-summary")).toHaveCount(2);
    await expect(run).toContainText("416,00 kr");
    await expect(run).toContainText("104,00 kr");
    await shot(page, `admin-payout-card-${language}`, "live-payout-detail");
    await shot(page, `admin-payout-run-${language}`, "live-payout-runs");
    await shot(page, `admin-payout-list-${language}`, "live-payout-list");
  });
}

test("older server (no summary, no moveraKeepsNow): today's payout card; the row reads Not connected yet, never the commission", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const old = { ...REASSIGNED, moveraKeepsNow: undefined, lostDriverPaid: undefined };
  await fakeTripServer(page, { admin: { permissions: PERMS }, trips: [old] as never });
  await fakeSettings(page);
  await signIn(page);
  await page.goto("/trips/T2401");
  await expect(page.getByTestId("trip-movera-commission")).toContainText("Not connected yet");
  await expect(page.getByTestId("trip-movera-commission")).not.toContainText("50,00 kr");
  await expect(page.getByTestId("trip-lost-driver-line")).toHaveCount(0);
  await page.goto("/payouts");
  await expect(page.getByTestId("live-payout-lines")).toContainText("-65,00 kr");
  await expect(page.getByTestId("live-payout-summary")).toHaveCount(0);
});
