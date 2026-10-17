import { addPickupRange, completePickupPay, convertPickupPay, diffPickupPay, pickupPayFor, pickupRangeFor, pickupRangeIndex, rangeLabel, removePickupRange, updatePickupRange, validatePickupPay, validatePickupRanges, type PickupRange, type PickupRate } from "./pickupPay.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// Movera example: 0–10, >10–20, >20–40, >40 and above.
const ranges: PickupRange[] = [
  { fromKm: 0, toKm: 10, krPerKm: 3, krPerMinute: 1 },
  { fromKm: 10, toKm: 20, krPerKm: 4, krPerMinute: 1.5 },
  { fromKm: 20, toKm: 40, krPerKm: 5, krPerMinute: 2 },
  { fromKm: 40, toKm: null, krPerKm: 6, krPerMinute: 2.5 },
];

// Range lookup: ends are included, starts are not (the first also holds 0).
assert(pickupRangeIndex(ranges, 0) === 0, "0 km is in the first range");
assert(pickupRangeIndex(ranges, 4.2) === 0, "4.2 km is in 0–10");
assert(pickupRangeIndex(ranges, 10) === 0, "exactly 10 km is in 0–10");
assert(pickupRangeIndex(ranges, 10.01) === 1, "10.01 km is in >10–20");
assert(pickupRangeIndex(ranges, 20) === 1, "exactly 20 km is in >10–20");
assert(pickupRangeIndex(ranges, 40) === 2, "exactly 40 km is in >20–40");
assert(pickupRangeIndex(ranges, 41) === 3 && pickupRangeIndex(ranges, 500) === 3, "above 40 is in the open range");
assert(pickupRangeIndex(ranges.slice(0, 2), 35) === 1, "longer than a closed last range uses the last range");
assert(pickupRangeIndex([], 5) === -1 && pickupRangeIndex(undefined, 5) === -1 && pickupRangeFor(undefined, 5) === undefined, "no ranges, no match");
assert(pickupRangeIndex(ranges, Number.NaN) === 0 && pickupRangeIndex(ranges, -3) === 0, "bad km falls in the first range");
assert(pickupRangeFor(ranges, 15)?.krPerKm === 4, "range for 15 km");
assert(rangeLabel(ranges[0]) === "0–10 km" && rangeLabel(ranges[1]) === ">10–20 km" && rangeLabel(ranges[3]) === ">40 km and above", "labels");

// Pay: the whole leg is paid at the matching range's rate.
const movera: PickupRate = { enabled: true, perKm: 2, perMin: 0.5, freeKmOn: false, freeKm: 1, freeMinOn: false, freeMin: 2, ranges };
const at10 = pickupPayFor(movera, 10, 12);
assert(at10.total === 42 && at10.rangeIndex === 0 && at10.perKm === 3, `10 km / 12 min: 10 × 3 + 12 × 1 = 42, got ${at10.total}`);
const at15 = pickupPayFor(movera, 15, 20);
assert(at15.total === 90 && at15.rangeIndex === 1, `15 km / 20 min: 15 × 4 + 20 × 1.5 = 90 (whole leg, not split), got ${at15.total}`);
assert(pickupPayFor(movera, 50, 40).total === 400, "50 km / 40 min: 50 × 6 + 40 × 2.5 = 400");
assert(pickupPayFor({ ...movera, freeKmOn: true, freeMinOn: true }, 10, 12).total === 37, "free part still taken off: 9 × 3 + 10 × 1 = 37");
assert(pickupPayFor({ ...movera, enabled: false }, 15, 20).total === 0, "an off category pays nothing, even with ranges");

// No ranges: the single rate, as before.
const single = pickupPayFor({ ...movera, ranges: [] }, 15, 20);
assert(single.total === 40 && single.rangeIndex === null && single.perKm === 2, "empty ranges use the single rate");
assert(pickupPayFor({ ...movera, ranges: undefined }, 15, 20).total === 40, "missing ranges use the single rate");

// Validation.
const path = "pickup.movera";
assert(validatePickupRanges(ranges, path, "Movera").length === 0, "the Movera example is valid");
assert(validatePickupRanges(ranges.slice(0, 3), path, "Movera").length === 0, "a closed last range is valid");
assert(validatePickupRanges(undefined, path, "Movera").length === 0 && validatePickupRanges([], path, "Movera").length === 0, "no ranges is valid");
const paths = (list: PickupRange[]) => validatePickupRanges(list, path, "Movera").map((problem) => problem.path);
assert(paths([{ ...ranges[0], fromKm: 2 }, ...ranges.slice(1)]).includes("pickup.movera.ranges.0.fromKm"), "must start at 0");
assert(paths([ranges[0], { ...ranges[1], fromKm: 12 }, ...ranges.slice(2)]).includes("pickup.movera.ranges.1.fromKm"), "gap is caught");
assert(paths([ranges[0], { ...ranges[1], fromKm: 8 }, ...ranges.slice(2)]).includes("pickup.movera.ranges.1.fromKm"), "overlap is caught");
assert(paths([ranges[0], { ...ranges[1], toKm: 10 }, { ...ranges[2], fromKm: 10 }, ranges[3]]).includes("pickup.movera.ranges.1.toKm"), "a range must end after it starts (ascending)");
assert(paths([ranges[0], { ...ranges[1], toKm: 5 }, { ...ranges[2], fromKm: 5 }, ranges[3]]).includes("pickup.movera.ranges.1.toKm"), "descending is caught");
assert(paths([ranges[0], { ...ranges[1], toKm: null }, ranges[2], ranges[3]]).includes("pickup.movera.ranges.1.toKm"), "only the last can be and above");
assert(paths([{ ...ranges[0], krPerKm: -1, krPerMinute: Number.NaN }]).join() === "pickup.movera.ranges.0.krPerKm,pickup.movera.ranges.0.krPerMinute", "rates must be 0 or more");
const pay = completePickupPay(undefined, ["movera"]);
const problems = validatePickupPay({ ...pay, rates: { movera: { ...movera, ranges: [ranges[0], { ...ranges[1], fromKm: 12 }] } } }, [{ id: "movera", label: "Movera" }]);
assert(problems.length === 1 && problems[0].message.includes("gap"), `zone validation includes ranges: ${problems.map((item) => item.message).join(" | ")}`);

// Editing keeps the list without gaps.
const first = addPickupRange({ ...movera, ranges: undefined });
assert(first.length === 1 && first[0].fromKm === 0 && first[0].toKm === 10 && first[0].krPerKm === 2 && first[0].krPerMinute === 0.5, "first range is 0–10 at the single rate");
const second = addPickupRange({ ...movera, ranges: first });
assert(second.length === 2 && second[1].fromKm === 10 && second[1].toKm === null, "next range starts at the last end, and above");
const third = addPickupRange({ ...movera, ranges: second });
assert(third[1].toKm === 20 && third[2].fromKm === 20 && third[2].toKm === null, "an open last range is closed 10 km on");
assert(validatePickupRanges(third, path, "Movera").length === 0, "added ranges are valid");
const moved = updatePickupRange(ranges, 1, { toKm: 25 });
assert(moved[2].fromKm === 25 && validatePickupRanges(moved, path, "Movera").length === 0, "the next range follows a changed end");
const removed = removePickupRange(ranges, 1);
assert(removed.length === 3 && removed[1].fromKm === 10 && removed[1].toKm === 40 && validatePickupRanges(removed, path, "Movera").length === 0, "deleting a middle range closes the gap");
assert(removePickupRange(ranges, 0)[0].fromKm === 0, "deleting the first range moves the next to 0");

// Stored ranges survive, are copied with money converted, and show in the change list.
const stored = completePickupPay({ rates: { movera } }, ["movera"]);
assert(stored.rates.movera.ranges?.length === 4, "stored ranges are kept");
assert(completePickupPay({ rates: { movera: { ...movera, ranges: undefined } } }, ["movera"]).rates.movera.ranges === undefined, "older data has no ranges");
const euros = convertPickupPay(stored, (value) => Math.round(value * 10) / 100);
assert(euros.rates.movera.ranges?.[1].krPerKm === 0.4 && euros.rates.movera.ranges?.[1].toKm === 20, "copy converts range money, keeps km");
assert(stored.rates.movera.ranges?.[1].krPerKm === 4, "copy does not change the source");
const lines = diffPickupPay({ ...stored, rates: { movera: { ...movera, ranges: undefined } } }, stored, [{ id: "movera", label: "Movera" }]);
assert(lines.length === 1 && lines[0].startsWith("Movera · pickup ranges one rate → 0–10 km 3/km 1/min"), `diff: ${lines.join(" | ")}`);
console.log("pickup ranges ok");
