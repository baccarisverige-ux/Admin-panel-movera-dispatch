import { zoneDemand } from "./demand.ts";
import { activeProfile, profileMatches, smartMultiplier, surgeAlerts, surgeLevel, surgeTimeline, zoneSurge } from "./surge.ts";
import {
  addCategory,
  archiveCategory,
  bookAtRevision,
  copyInto,
  defaultCategoryPrice,
  defaultZoneBook,
  editCategory,
  emptyPricingStore,
  isLargePriceChange,
  largeStoreChanges,
  largePriceChanges,
  normalizeStore,
  PRICE_ROWS,
  priceMax,
  publishZones,
  quoteRide,
  restoreCategory,
  restoreRevision,
  rowApplies,
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

// Quote: waiting after the free minutes, stops, app fee, min fare, split.
const input: QuoteInput = { categoryId: "economy", km: 10, minutes: 20, waitMin: 8, stops: 1, stopWaitMin: 2, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 };
const quote = quoteRide(norrmalm, input);
// 29 + 120 + 80 = 229; waiting (8 − 5 free min, owner Q41) 3 × 12.26 = 36.78; stop 15; stop wait 2 × 5 = 10 → 290.78; app fee 10% → 319.86 → 320
assert(quote.total === 320, `quote total ${quote.total}`);
// Owner 2026-10-27: waiting money is 100 % the driver's: 80 % of (290.78 − 36.78 − 10) = 195.20, + 36.78 + 10 = 241.98.
assert(quote.driverGets === 241.98, `driver gets 80% of the ride and stop fee plus all the waiting, got ${quote.driverGets}`);
// Owner 2026-10-27: ONE seat fee, only on Child Seat; every Child Seat ride includes one seat.
assert(!PRICE_ROWS.some((row) => (row.field as string) === "babySeatFee") && PRICE_ROWS.some((row) => row.field === "childSeatFee"), "one seat fee row");
assert(norrmalm.prices.economy.childSeatFee === 0 && norrmalm.prices.child_seat.childSeatFee === 15, "seat fee 15 kr on Child Seat only");
assert(!quote.lines.some((line) => line.label === "Child seat"), "no seat on another car type");
const childQuote = quoteRide(norrmalm, { ...input, categoryId: "child_seat", waitMin: 0, stops: 0, stopWaitMin: 0 });
assert(childQuote.lines.filter((line) => line.label === "Child seat").map((line) => line.amount).join() === "15", "a Child Seat ride includes its one seat once");
assert(rowApplies("childSeatFee", "child_seat") && !rowApplies("childSeatFee", "economy") && rowApplies("base", "economy"), "seat row only on Child Seat");
assert(!defaultZoneBook("Z001").smart.enabled, "smart surge is off until the admin switches it on");
// Waiting matches the driver app: 12.26 kr/min (Premium 16.90), 65 kr no-show fee, Premium 5 and XL 3 free minutes.
assert(norrmalm.prices.economy.waitPerMin === 12.26 && norrmalm.prices.premium.waitPerMin === 16.9 && norrmalm.prices.comfort.waitPerMin === 12.26, "waiting per minute");
assert(norrmalm.prices.economy.noShowFee === 65 && norrmalm.prices.premium.noShowFee === 65, "no-show fee");
assert(norrmalm.prices.economy.freeWaitMin === 5 && norrmalm.prices.premium.freeWaitMin === 5 && norrmalm.prices.xl.freeWaitMin === 3, "free wait: 5 min, XL 3 (owner Q41)");
// The rider's free cancel time and cancel fee are set in Dispatch › Rider cancel fees only. Older saves that still have them open fine.
assert(!PRICE_ROWS.some((row) => ["cancelFee", "freeCancelMin"].includes(row.field)) && PRICE_ROWS.some((row) => row.field === "noShowFee" && row.group === "Cancellation"), "no rider cancel fee in Pricing; the no-show fee stays");
const oldSave = normalizeStore({ ...emptyPricingStore(), zones: { Z001: { ...defaultZoneBook("Z001"), prices: { economy: { ...norrmalm.prices.economy, cancelFee: 40, freeCancelMin: 2 } } } } });
const reopened = zoneBook(oldSave, "Z001").prices.economy as Record<string, unknown>;
assert(!("cancelFee" in reopened) && !("freeCancelMin" in reopened) && reopened.noShowFee === 65 && reopened.base === norrmalm.prices.economy.base, "an older save with the cancel fields still opens, without them");
const surgedQuote = quoteRide(norrmalm, { ...input, waitMin: 0, stops: 0, stopWaitMin: 0, surge: 1.5 });
assert(surgedQuote.lines.some((line) => line.kind === "surge" && line.amount === 114.5), "surge applies to the trip part");
assert(quoteRide(norrmalm, { ...input, km: 0.5, minutes: 1, waitMin: 0, stops: 0, stopWaitMin: 0 }).lines.some((line) => line.kind === "limit"), "minimum fare applies");
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

// A-O2: a 0 base fare is refused (owner decision), so it cannot be published.
{
  const zero = structuredClone(norrmalm);
  zero.prices.economy.base = 0;
  assert(validateZoneBook(zero, store.categories).some((problem) => problem.path === "prices.economy.base" && problem.message.includes("above 0")), "a 0 base fare is refused");
  const small = structuredClone(norrmalm);
  small.prices.economy.base = 1;
  assert(!validateZoneBook(small, store.categories).some((problem) => problem.path === "prices.economy.base"), "a 1 kr base fare is still allowed");
  const freeStop = structuredClone(norrmalm);
  freeStop.prices.economy.extraStopFee = 0;
  assert(!validateZoneBook(freeStop, store.categories).some((problem) => problem.path === "prices.economy.extraStopFee"), "other price fields may still be 0");
}

// A-O3: a price change of more than 50 % up or down from the published value is listed for "Are you sure?".
{
  assert(isLargePriceChange(100, 151) && isLargePriceChange(100, 49) && !isLargePriceChange(100, 150) && !isLargePriceChange(100, 50) && !isLargePriceChange(100, 100), "the limit is more than 50 % either way");
  assert(isLargePriceChange(0, 5) && !isLargePriceChange(0, 0), "any rise from a published 0 is large");
  const published = zoneBook(store, "Z001");
  assert(largePriceChanges(published, structuredClone(published), store.categories).length === 0, "no change, nothing to confirm");
  const draft = structuredClone(published);
  draft.prices.economy.base = published.prices.economy.base * 2;
  draft.prices.economy.perKm = published.prices.economy.perKm * 1.2;
  draft.fees.reservationFee = published.fees.reservationFee / 4;
  draft.prices.economy.freeWaitMin = published.prices.economy.freeWaitMin * 3;
  const lines = largePriceChanges(published, draft, store.categories, "Norrmalm");
  assert(lines.some((line) => line.startsWith("Norrmalm · Movera Base fare") && line.includes("+100%")), `a doubled base fare is listed: ${lines.join(" | ")}`);
  assert(lines.some((line) => line.startsWith("Norrmalm · Reservation fee") && line.includes("−75%")), "a fee cut by 75 % is listed");
  assert(!lines.some((line) => line.includes("Price per km")), "a 20 % change is not listed");
  assert(!lines.some((line) => line.includes("Free waiting")), "free waiting minutes are not a price");
}
// Owner 2026-10-27: a very high price asks "Are you sure?" too, even when it was already that high when published
// (more than 3 times Movera's own price for the car type in that market).
{
  const published = zoneBook(store, "Z001");
  const high = structuredClone(published);
  high.prices.comfort.perKm = published.prices.comfort.perKm * 1.4;
  assert(!largePriceChanges(published, high, store.categories).some((line) => line.includes("very high")), "40 % above Movera's price is not very high");
  high.prices.comfort.perKm = defaultCategoryPrice("comfort", "SE").perKm * 3 + 1;
  const already = structuredClone(high);
  const lines = largePriceChanges(already, high, store.categories, "Norrmalm");
  assert(lines.some((line) => line.startsWith("Norrmalm · Comfort Price per km") && line.includes("very high")), `a very high price is listed: ${lines.join(" | ")}`);
}
console.log("price checks ok");

// Q29: commission, pickup pay and surge caps follow the same "more than 50 % → Are you sure?" rule.
{
  const published = zoneBook(store, "Z001");
  const draft = structuredClone(published);
  draft.commission.economy = (published.commission.economy ?? 20) * 2;
  draft.pickupPay.rates.economy.ranges[1].krPerKm = published.pickupPay.rates.economy.ranges[1].krPerKm * 3 + 1;
  draft.fleetCommissionPct = published.fleetCommissionPct * 1.1;
  const profile = draft.smart.profiles[0];
  if (profile) profile.cap = profile.cap * 2;
  const lines = largePriceChanges(published, draft, store.categories, "Norrmalm");
  assert(lines.some((line) => line.startsWith("Norrmalm · Movera commission")), `a doubled commission is listed: ${lines.join(" | ")}`);
  assert(lines.some((line) => line.startsWith("Norrmalm · Movera pickup pay 1–+ km per km")), `a tripled pickup pay is listed: ${lines.join(" | ")}`);
  assert(!lines.some((line) => line.includes("Fleet commission")), "a 10 % change is not listed");
  if (profile) assert(lines.some((line) => line.startsWith(`Norrmalm · Surge cap ${profile.name}`)), "a doubled surge cap is listed");
}

// Q28: Undo and History restore ask "Are you sure?" by the same rule as Publish.
{
  const base = zoneBook(store, "Z001");
  const doubled = { ...base, prices: { ...base.prices, economy: { ...base.prices.economy, base: base.prices.economy.base * 2 } } };
  const one = publishZones(store, { Z001: doubled }, "nora", "Double base", AT);
  const undo = undoLastPublish(one.store, "nora", AT);
  const undoLines = largeStoreChanges(one.store, undo.store);
  assert(undoLines.some((line) => line.includes("Base fare") && line.includes("−50%")) === false, "halving is exactly 50 %, not more");
  const tripled = { ...base, prices: { ...base.prices, economy: { ...base.prices.economy, base: base.prices.economy.base * 3 } } };
  const two = publishZones(store, { Z001: tripled }, "nora", "Triple base", AT);
  const undoTwo = undoLastPublish(two.store, "nora", AT);
  assert(largeStoreChanges(two.store, undoTwo.store).some((line) => line.includes("Base fare") && line.includes("−67%")), "undoing a tripled base fare asks first");
  const restore = restoreRevision(two.store, two.store.history[0]!.rev, "nora", AT);
  assert(restore.error !== undefined, "the live revision cannot be restored");
  const three = publishZones(two.store, { Z001: { ...zoneBook(two.store, "Z001"), prices: { ...zoneBook(two.store, "Z001").prices, economy: { ...zoneBook(two.store, "Z001").prices.economy, base: base.prices.economy.base } } } }, "nora", "Back", AT);
  const again = restoreRevision(three.store, two.store.history[0]!.rev, "nora", AT);
  assert(!again.error && largeStoreChanges(three.store, again.store).some((line) => line.includes("Base fare") && line.includes("+200%")), "restoring a tripled revision asks first");
  assert(largeStoreChanges(three.store, three.store).length === 0, "nothing new, nothing to confirm");
}
console.log("large change checks ok");

// C-24 / Q36: money splits are exact per currency and the lines add up to the total.
{
  const decimals = (value: number) => (String(value).split(".")[1] ?? "").length;
  for (const [zone, digits] of [[tunis, 3], [paris, 2], [norrmalm, 2]] as const) {
    for (const surge of [1, 1.3, 2.7]) {
      const q = quoteRide(zone, { ...input, surge, km: 13.7, minutes: 23 });
      const unit = 10 ** digits;
      const sumMinor = q.lines.reduce((sum, line) => sum + Math.round(line.amount * unit), 0);
      assert(sumMinor === Math.round(q.total * unit), `${zone.zoneId}: lines ${sumMinor} add up to the total ${q.total}`);
      assert(Math.round(q.driverGets * unit) + Math.round(q.moveraGets * unit) === Math.round(q.total * unit), `${zone.zoneId}: driver + Movera = total`);
      for (const value of [q.total, q.driverGets, q.moveraGets, q.appFee, ...q.lines.map((line) => line.amount)]) assert(decimals(value) <= digits, `${zone.zoneId}: ${value} has at most ${digits} decimals`);
    }
  }
  const rounded = quoteRide(tunis, { ...input, km: 13.7, minutes: 23 });
  assert(rounded.lines.some((line) => line.kind === "rounding") || rounded.lines.reduce((sum, line) => sum + line.amount, 0).toFixed(3) === rounded.total.toFixed(3), "price rounding is shown as its own line");
}
console.log("exact split checks ok");
