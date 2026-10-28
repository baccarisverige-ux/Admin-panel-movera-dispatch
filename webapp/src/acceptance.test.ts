import type { TripStatus } from "./domain/contract.ts";
import { readFileSync } from "node:fs";
import { can } from "./auth/permissions.ts";
import { createFixtureAdminApi } from "./api/create.ts";
import { signedInFixture } from "./api/fixtureSession.ts";
import { ApiError } from "./api/httpClient.ts";
import { createSeed } from "./api/seed.ts";
import { changeStudio, emptyStudio, studioSlot } from "./content/studio.ts";
import { averageStars } from "./growth/book.ts";
import { emptyGrowth, growthReviews, moderateGrowth } from "./growth/ops.ts";
import { liveSos, liveTicket } from "./gates/frontendC.ts";
import { campaignAudience, newCampaign } from "./messages/ops.ts";
import { canStartCheckout, existingAuthContinues, type PaymentMethod } from "./payments/book.ts";
import { emptyPricingStore, quoteRide, roundTo, zoneBook } from "./pricing/zonePricing.ts";
import { csvCell } from "./reports/csv.ts";
import { needsDriverSoon } from "./reservations/book.ts";
import { emptyRiderCare } from "./riders/care.ts";
import { buildRows, matches } from "./riders/segments.ts";
import { cancelTrip } from "./trips/rules.ts";
import { publishZones, emptyBook } from "./zones/releases.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const trip = { id: "T1", status: "completed" as TripStatus, category: "economy" as const, fareOre: 1000, ruleVersion: "price-3", driverId: "D1" };
assert(cancelTrip(trip, "no").error, "A01 finished trip cannot be cancelled");
assert(cancelTrip({ ...trip, status: "searching" }, "rider asked").trip.status === "cancelled_by_admin", "A02 searching can be cancelled");

// A03 / A10 run against the live fixture server (C-21), not the old commands/run.ts.
const api = signedInFixture(createFixtureAdminApi(0));
await api.reset();
const refund = { action: "admin.payment.refund", targetId: "PAY0200", reason: "Charged twice", actorId: "astrid", idempotencyKey: "a", collection: "payments", patch: { status: "refunded" }, before: "captured", after: "refunded" };
const firstRev = await api.revision();
const pending = await api.command({ ...refund, expectedRev: firstRev });
const again = await api.command({ ...refund, expectedRev: firstRev });
assert(pending.status === "pending_approval" && again.operationId === pending.operationId && (await api.audit()).filter((row) => row.operationId === pending.operationId).length === 1, "A03 one refund effect on retry");

// A04: the live Pricing quote (pricing/zonePricing.ts) adds up from its own lines, from the published Movera prices.
const book = zoneBook(emptyPricingStore(), "Z001");
const price = book.prices.economy;
const quote = quoteRide(book, { categoryId: "economy", km: 10, minutes: 20, waitMin: 0, stops: 0, stopWaitMin: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 });
const ride = price.base + price.perKm * 10 + price.perMin * 20;
assert(!quote.error && quote.total === roundTo(ride * (1 + price.appFeePct / 100), book.fees.rounding) && quote.lines.filter((line) => line.kind === "trip").reduce((sum, line) => sum + line.amount, 0) === ride, "A04 quote matches");

const methods = { card: true, apple: true, google: true, cash: false, wallet: true } as Record<PaymentMethod, boolean>;
assert(!canStartCheckout(methods, "cash"), "A05 new cash checkout refused");
assert(existingAuthContinues({ id: "C", method: "cash", state: "authorized" }, methods), "A06 existing auth continues");

assert(needsDriverSoon({ id: "B", pickupAt: "2026-10-05T11:00:00Z", driverId: null, policyVersion: "res-2", status: "booked" }, "2026-10-05T10:30:00Z"), "A07 reservation flagged");
assert(!("pin" in liveSos().record), "A08 no PIN");

const ticket = liveTicket();
assert(ticket.replies === 1 && ticket.private, "A09 private note not delivered");

const clash = await api.command({ ...refund, idempotencyKey: "b", actorId: "nora", expectedRev: firstRev }).then(() => null, (error: unknown) => error);
assert(clash instanceof ApiError && clash.status === 409 && clash.code === "version_mismatch", "A10 conflict");

const seed = createSeed();
const campaign = { ...newCampaign("C1", "Z001"), app: "rider" as const };
const audience = campaignAudience(campaign, seed.riders);
assert(audience.length > 0 && audience.every((id) => seed.riders.find((row) => row.id === id)?.zoneId === "Z001"), "A11 audience");
assert(!can("support", "finance.read"), "A12 support cannot open payments");
const riderRows = buildRows(seed.riders.slice(0, 40), emptyRiderCare(), Date.parse("2026-10-05T16:00:00Z"), "month", new Set());
const withTrip = riderRows.find((row) => row.rider.tripId);
assert(withTrip && riderRows.filter((row) => matches(row, withTrip.rider.tripId!)).length >= 1 && matches(withTrip, withTrip.rider.tripId!), "A13 rider search");
assert(csvCell("=1+1").startsWith("'"), "A14 csv guard");
const zones = emptyBook("nora");
assert(publishZones(zones, "nora").error, "A15 author cannot publish zones");

const first = { ...studioSlot(emptyStudio(), "help").draft, sv: "Hej", en: "Hello" };
let content = changeStudio(emptyStudio(), "help", first, "save", "nora").book;
content = changeStudio(content, "help", first, "publish", "lena").book;
content = changeStudio(content, "help", { ...first, en: "Next" }, "save", "nora").book;
content = changeStudio(content, "help", { ...first, en: "Next" }, "publish", "lena").book;
assert(changeStudio(content, "help", first, "rollback", "lena").book.slots.help?.published?.en !== "Next", "rollback restores content");
const review = growthReviews(seed.trips)[0]!;
const moderated = moderateGrowth(emptyGrowth(), review.id, true, "abuse", "nora");
assert(!moderated.error && moderated.book.moderation[review.id]?.at(-1)?.hidden && growthReviews(seed.trips)[0]!.text === review.text, "hidden review keeps its text");
assert(averageStars([{ id: "V", stars: 1, text: "kept", hidden: true, hideReason: "abuse" }]) === 0, "hidden review");
assert(seed.bonuses.length === 3, "three bonuses");

const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");
assert(css.includes("focus-visible"), "keyboard focus is visible");
const login = readFileSync(new URL("./pages/LoginPage.tsx", import.meta.url), "utf8");
assert(login.includes("<label>"), "login fields have labels");

console.log("acceptance ok");
