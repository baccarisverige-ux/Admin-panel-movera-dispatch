import { completePickupPay, defaultPickupPay, diffPickupPay, offerGetsPickupPay, pickupPayFor, pickupSplit, riderPickupFee, singleRange, validatePickupPay, type PickupRate } from "./pickupPay.ts";
import { copyInto, emptyPricingStore, publishZones, quoteRide, undoLastPublish, validateZoneBook, zoneBook } from "./zonePricing.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const AT = "2026-10-16T10:00:00.000Z";
const FEE_OFF = { live: { on: false, amount: 15 }, reservation: { on: false, amount: 20 } };

// Comfort 3 kr/km + 1 kr/min for every km (one range), 4.2 km / 9 min → 21,60 kr.
const comfort: PickupRate = { enabled: true, maxPerRide: null, ranges: singleRange(3, 1), riderFee: FEE_OFF };
const plain = pickupPayFor(comfort, 4.2, 9);
assert(plain.kmPay === 12.6 && plain.minPay === 9 && plain.total === 21.6 && !plain.capped, `one range gives 21.60, got ${plain.total}`);

// The first km free is just a 0-rate first range; minutes split by km share: 3.2 × 3 + 9 × (3.2 / 4.2) × 1 = 9.60 + 6.86.
const firstFree: PickupRate = { ...comfort, ranges: [{ fromKm: 0, toKm: 1, krPerKm: 0, krPerMinute: 0 }, { fromKm: 1, toKm: null, krPerKm: 3, krPerMinute: 1 }] };
const free = pickupPayFor(firstFree, 4.2, 9);
assert(free.total === 16.46 && free.parts.length === 2 && free.parts[0].pay === 0 && free.parts[1].km === 3.2, `first km free: 9.60 + 6.86 = 16.46, got ${free.total}`);
assert(pickupPayFor(firstFree, 0.8, 3).total === 0, "inside the free range pays 0");
assert(pickupPayFor({ ...comfort, enabled: false }, 4.2, 9).total === 0, "an off category pays nothing");
assert(pickupPayFor(undefined, 4.2, 9).total === 0, "an unknown category pays nothing");
assert(pickupPayFor(comfort, 60, 90).total === 270, "no maximum unless one is set");
assert(pickupPayFor(comfort, -3, Number.NaN).total === 0, "bad input pays 0");

// The maximum per ride caps the total of all ranges.
const capped = pickupPayFor({ ...comfort, maxPerRide: 50 }, 60, 90);
assert(capped.total === 50 && capped.capped && capped.beforeMax === 270, `capped at 50, got ${capped.total}`);
assert(pickupPayFor({ ...comfort, maxPerRide: 50 }, 4.2, 9).total === 21.6, "below the maximum nothing changes");
assert(pickupPayFor({ ...comfort, maxPerRide: 0 }, 4.2, 9).total === 0, "a maximum of 0 pays 0");

// Who gets pickup pay.
const pay = defaultPickupPay(["economy", "comfort", "premium"]);
assert(offerGetsPickupPay(pay, "radar", "comfort") && offerGetsPickupPay(pay, "nextTrip", "comfort"), "default offers are paid");
assert(!offerGetsPickupPay(pay, "scheduled", "comfort"), "Scheduled-list reservations are never paid");
assert(!offerGetsPickupPay({ ...pay, offers: { ...pay.offers, assigned: false } }, "assigned", "comfort"), "an offer kind can be turned off");
assert(!offerGetsPickupPay({ ...pay, rates: { ...pay.rates, comfort: { ...pay.rates.comfort, enabled: false } } }, "radar", "comfort"), "a category can be turned off");
assert(pay.rates.comfort.ranges.length === 2 && pay.rates.comfort.ranges[0].toKm === 1 && pay.rates.comfort.ranges[0].krPerKm === 0 && pay.rates.comfort.ranges[1].krPerKm === 3, "default: first km free, then the category rate");
assert(pay.rates.comfort.maxPerRide === null, "no maximum by default");

// The rider's fixed pickup fee: off by default; live rides and reservations have their own switch and amount.
assert(riderPickupFee(pay, "comfort", false) === 0 && riderPickupFee(pay, "comfort", true) === 0, "rider fee is off by default");
const withFee = { ...pay, rates: { ...pay.rates, comfort: { ...pay.rates.comfort, riderFee: { live: { on: true, amount: 15 }, reservation: { on: false, amount: 20 } } } } };
assert(riderPickupFee(withFee, "comfort", false) === 15 && riderPickupFee(withFee, "comfort", true) === 0, "live fee on, reservation fee off");
assert(riderPickupFee(withFee, "unknown", false) === 0, "unknown category has no fee");

// Paid from Movera's share; the rider's price stays the same.
const split = pickupSplit(169, 126.75, 16.6);
assert(split.riderPays === 169 && split.driverGets === 143.35 && split.commission === 42.25 && split.moveraKeeps === 25.65, "driver gets fare + pickup, Movera keeps its share − pickup");
assert(pickupSplit(80, 60, 30).moveraKeeps === -10, "Movera covers the difference when pickup pay is above its share");

// Older saved data converts to ranges: one rate + free first km → a 0-rate first range; free minutes are dropped.
const legacy = { enabled: true, perKm: 3, perMin: 1, freeKmOn: true, freeKm: 1, freeMinOn: true, freeMin: 2 };
const migrated = completePickupPay({ rates: { comfort: legacy as unknown as PickupRate } }, ["comfort", "pet"]);
assert(JSON.stringify(migrated.rates.comfort.ranges) === JSON.stringify(firstFree.ranges), `legacy free km becomes a free range: ${JSON.stringify(migrated.rates.comfort.ranges)}`);
assert(migrated.rates.comfort.maxPerRide === null && migrated.rates.comfort.riderFee.live.on === false && migrated.rates.comfort.riderFee.live.amount === 15, "legacy data gets no maximum and the rider fee off");
assert(migrated.rates.pet.ranges.length === 2 && migrated.rates.pet.ranges[1].krPerKm === 3 && migrated.offers.radar, "missing categories get defaults");
const noFree = completePickupPay({ rates: { comfort: { ...legacy, freeKmOn: false } as unknown as PickupRate } }, ["comfort"]);
assert(noFree.rates.comfort.ranges.length === 1 && noFree.rates.comfort.ranges[0].toKm === null && noFree.rates.comfort.ranges[0].krPerKm === 3, "legacy without free km is one range");
const legacyRanges = completePickupPay({ rates: { comfort: { ...legacy, ranges: [{ fromKm: 0, toKm: 10, krPerKm: 3, krPerMinute: 1 }, { fromKm: 10, toKm: null, krPerKm: 4, krPerMinute: 1 }] } as unknown as PickupRate } }, ["comfort"]);
assert(legacyRanges.rates.comfort.ranges.map((range) => `${range.fromKm}-${range.toKm}:${range.krPerKm}`).join(",") === "0-1:0,1-10:3,10-null:4", `legacy free km goes in front of saved ranges: ${JSON.stringify(legacyRanges.rates.comfort.ranges)}`);
const current = completePickupPay({ rates: { comfort: { ...comfort, maxPerRide: 40 } } }, ["comfort"]);
assert(current.rates.comfort.maxPerRide === 40 && current.rates.comfort.ranges.length === 1, "current data is kept as is");

// Validation and the change list.
const cats = [{ id: "comfort", label: "Comfort" }];
assert(validatePickupPay({ ...current, rates: { comfort: { ...comfort, ranges: [{ ...comfort.ranges[0], krPerKm: -1 }] } } }, cats)[0]?.path === "pickup.comfort.ranges.0.krPerKm", "negative pickup rate is caught");
assert(validatePickupPay({ ...current, rates: { comfort: { ...comfort, maxPerRide: -5 } } }, cats)[0]?.path === "pickup.comfort.maxPerRide", "negative maximum is caught");
assert(validatePickupPay({ ...current, rates: { comfort: { ...comfort, riderFee: { ...FEE_OFF, live: { on: true, amount: -1 } } } } }, cats)[0]?.path === "pickup.comfort.riderFee.live", "negative rider fee is caught");
assert(validatePickupPay({ ...current, rates: { comfort: { ...comfort, ranges: [] } } }, cats)[0]?.message.includes("at least one"), "a category needs one range");
const lines = diffPickupPay(current, { ...current, offers: { ...current.offers, radar: false }, rates: { comfort: { ...comfort, maxPerRide: 60, ranges: singleRange(3.5, 1), riderFee: { ...FEE_OFF, live: { on: true, amount: 15 } } } } }, cats);
assert(lines.includes("Comfort · pickup pay maximum per ride 40 → 60"), `maximum in the diff: ${lines.join(" | ")}`);
assert(lines.includes("Comfort · pickup ranges 0 km and above 3/km 1/min → 0 km and above 3.5/km 1/min"), `ranges in the diff: ${lines.join(" | ")}`);
assert(lines.includes("Comfort · rider pickup fee for live rides turned on") && lines.includes("Pickup pay for Radar trips turned off"), `diff lines: ${lines.join(" | ")}`);

// Pickup pay lives in the zone book: publish, history and undo cover it.
const store = emptyPricingStore();
const book = zoneBook(store, "Z001");
assert(book.pickupPay.rates.comfort.ranges[1].krPerKm === 3 && book.pickupPay.rates.economy.ranges[1].krPerKm === 2.5, "Stockholm defaults");
assert(validateZoneBook(book, store.categories).length === 0, "defaults are valid");
assert(!("longPickupFee" in book.prices.economy), "the rider long pickup fee is gone");
const edit = structuredClone(book);
edit.pickupPay.rates.comfort.ranges[1].krPerKm = 3.5;
edit.pickupPay.offers.nextTrip = false;
const published = publishZones(store, { Z001: edit }, "nora", "Pickup pay", AT);
assert(!published.error && published.changes.some((line) => line.startsWith("Norrmalm · Comfort · pickup ranges")), `publish lists pickup changes: ${published.changes.join(" | ")}`);
assert(zoneBook(published.store, "Z001").pickupPay.offers.nextTrip === false, "published pickup pay is stored");
assert(zoneBook(undoLastPublish(published.store, "nora", AT).store, "Z001").pickupPay.rates.comfort.ranges[1].krPerKm === 3, "undo brings the old pickup pay back");
const input = { categoryId: "comfort", km: 8, minutes: 18, waitMin: 0, stops: 0, stopWaitMin: 0, babySeats: 0, childSeats: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 };
const quote = quoteRide(zoneBook(published.store, "Z001"), input);
assert(quote.total === quoteRide(book, input).total, "driver pickup pay never changes the rider's price");
assert(quote.lines.every((line) => !/pickup/i.test(line.label)), "no pickup line on the rider's quote while the rider fee is off");

// The rider's fixed fee is a line in the price and goes to Movera, not into the driver's share.
const feeBook = structuredClone(book);
feeBook.pickupPay.rates.comfort.riderFee = { live: { on: true, amount: 15 }, reservation: { on: true, amount: 20 } };
const live = quoteRide(feeBook, input);
const resv = quoteRide(feeBook, { ...input, reservation: true });
const baseResv = quoteRide(book, { ...input, reservation: true });
assert(live.lines.some((line) => line.label === "Pickup fee" && line.amount === 15), `live quote has the 15 kr pickup fee: ${live.lines.map((line) => `${line.label} ${line.amount}`).join(" | ")}`);
assert(live.total === quote.total + 15 && live.driverGets === quote.driverGets && live.moveraGets === quote.moveraGets + 15, "the fee raises the rider's price and Movera's share only");
assert(resv.lines.some((line) => line.label === "Pickup fee" && line.amount === 20) && resv.total === baseResv.total + 20, "a reservation uses the reservation fee");
assert(validateZoneBook(feeBook, store.categories).length === 0, "fees on are valid");

// Copying converts the money.
const paris = copyInto(zoneBook(published.store, "Z001"), zoneBook(store, "FR-PC"), ["pickup"]);
assert(paris.pickupPay.rates.comfort.ranges[1].krPerKm === 0.33 && paris.pickupPay.offers.nextTrip === false, `3.50 kr is 0.33 € in Paris, got ${paris.pickupPay.rates.comfort.ranges[1].krPerKm}`);
assert(zoneBook(store, "FR-PC").pickupPay.rates.comfort.ranges[1].krPerKm === 0.29, "Paris defaults are in euros");
assert(zoneBook(store, "FR-PC").pickupPay.rates.comfort.riderFee.live.amount === 1.43, `Paris rider fee default is in euros, got ${zoneBook(store, "FR-PC").pickupPay.rates.comfort.riderFee.live.amount}`);
console.log("pickup pay ok");
