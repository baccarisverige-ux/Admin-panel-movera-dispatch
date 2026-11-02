import { expect, test, type Page } from "@playwright/test";
import { ADMIN, COMPLETED_TRIP, RIDERS, fakeSettings, fakeTripServer, signIn, type TripState } from "./live-fake";

/**
 * Driver group 8 "Finish & cash" (contract v0.18.10 §36, Rules decisions/driver-g8.md, admin-fake-by-group.md G8), the
 * admin parts on live against a faked server — every action is a real server call, never a local save:
 * - Trip page: who gets what from TripProjection.moneySplit (an earlier unpaid fee on its own line, never Movera's),
 *   ended early, Give money back (with "take it from the driver's share"), Change the driver's pay (reason), Resend receipt.
 * - Payments: no "demo ledger" on live; tabs without a server source say so plainly.
 */

const G8_ADMIN = { permissions: [...ADMIN.permissions, "settings.read", "settings.edit", "settings.publish", "dispatch.edit", "trips.intervene", "payments.refund", "finance.read", "finance.edit"] };
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

const FINISHED = {
  ...COMPLETED_TRIP,
  tripId: "T2008",
  paymentMethod: "cash",
  fare: SEK(31800),
  fareLines: [{ code: "base", amount: SEK(7800) }, { code: "outstanding_fee", amount: SEK(24000) }],
  driverEarnings: SEK(6005),
  commission: SEK(1795),
  driverTotal: SEK(6365),
  earningsBreakdown: [{ code: "trip", amount: SEK(6005) }, { code: "pickup_pay", amount: SEK(360) }],
  debtCollected: SEK(24000),
  moneySplit: { riderPaid: SEK(31800), driverTotal: SEK(6365), movera: SEK(1435), debtCollected: SEK(24000), refunded: SEK(0) },
  finish: { endedEarly: true, endedBy: "rider", reasonCode: "plans_changed", total: SEK(31800), cashToCollect: SEK(31800), ratingAllowed: false },
};

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await fakeTripServer(page, { admin: G8_ADMIN, trips: [structuredClone(FINISHED)] as never, riders: [{ ...RIDERS[0] }, { ...RIDERS[1] }] });
  await fakeSettings(page);
  await signIn(page, "Dashboard");
  await page.goto(path);
  return state;
}
const posted = (state: TripState, suffix: string) => state.calls.find((call) => call.method === "POST" && call.path.endsWith(suffix));

test("trip page: who gets what from the server, the old fee on its own line, ended early", async ({ page }) => {
  await open(page, "/trips/T2008");
  const box = page.getByTestId("trip-who-gets-what");
  await expect(box).toContainText("Driver gets");
  await expect(page.getByTestId("trip-debt-line")).toContainText("Earlier unpaid fee");
  await expect(page.getByTestId("trip-ended-early")).toContainText("The rider ended the trip early.");
  await expect(page.getByText("Not connected yet.")).toHaveCount(0);
});

test("trip page: give money back from the driver's share, change pay with a reason, resend the receipt — each a server call", async ({ page }) => {
  const state = await open(page, "/trips/T2008");
  const money = page.getByTestId("live-trip-money");
  await money.getByLabel("Refund amount").fill("20");
  await money.getByLabel("Why", { exact: true }).fill("Detour");
  await money.getByLabel("Take it from the driver's share").check();
  await money.getByRole("button", { name: "Give money back" }).click();
  await expect.poll(() => posted(state, "/refund")?.body).toMatchObject({ amount: { amountMinor: 2000, currency: "SEK" }, reason: "Detour", fromDriver: true });
  await money.getByLabel("Driver pay change").fill("-15");
  await money.getByLabel("Reason for the pay change").fill("Wrong waiting");
  await money.getByRole("button", { name: "Change pay" }).click();
  await expect.poll(() => posted(state, "/driver-pay")?.body).toMatchObject({ change: { amountMinor: -1500, currency: "SEK" }, reason: "Wrong waiting" });
  await money.getByLabel("Reason for resending").fill("Rider asked");
  await money.getByRole("button", { name: "Resend receipt" }).click();
  await expect.poll(() => posted(state, "/receipt/resend")?.body).toMatchObject({ reason: "Rider asked" });
  await expect(money.getByRole("status")).toContainText("Receipt sent again");
});

test("payments on live: no demo ledger; failed and disputes say why they are empty", async ({ page }) => {
  await open(page, "/payments");
  await expect(page.getByTestId("payment-count")).not.toContainText("demo ledger");
  await page.getByRole("tab", { name: "Failed and retries" }).click();
  await expect(page.getByTestId("live-payments-failed")).toContainText("Pay in car");
  await page.getByRole("tab", { name: "Methods and tools" }).click();
  await expect(page.getByTestId("live-payments-tools")).toContainText("Settings › Payment methods");
});
