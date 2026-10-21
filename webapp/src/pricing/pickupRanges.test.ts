import { addPickupRange, cheaperFartherRanges, completePickupPay, convertPickupPay, diffPickupPay, maxReachedAtKm, pickupPayFor, pickupRangeFor, pickupRangeIndex, rangeLabel, removePickupRange, singleRange, updatePickupRange, validatePickupPay, validatePickupRanges, type PickupRange, type PickupRate } from "./pickupPay.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const FEE_OFF = { live: { on: false, amount: 15 }, reservation: { on: false, amount: 20 } };

// Movera example: 0–10, >10–20, >20–40, >40 and above.
const ranges: PickupRange[] = [
  { fromKm: 0, toKm: 10, krPerKm: 3, krPerMinute: 1 },
  { fromKm: 10, toKm: 20, krPerKm: 4, krPerMinute: 1.5 },
  { fromKm: 20, toKm: 40, krPerKm: 5, krPerMinute: 2 },
  { fromKm: 40, toKm: null, krPerKm: 6, krPerMinute: 2.5 },
];

// Range lookup: ends are included, starts are not (the first also holds 0).
assert(pickupRangeIndex(ranges, 0) === 0, "0 km is in the first range");
assert(pickupRangeIndex(ranges, 10) === 0, "exactly 10 km is in 0–10");
assert(pickupRangeIndex(ranges, 10.01) === 1, "10.01 km is in >10–20");
assert(pickupRangeIndex(ranges, 41) === 3 && pickupRangeIndex(ranges, 500) === 3, "above 40 is in the open range");
assert(pickupRangeIndex(ranges.slice(0, 2), 35) === 1, "longer than a closed last range uses the last range");
assert(pickupRangeIndex([], 5) === -1 && pickupRangeIndex(undefined, 5) === -1 && pickupRangeFor(undefined, 5) === undefined, "no ranges, no match");
assert(pickupRangeFor(ranges, 15)?.krPerKm === 4, "range for 15 km");
assert(rangeLabel(ranges[0]) === "0–10 km" && rangeLabel(ranges[1]) === ">10–20 km" && rangeLabel(ranges[3]) === ">40 km and above", "labels");

// Pay is tiered: each km at its own range's rate; minutes split across the ranges by km share.
const movera: PickupRate = { enabled: true, maxPerRide: null, ranges, riderFee: FEE_OFF };
const at10 = pickupPayFor(movera, 10, 12);
assert(at10.total === 42 && at10.parts.length === 1 && at10.parts[0].rangeIndex === 0, `10 km / 12 min: 10 × 3 + 12 × 1 = 42, got ${at10.total}`);
const at15 = pickupPayFor(movera, 15, 20);
// 0–10: 10 km × 3 + 13.33 min × 1 = 43.33; >10–20: 5 km × 4 + 6.67 min × 1.5 = 30 → 73.33
assert(at15.total === 73.33 && at15.parts.length === 2 && at15.parts[0].km === 10 && at15.parts[1].km === 5 && at15.parts[1].minutes === 6.67, `15 km / 20 min is split across two ranges: 73.33, got ${at15.total} (${JSON.stringify(at15.parts)})`);
assert(pickupPayFor(movera, 50, 40).total === 302, `50 km / 40 min: (30 + 8) + (40 + 12) + (100 + 32) + (60 + 20) = 302, got ${pickupPayFor(movera, 50, 40).total}`);
assert(pickupPayFor({ ...movera, ranges: ranges.slice(0, 2) }, 35, 0).total === 130, "longer than a closed last range: the rest is paid at the last range (10 × 3 + 25 × 4)");
assert(pickupPayFor({ ...movera, enabled: false }, 15, 20).total === 0, "an off category pays nothing, even with ranges");
assert(pickupPayFor({ ...movera, ranges: [] }, 15, 20).total === 0, "no ranges, nothing to pay");
assert(pickupPayFor(movera, 0, 5).total === 5 && pickupPayFor(movera, 0, 5).parts[0].rangeIndex === 0, "0 km: all minutes in the first range");

// Farther never pays less, and the maximum caps the sum of the ranges.
assert(pickupPayFor(movera, 10.1, 12).total > at10.total, "driving a little farther pays a little more");
const cheaper: PickupRate = { ...movera, ranges: [{ fromKm: 0, toKm: 10, krPerKm: 4, krPerMinute: 0 }, { fromKm: 10, toKm: null, krPerKm: 2, krPerMinute: 0 }] };
assert(pickupPayFor(cheaper, 10, 0).total === 40 && pickupPayFor(cheaper, 11, 0).total === 42, "a cheaper farther range still never pays less than a shorter pickup");
assert(cheaperFartherRanges(cheaper.ranges).join() === "1" && cheaperFartherRanges(ranges).length === 0, "the cheaper farther range is pointed out");
const capped = pickupPayFor({ ...movera, maxPerRide: 50 }, 15, 20);
assert(capped.total === 50 && capped.capped && capped.beforeMax === 73.33, "the maximum applies to the total of all ranges");
assert(maxReachedAtKm({ ...movera, maxPerRide: 50 }, 0) === 15.1, `with 50 kr max and no minutes the cap starts just above 15 km (30 + 5 × 4 = 50), got ${maxReachedAtKm({ ...movera, maxPerRide: 50 }, 0)}`);
assert(maxReachedAtKm(movera, 1) === null && maxReachedAtKm({ ...movera, maxPerRide: 100000 }, 1) === null, "no maximum, or never reached");

// Validation.
const path = "pickup.movera";
assert(validatePickupRanges(ranges, path, "Movera").length === 0, "the Movera example is valid");
assert(validatePickupRanges(ranges.slice(0, 3), path, "Movera").length === 0, "a closed last range is valid");
assert(validatePickupRanges([], path, "Movera").length === 1 && validatePickupRanges(undefined, path, "Movera")[0].message.includes("at least one"), "a category needs at least one range");
const paths = (list: PickupRange[]) => validatePickupRanges(list, path, "Movera").map((problem) => problem.path);
assert(paths([{ ...ranges[0], fromKm: 2 }, ...ranges.slice(1)]).includes("pickup.movera.ranges.0.fromKm"), "must start at 0");
assert(paths([ranges[0], { ...ranges[1], fromKm: 12 }, ...ranges.slice(2)]).includes("pickup.movera.ranges.1.fromKm"), "gap is caught");
assert(paths([ranges[0], { ...ranges[1], fromKm: 8 }, ...ranges.slice(2)]).includes("pickup.movera.ranges.1.fromKm"), "overlap is caught");
assert(paths([ranges[0], { ...ranges[1], toKm: 10 }, { ...ranges[2], fromKm: 10 }, ranges[3]]).includes("pickup.movera.ranges.1.toKm"), "a range must end after it starts");
assert(paths([ranges[0], { ...ranges[1], toKm: null }, ranges[2], ranges[3]]).includes("pickup.movera.ranges.1.toKm"), "only the last can be and above");
assert(paths([{ ...ranges[0], krPerKm: -1, krPerMinute: Number.NaN }]).join() === "pickup.movera.ranges.0.krPerKm,pickup.movera.ranges.0.krPerMinute", "rates must be 0 or more");
const pay = completePickupPay(undefined, ["movera"]);
const problems = validatePickupPay({ ...pay, rates: { movera: { ...movera, ranges: [ranges[0], { ...ranges[1], fromKm: 12 }] } } }, [{ id: "movera", label: "Movera" }]);
assert(problems.length === 1 && problems[0].message.includes("gap"), `zone validation includes ranges: ${problems.map((item) => item.message).join(" | ")}`);

// Editing keeps the list without gaps; the last range can never be removed.
const one = singleRange(2, 0.5);
const second = addPickupRange({ ...movera, ranges: one });
assert(second.length === 2 && second[0].toKm === 10 && second[1].fromKm === 10 && second[1].toKm === null && second[1].krPerKm === 2, "adding to one open range closes it at 10 km and adds an and-above range with the same rates");
const third = addPickupRange({ ...movera, ranges: second });
assert(third[1].toKm === 20 && third[2].fromKm === 20 && third[2].toKm === null, "an open last range is closed 10 km on");
assert(validatePickupRanges(third, path, "Movera").length === 0, "added ranges are valid");
assert(addPickupRange({ ...movera, ranges: [] }).length === 2 && addPickupRange({ ...movera, ranges: [] })[0].fromKm === 0, "adding to nothing starts from a single range");
const moved = updatePickupRange(ranges, 1, { toKm: 25 });
assert(moved[2].fromKm === 25 && validatePickupRanges(moved, path, "Movera").length === 0, "the next range follows a changed end");
const removed = removePickupRange(ranges, 1);
assert(removed.length === 3 && removed[1].fromKm === 10 && removed[1].toKm === 40 && validatePickupRanges(removed, path, "Movera").length === 0, "deleting a middle range closes the gap");
assert(removePickupRange(ranges, 0)[0].fromKm === 0, "deleting the first range moves the next to 0");
assert(removePickupRange(one, 0).length === 1, "the only range stays");

// Stored ranges survive, are copied with money converted, and show in the change list.
const stored = completePickupPay({ rates: { movera } }, ["movera"]);
assert(stored.rates.movera.ranges.length === 4, "stored ranges are kept");
const euros = convertPickupPay({ ...stored, rates: { movera: { ...stored.rates.movera, maxPerRide: 100 } } }, (value) => Math.round(value * 10) / 100);
assert(euros.rates.movera.ranges[1].krPerKm === 0.4 && euros.rates.movera.ranges[1].toKm === 20 && euros.rates.movera.maxPerRide === 10 && euros.rates.movera.riderFee.live.amount === 1.5, "copy converts range money, the maximum and the rider fee, keeps km");
assert(stored.rates.movera.ranges[1].krPerKm === 4, "copy does not change the source");
const lines = diffPickupPay({ ...stored, rates: { movera: { ...movera, ranges: one } } }, stored, [{ id: "movera", label: "Movera" }]);
assert(lines.length === 1 && lines[0].startsWith("Movera · pickup ranges 0 km and above 2/km 0.5/min → 0–10 km 3/km 1/min"), `diff: ${lines.join(" | ")}`);
console.log("pickup ranges ok");
