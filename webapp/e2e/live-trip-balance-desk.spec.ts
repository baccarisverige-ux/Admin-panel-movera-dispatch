import { expect, test, type Page } from "@playwright/test";
import { ADMIN, COMPLETED_TRIP, RIDERS, fakeSettings, fakeTripServer, signIn } from "./live-fake";

/**
 * BQ-A29 (contract v0.18.89 §90 priceDisplay.owedToMovera / tripCashToCollect / routeChange, text v0.18.90) + the MC
 * Payments desk follow-up (contract 0.18.92 moneyBase.commissionRow.admin, price-audit gap 6). The live trip page shows
 * the server's TripFinish.owedToMovera as "Driver owes Movera X" / "Movera owes the driver X", the route change's
 * "Driver gets" = TripRouteChange.driverTotal; the Payments desk's Driver / Movera columns = moneySplit.driverTotal /
 * moveraKeepsNow. A29_SHOTS=<dir> also saves the after screenshots.
 */
test.use({ deviceScaleFactor: 2 });

const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });
const A29_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "trips.intervene", "payments.refund", "finance.read"] };
// 520,00 kr card trip (the payment pay_T2001): driver total 437,00 kr after a later bonus; Movera keeps 83,00 kr; Movera owes him 437,00 kr.
const CARD_TRIP = {
  ...COMPLETED_TRIP,
  driverTotal: SEK(43700), moveraKeepsNow: SEK(8300),
  moneySplit: { riderPaid: SEK(52000), driverTotal: SEK(43700), movera: SEK(8300), debtCollected: SEK(0), refunded: SEK(0) },
  finish: { endedEarly: false, total: SEK(52000), cashToCollect: SEK(52000), driverTotal: SEK(43700), owedToMovera: SEK(-43700), ratingAllowed: false },
};
// 300,00 kr cash trip with an accepted route change: he holds 300,00 kr, his total is 235,00 kr → he owes Movera 65,00 kr.
const CASH_TRIP = {
  ...COMPLETED_TRIP,
  tripId: "T2091", paymentMethod: "cash", fare: SEK(30000), fareLines: [], driverEarnings: SEK(23500), commission: SEK(6500), moveraKeepsNow: SEK(6500), driverTotal: SEK(23500),
  cashToCollect: SEK(30000),
  moneySplit: { riderPaid: SEK(30000), driverTotal: SEK(23500), movera: SEK(6500), debtCollected: SEK(0), refunded: SEK(0) },
  finish: { endedEarly: false, total: SEK(30000), cashToCollect: SEK(30000), driverTotal: SEK(23500), owedToMovera: SEK(6500), ratingAllowed: false },
  routeChange: { changeId: "rc1", status: "accepted", dropoff: { address: "Arlanda Terminal 2", lat: 59.65, lng: 17.93 }, stops: [], total: SEK(30000), difference: SEK(4000), askedAt: "2026-10-25T08:10:00Z", answerBy: "2026-10-25T08:12:00Z", answeredAt: "2026-10-25T08:11:00Z", answeredBy: "rider", driverEarnings: SEK(23500), earningsDifference: SEK(3200), driverTotal: SEK(23500) },
};

async function open(page: Page, path: string, language?: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fakeTripServer(page, { admin: { ...A29_ADMIN, ...(language ? { language } : {}) }, trips: [structuredClone(CARD_TRIP), structuredClone(CASH_TRIP)] as never, riders: [{ ...RIDERS[0] }, { ...RIDERS[1] }] });
  await fakeSettings(page);
  await signIn(page, language === "sv" ? "Kontrollpanel" : "Dashboard");
  await page.goto(path);
}

async function shot(page: Page, name: string, selector: string) {
  const dir = process.env.A29_SHOTS;
  if (!dir) return;
  await page.setViewportSize({ width: 1440, height: 5200 });
  await page.locator(selector).first().screenshot({ path: `${dir}/${name}.png` });
}

const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

test("A29: the cash trip shows the server's balance (Driver owes Movera 65,00 kr) and the route change's driverTotal", async ({ page }) => {
  await open(page, "/trips/T2091");
  const balance = page.getByTestId("split-driver-balance");
  await expect(balance).toBeVisible();
  expect(plain(await balance.textContent())).toContain("Driver owes Movera 65,00 kr");
  await expect(page.getByTestId("trip-cash")).not.toContainText("Owed to Movera");
  // Round 2 (M1): finish.cashToCollect is what is LEFT to collect; no "owed amount" help line on live.
  await expect(page.getByTestId("trip-cash")).toContainText("Cash to collect");
  await expect(page.getByTestId("trip-cash")).not.toContainText("Cash collected by driver");
  await expect(page.getByTestId("trip-cash")).not.toContainText("The owed amount is taken from the driver's next payout");
  expect(plain(await page.getByTestId("route-change-driver-gets").textContent())).toContain("235,00 kr");
  await shot(page, "A29-trip-cash-en", "#split");
  await shot(page, "A29-trip-route-change-en", "[data-testid=trip-route-change]");
});

test("A29: the card trip says Movera owes the driver 437,00 kr (no sign)", async ({ page }) => {
  await open(page, "/trips/T2001");
  expect(plain(await page.getByTestId("split-driver-balance").textContent())).toContain("Movera owes the driver 437,00 kr");
  await shot(page, "A29-trip-card-en", "#split");
});

test("A29 MC desk: the T2001 row, Driver gets = moneySplit.driverTotal, Movera = moveraKeepsNow (437,00 kr / 83,00 kr)", async ({ page }) => {
  await open(page, "/trips");
  await expect(page.getByText("T2001").first()).toBeVisible();
  await page.goto("/payments");
  const row = page.getByRole("row").filter({ hasText: "520,00" }).filter({ hasText: "T2001" });
  await expect(row).toBeVisible();
  const text = plain(await row.textContent());
  expect(text).toContain("437,00 kr");
  expect(text).toContain("83,00 kr");
  expect(text).not.toContain("104,00 kr");
  await shot(page, "A29-payments-desk-en", "table");
});

test("A29 sv: the balance line and the desk in Swedish", async ({ page }) => {
  await open(page, "/trips/T2091", "sv");
  expect(plain(await page.getByTestId("split-driver-balance").textContent())).toContain("Föraren är skyldig Movera 65,00 kr");
  await shot(page, "A29-trip-cash-sv", "#split");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/trips/T2001");
  expect(plain(await page.getByTestId("split-driver-balance").textContent())).toContain("Movera är skyldig föraren 437,00 kr");
  await shot(page, "A29-trip-card-sv", "#split");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/payments");
  const row = page.getByRole("row").filter({ hasText: "520,00" }).filter({ hasText: "T2001" });
  await expect(row).toBeVisible();
  expect(plain(await row.textContent())).toContain("437,00 kr");
  await shot(page, "A29-payments-desk-sv", "table");
});

test("A29 round 2 (M2): the live payment page shows amounts only — no % bar, no 'Driver x%, Movera y%', no 20% text", async ({ page }) => {
  await open(page, "/trips");
  await expect(page.getByText("T2001").first()).toBeVisible();
  await page.goto("/payments/pay_T2001");
  await expect(page.getByText("437,00 kr").first()).toBeVisible();
  await expect(page.getByText("83,00 kr").first()).toBeVisible();
  await expect(page.locator(".pm-split")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Driver \d+%, Movera/ })).toHaveCount(0);
  const body = (await page.locator("main").textContent()) ?? "";
  expect(body).not.toContain("NaN");
  expect(body).not.toContain("Commission (20% until the price book is linked).");
  await shot(page, "A29-payment-page-en", "main");
});

test("A29 round 2 sv: the live payment page and the cash box in Swedish", async ({ page }) => {
  await open(page, "/trips/T2091", "sv");
  await expect(page.getByTestId("trip-cash")).toContainText("Kontant att ta emot");
  await shot(page, "A29-trip-cash-r2-sv", "[data-testid=trip-cash]");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/payments/pay_T2001");
  await expect(page.getByText("437,00 kr").first()).toBeVisible();
  await expect(page.locator(".pm-split")).toHaveCount(0);
  await shot(page, "A29-payment-page-sv", "main");
});
