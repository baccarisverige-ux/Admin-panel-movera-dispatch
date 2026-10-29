import { expect, test, type Page } from "@playwright/test";
import { ADMIN, COMPLETED_TRIP, DRIVER, PAYOUTS, RATINGS, RIDERS, SEED_ZONES, TICKETS, fakeTripServer, signIn } from "./live-fake";

/**
 * Contract v0.17.2 (contract.json#adminListFilters; owner 2026-10-29: "if I chose France it show Sweden trips !",
 * "Fix fully (Recommended)"): every live page reads the lists of the country and zones picked in the top bar.
 * Sweden has Ida's trip T2001 with Anna Berg; France has Lucie's trip T3001 with Luc Moreau in Paris (FR-PC).
 */

const OUT = process.env.ZONE_SHOTS ?? "";
const FR_TRIP = { ...COMPLETED_TRIP, tripId: "T3001", riderId: "R601", driverId: "D3001", vehicleId: "V3", zoneId: "FR-PC", pickup: { address: "Place de la Concorde, Paris", lat: 48.8656, lng: 2.3212 }, dropoff: { address: "Gare de Lyon, Paris", lat: 48.8443, lng: 2.3744 }, fare: { amountMinor: 3500, currency: "EUR" } };
const FR_DRIVER = { ...DRIVER, driverId: "D3001", firstName: "Luc", lastName: "Moreau", email: "luc@example.fr", country: "FR", cityId: "paris", zoneIds: ["FR-PC"], fleet: null };
const FR_RIDER = { ...RIDERS[0]!, riderId: "R601", firstName: "Lucie", phone: "+33600000601", email: "lucie@example.fr", wallet: { amountMinor: 0, currency: "EUR" } };
const FR_LIVE = { driverId: "D3001", firstName: "Luc", onlineStatus: "online", moving: false, location: { lat: 48.86, lng: 2.34, accuracy: 6, measuredAt: "2026-10-26T09:20:40Z" }, lastFixAt: "2026-10-26T09:20:41Z", stale: false, zoneId: "FR-PC" };
const FR_TICKET = { ...TICKETS[0]!, ticketId: "TK9", tripId: "T3001", riderId: "R601", subject: "Chauffeur en retard", zoneId: "FR-PC" };
const FR_PAYOUT = { ...PAYOUTS[0]!, payoutId: "PY9", driverId: "D3001", driverName: "Luc Moreau", zoneId: "FR-PC", amount: { amountMinor: 12000, currency: "EUR" } };
const FR_RATING = { ...RATINGS[0]!, tripId: "T3001", riderId: "R601", riderName: "Lucie", driverId: "D3001", driverName: "Luc Moreau", comment: "Très bien", zoneId: "FR-PC" };

async function franceAndSweden(page: Page) {
  const state = await fakeTripServer(page, { admin: { permissions: [...ADMIN.permissions, "support.reply", "settings.read", "incidents.read"] } });
  state.trips.push(FR_TRIP as never);
  state.drivers.push(FR_DRIVER as never);
  state.riders.push(FR_RIDER);
  state.liveDrivers.push(FR_LIVE);
  state.tickets.push(FR_TICKET);
  state.payouts.push(FR_PAYOUT);
  state.ratings.push(FR_RATING);
  await signIn(page);
  return state;
}

/** A list read narrowed to one country: country=XX, or zoneId/zoneIds that are all zones of XX (before the server's zone list arrives the panel names the zones). */
function namesCountry(path: string, country: string): boolean {
  const url = new URL(path, "http://x");
  if (url.searchParams.get("country")) return url.searchParams.get("country") === country;
  const zones = [...url.searchParams.getAll("zoneId"), ...url.searchParams.getAll("zoneIds").flatMap((part) => part.split(","))];
  const of = new Map(SEED_ZONES().map((zone) => [zone.zoneId, zone.country]));
  return zones.length > 0 && zones.every((zone) => of.get(zone) === country);
}

const calls = (state: { calls: { path: string }[] }, from: number, endpoint: string) => state.calls.slice(from).map((call) => call.path).filter((path) => path.startsWith(`/api/v1/admin/${endpoint}?`) || path === `/api/v1/admin/${endpoint}`);

async function open(page: Page, path: string, country: string) {
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}country=${country}`);
  await expect(page.locator("main")).toBeVisible();
}

const PAGES: { path: string; name: string; endpoints: string[]; fr: string; se: string }[] = [
  { path: "/trips", name: "trips", endpoints: ["trips"], fr: "T3001", se: "T2001" },
  { path: "/reservations", name: "reservations", endpoints: ["trips"], fr: "", se: "" },
  { path: "/", name: "dashboard", endpoints: ["trips", "drivers"], fr: "", se: "" },
  { path: "/dispatch/map", name: "livemap", endpoints: ["drivers", "live/drivers"], fr: "", se: "" },
  { path: "/drivers", name: "drivers", endpoints: ["drivers"], fr: "Luc Moreau", se: "Anna Berg" },
  { path: "/riders", name: "riders", endpoints: ["riders"], fr: "Lucie", se: "Ida" },
  { path: "/payments", name: "payments", endpoints: ["payments"], fr: "", se: "" },
  { path: "/payouts", name: "payouts", endpoints: ["payouts"], fr: "", se: "" },
  { path: "/support", name: "support", endpoints: ["tickets"], fr: "Chauffeur en retard", se: "Charged too much" },
  { path: "/reviews", name: "reviews", endpoints: ["ratings"], fr: "", se: "" },
  { path: "/incidents", name: "incidents", endpoints: ["incidents"], fr: "", se: "" },
];

for (const item of PAGES) {
  test(`${item.name}: Sweden and France each read their own lists`, async ({ page }) => {
    const state = await franceAndSweden(page);
    for (const [country, mine, other] of [["SE", item.se, item.fr], ["FR", item.fr, item.se]] as const) {
      const from = state.calls.length;
      await open(page, item.path, country);
      // The page's list reads name the country (a name lookup beside them may read without it).
      for (const endpoint of item.endpoints) await expect.poll(() => calls(state, from, endpoint).some((path) => namesCountry(path, country)), { message: `${item.name} ${country} ${endpoint}`, timeout: 15_000 }).toBe(true);
      if (mine) await expect(page.locator("main")).toContainText(mine);
      if (other) await expect(page.locator("main")).not.toContainText(other);
      if (OUT) await page.screenshot({ path: `${OUT}/after-${item.name}-${country}.png`, fullPage: true });
    }
  });
}

test("trips: one zone sends zoneId; each price is in its own currency", async ({ page }) => {
  const state = await franceAndSweden(page);
  const from = state.calls.length;
  await page.goto("/trips?country=FR&scope=FR-PC");
  await expect(page.getByRole("cell", { name: "T3001", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toHaveCount(0);
  expect(calls(state, from, "trips").some((path) => path.includes("zoneId=FR-PC"))).toBe(true);
  await expect(page.getByRole("row").filter({ hasText: "T3001" })).toContainText("35,00 €");
  if (OUT) await page.screenshot({ path: `${OUT}/after-trips-FR-PC.png`, fullPage: true });
  await page.goto("/trips?country=SE");
  await expect(page.getByRole("row").filter({ hasText: "T2001" })).toContainText("520,00 kr");
});

test("trips: several zones send zoneIds", async ({ page }) => {
  const state = await franceAndSweden(page);
  const from = state.calls.length;
  await page.goto("/trips?country=SE&scope=Z001,Z002");
  await expect(page.getByRole("cell", { name: "T2001", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "T3001", exact: true })).toHaveCount(0);
  expect(calls(state, from, "trips").some((path) => decodeURIComponent(path).includes("zoneIds=Z001,Z002"))).toBe(true);
});
