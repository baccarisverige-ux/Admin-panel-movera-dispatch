import { zoneDemand } from "./demand.ts";
import { activeProfile, profileMatches, smartMultiplier, surgeAlerts, surgeLevel, surgeTimeline, zoneSurge } from "./surge.ts";
import {
  addCategory,
  archiveCategory,
  bookAtRevision,
  copyInto,
  defaultZoneBook,
  editCategory,
  emptyPricingStore,
  normalizeStore,
  PRICE_ROWS,
  priceMax,
  publishZones,
  quoteRide,
  restoreCategory,
  restoreRevision,
  startManualSurge,
  stopManualSurges,
  undoLastPublish,
  validateZoneBook,
  zoneBook,
  zoneLive,
  type QuoteInput,
} from "./zonePricing.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const AT = "2026-10-11T10:00:00.000Z";

// Every zone has its own full book in its own currency.
const store = emptyPricingStore();
const norrmalm = zoneBook(store, "Z001");
const paris = zoneBook(store, "FR-PC");
const tunis = zoneBook(store, "TN-TC");
assert(norrmalm.prices.economy.perKm === 12, "Stockholm Movera per km is 12 kr");
assert(paris.prices.economy.perKm > 0.5 && paris.prices.economy.perKm < 2, "Paris prices are in euros");
assert(tunis.prices.economy.perKm > 2 && tunis.prices.economy.perKm < 5, "Tunis prices are in dinars");
assert(norrmalm.prices.child_seat.enabled && norrmalm.prices.child_seat.childSeatFee > 0, "Child Seat is a full category with seat fees");
assert(zoneBook(store, "ARN").fees.airportPickup > 0 && norrmalm.fees.airportPickup === 0, "only airports charge an airport fee by default");
assert(validateZoneBook(norrmalm, store.categories).length === 0, "defaults are valid");

// Validation points at the broken field.
const broken = structuredClone(norrmalm);
broken.prices.premium.minimum = 5000;
broken.smart.profiles[0].steps[1].multiplier = 1.1;
const problems = validateZoneBook(broken, store.categories);
assert(problems.some((item) => item.path === "prices.premium.minimum"), "minimum above maximum is caught");
assert(problems.some((item) => item.path.startsWith("smart.weekend-night")), "steps going down are caught");

// Publish → history → restore → undo.
const edit = structuredClone(norrmalm);
edit.prices.economy.perKm = 14;
edit.prices.economy.freeWaitMin = 3;
const first = publishZones(store, { Z001: edit }, "nora", "Autumn prices", AT);
assert(!first.error && first.store.draftRev === 2, "publish makes revision 2");
assert(first.changes.includes("Norrmalm · Movera · Price per km 12 → 14"), "the change list is plain language");
assert(zoneBook(first.store, "Z001").version === 2, "zone version goes up");
assert(publishZones(first.store, { Z001: zoneBook(first.store, "Z001") }, "nora", "same", AT).error === "Nothing to publish.", "no empty revisions");
const second = publishZones(first.store, { Z001: { ...zoneBook(first.store, "Z001"), prices: { ...zoneBook(first.store, "Z001").prices, economy: { ...zoneBook(first.store, "Z001").prices.economy, perKm: 16 } } } }, "nora", "Up again", AT);
assert(bookAtRevision(second.store, "Z001", 2).prices.economy.perKm === 14, "revision 2 is remembered");
const restored = restoreRevision(second.store, 2, "nora", AT);
assert(!restored.error && zoneBook(restored.store, "Z001").prices.economy.perKm === 14 && restored.store.draftRev === 4, "restore adds revision 4");
const undone = undoLastPublish(second.store, "nora", AT);
assert(zoneBook(undone.store, "Z001").prices.economy.perKm === 14, "undo goes back one publish");
assert(publishZones(store, { Z001: broken }, "nora", "bad", AT).error?.startsWith("Norrmalm:"), "an invalid zone cannot be published");

// Copying converts the currency.
const copied = copyInto(zoneBook(second.store, "Z001"), zoneBook(store, "FR-PC"), ["prices"]);
assert(copied.prices.economy.perKm === 1.5 && copied.zoneId === "FR-PC", "16 kr becomes 1.50 € in Paris");
const sameCountry = copyInto(zoneBook(second.store, "Z001"), zoneBook(store, "Z002"), ["prices", "commission"]);
assert(sameCountry.prices.economy.perKm === 16, "same country copies as is");

// Categories: add, edit, safe delete, restore within 30 days.
const added = addCategory(store, { label: "Women Driver", line: "A woman drives you", seats: 4 });
assert(!added.error && added.store.categories.some((item) => item.id === "women_driver"), "category added");
assert(zoneBook(added.store, "Z001").prices.women_driver.enabled === false, "a new category starts off in every zone");
assert(addCategory(added.store, { label: "women driver", line: "x", seats: 4 }).error?.includes("already exists"), "no duplicate names");
assert(!editCategory(added.store, "women_driver", { label: "Lady Driver", line: "A woman drives you", seats: 4 }).error, "category renamed");
const blocked = archiveCategory(added.store, "economy", { activeRides: 3, reservations: 0, vehicles: 12 }, "nora", "test", AT);
assert(blocked.error?.includes("still in use") && blocked.error.includes("3 rides in progress"), "delete is blocked while in use");
const archived = archiveCategory(added.store, "women_driver", { activeRides: 0, reservations: 0, vehicles: 0 }, "nora", "Not launching", AT);
assert(!archived.error && archived.store.categories.find((item) => item.id === "women_driver")?.archived, "unused category is archived");
assert(!restoreCategory(archived.store, "women_driver", Date.parse(AT) + 86_400_000).error, "can restore the next day");
assert(restoreCategory(archived.store, "women_driver", Date.parse(AT) + 31 * 86_400_000).error?.includes("30 days"), "not after 30 days");

// Manual surge.
const surged = startManualSurge(store, "Z003", 1.8, 60, "nora", "Concert", AT);
assert(!surged.error && zoneLive(surged.store, "Z003").manual?.multiplier === 1.8, "manual surge stored");
assert(surged.store.surgeLog.some((event) => event.kind === "notify"), "drivers are told by default");
assert(startManualSurge(store, "Z003", 7, 60, "nora", "x", AT).error, "slider stops at ×6");
const stopped = stopManualSurges(surged.store, ["Z001", "Z003"], "nora", "Over", AT);
assert(stopped.stopped.join() === "Z003" && !zoneLive(stopped.store, "Z003").manual, "stop all stops only running surges");

// Quote: waiting after the free minutes, stops, seats, app fee, min fare, split.
const input: QuoteInput = { categoryId: "economy", km: 10, minutes: 20, waitMin: 5, stops: 1, stopWaitMin: 2, babySeats: 1, childSeats: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 };
const quote = quoteRide(norrmalm, input);
// 29 + 120 + 80 = 229; waiting 3 × 12.26 = 36.78; stop 15; stop wait 10; baby seat 30 → 320.78; app fee 10% → 352.86 → 353
assert(quote.total === 353, `quote total ${quote.total}`);
assert(quote.driverGets === 256.62, `driver gets 80% of 320.78, got ${quote.driverGets}`);
// Waiting matches the driver app: 12.26 kr/min (Premium 16.90), 65 kr no-show fee, Premium 5 and XL 3 free minutes.
assert(norrmalm.prices.economy.waitPerMin === 12.26 && norrmalm.prices.premium.waitPerMin === 16.9 && norrmalm.prices.comfort.waitPerMin === 12.26, "waiting per minute");
assert(norrmalm.prices.economy.noShowFee === 65 && norrmalm.prices.premium.noShowFee === 65, "no-show fee");
assert(norrmalm.prices.economy.freeWaitMin === 2 && norrmalm.prices.premium.freeWaitMin === 5 && norrmalm.prices.xl.freeWaitMin === 3, "free wait");
// The rider's free cancel time and cancel fee are set in Dispatch › Rider cancel fees only. Older saves that still have them open fine.
assert(!PRICE_ROWS.some((row) => ["cancelFee", "freeCancelMin"].includes(row.field)) && PRICE_ROWS.some((row) => row.field === "noShowFee" && row.group === "Cancellation"), "no rider cancel fee in Pricing; the no-show fee stays");
const oldSave = normalizeStore({ ...emptyPricingStore(), zones: { Z001: { ...defaultZoneBook("Z001"), prices: { economy: { ...norrmalm.prices.economy, cancelFee: 40, freeCancelMin: 2 } } } } });
const reopened = zoneBook(oldSave, "Z001").prices.economy as Record<string, unknown>;
assert(!("cancelFee" in reopened) && !("freeCancelMin" in reopened) && reopened.noShowFee === 65 && reopened.base === norrmalm.prices.economy.base, "an older save with the cancel fields still opens, without them");
const surgedQuote = quoteRide(norrmalm, { ...input, waitMin: 0, stops: 0, stopWaitMin: 0, babySeats: 0, surge: 1.5 });
assert(surgedQuote.lines.some((line) => line.kind === "surge" && line.amount === 114.5), "surge applies to the trip part");
assert(quoteRide(norrmalm, { ...input, km: 0.5, minutes: 1, waitMin: 0, stops: 0, stopWaitMin: 0, babySeats: 0 }).lines.some((line) => line.kind === "limit"), "minimum fare applies");
const off = structuredClone(norrmalm);
off.prices.pet.enabled = false;
assert(quoteRide(off, { ...input, categoryId: "pet" }).error, "an off category cannot be quoted");

// Time profiles: Friday night window runs into Saturday morning.
const weekendNight = norrmalm.smart.profiles.find((profile) => profile.id === "weekend-night")!;
assert(profileMatches(weekendNight, 4, 23 * 60), "Friday 23:00 is weekend night");
assert(profileMatches(weekendNight, 5, 3 * 60), "Saturday 03:00 is still Friday's weekend night");
assert(!profileMatches(weekendNight, 0, 3 * 60), "Monday 03:00 is not");
assert(activeProfile(norrmalm.smart, Date.parse("2026-10-09T21:30:00Z"), "Europe/Stockholm")?.id === "weekend-night", "Friday 23:30 Stockholm picks weekend night");
assert(activeProfile(norrmalm.smart, Date.parse("2026-10-07T06:30:00Z"), "Europe/Stockholm")?.id === "rush", "Wednesday 08:30 picks rush hour");
assert(activeProfile(norrmalm.smart, Date.parse("2026-10-07T11:00:00Z"), "Europe/Stockholm")?.id === "normal", "midday falls back to Normal");
const normal = norrmalm.smart.profiles.find((profile) => profile.isDefault)!;
assert(smartMultiplier(normal, 1.2) === 1 && smartMultiplier(normal, 2.4) === 1.5 && smartMultiplier(normal, 9) === 2, "steps pick the highest reached");
assert(smartMultiplier({ ...normal, cap: 1.4 }, 9) === 1.4, "never above the cap");
assert(surgeLevel(1) === "none" && surgeLevel(1.8) === "mid" && surgeLevel(3.2) === "extreme", "levels for colours");

// Manual wins over smart; alerts only when a person is needed.
const busy = { zoneId: "Z003", requests: 30, free: 5, ratio: 6 };
const live = zoneLive(surged.store, "Z003");
assert(zoneSurge(norrmalm, live, busy, Date.parse(AT) + 60_000).source === "manual", "manual wins");
const offBook = { ...zoneBook(store, "Z003"), smart: { ...norrmalm.smart, enabled: false } };
const offSurge = zoneSurge(offBook, zoneLive(store, "Z003"), busy, Date.parse(AT));
assert(offSurge.source === "off" && offSurge.smartNote === "Smart surge is off", "smart off shows why");
const alerts = surgeAlerts([{ book: offBook, live: zoneLive(store, "Z003"), surge: offSurge }], Date.parse(AT));
assert(alerts[0]?.title === "Östermalm needs a manual surge" && alerts[0].tone === "critical", "short zone with smart off asks for a manual surge");
const calm = zoneSurge(zoneBook(store, "Z001"), zoneLive(store, "Z001"), { zoneId: "Z001", requests: 4, free: 8, ratio: 0.5 }, Date.parse(AT));
assert(surgeAlerts([{ book: zoneBook(store, "Z001"), live: zoneLive(store, "Z001"), surge: calm }], Date.parse(AT)).every((alert) => alert.action !== "manual"), "calm zone raises no surge alert");

// Demand model and timeline are stable.
assert(JSON.stringify(zoneDemand("Z001", Date.parse(AT))) === JSON.stringify(zoneDemand("Z001", Date.parse(AT))), "demand is deterministic");
assert(surgeTimeline(zoneBook(surged.store, "Z003"), surged.store.surgeLog, Date.parse(AT)).some((item) => item.title.startsWith("Manual surge ×1.8")), "timeline has the manual surge");
assert(normalizeStore({ version: 1 }).draftRev === 1 && normalizeStore(null).categories.length === 8, "older data falls back safely");
assert(defaultZoneBook("Z001").fees.tollsPassThrough, "Sweden adds congestion tax by default");
console.log("zone pricing ok");

// UI-05: money fields have sane maxima per currency, so a typo cannot be published.
{
  const base = structuredClone(norrmalm);
  base.prices.economy.base = 100_000;
  assert(validateZoneBook(base, store.categories).some((problem) => problem.path === "prices.economy.base" && problem.message.includes("at most 1000 kr")), "a 100 000 kr base fare is refused");
  const tn = structuredClone(tunis);
  tn.prices.economy.base = 301;
  assert(validateZoneBook(tn, store.categories).some((problem) => problem.path === "prices.economy.base" && problem.message.includes("300 DT")), "the cap is in dinars in Tunisia");
  const fee = structuredClone(norrmalm);
  fee.fees.cleaningFee = 2_001;
  fee.fees.tips = [10, 5_000];
  assert(validateZoneBook(fee, store.categories).some((problem) => problem.path === "fees.cleaningFee") && validateZoneBook(fee, store.categories).some((problem) => problem.path === "fees.tips"), "fees and tips have maxima too");
  assert(priceMax("base", "SE") === 1_000 && priceMax("base", "FR") === 95 && priceMax("base", "TN") === 300 && priceMax("maximum", "SE") === 50_000, "base fare caps: 1 000 kr, 95 €, 300 DT");
  for (const id of ["Z001", "ARN", "FR-PC", "TN-TC"]) assert(validateZoneBook(zoneBook(store, id), store.categories).length === 0, `default prices in ${id} stay valid`);
}
console.log("pricing bounds ok");
