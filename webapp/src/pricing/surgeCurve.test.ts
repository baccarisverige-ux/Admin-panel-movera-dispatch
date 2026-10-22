import assert from "node:assert/strict";
import test from "node:test";
import { cleanPoints, curveIssue, curvePeak, curvePreset, curveSteps, minutesUntil, surgeAt, valueAt, STEP_MIN } from "./surgeCurve.ts";
import { emptyPricingStore, startManualSurge, zoneLive } from "./zonePricing.ts";
import { surgeLevel } from "./surge.ts";

test("presets start at 0, end at the duration and stay between ×1.0 and the top", () => {
  for (const kind of ["flat", "rampDown", "rampUp", "peak"] as const) {
    const points = curvePreset(kind, 60, 1.8);
    assert.equal(points[0].atMin, 0, kind);
    assert.equal(points[points.length - 1].atMin, 60, kind);
    for (const point of points) assert.ok(point.multiplier >= 1 && point.multiplier <= 1.8, kind);
    assert.equal(curveIssue(points, 60, 6), null, kind);
  }
  assert.deepEqual(curvePreset("flat", 30, 1.5).map((point) => point.multiplier), [1.5, 1.5]);
  assert.equal(curvePreset("rampDown", 60, 2)[0].multiplier, 2);
  assert.equal(curvePreset("rampDown", 60, 2).at(-1)!.multiplier, 1);
  assert.equal(curvePeak(curvePreset("peak", 60, 2.4)), 2.4);
});

test("the curve is straight between points", () => {
  const points = [{ atMin: 0, multiplier: 2 }, { atMin: 20, multiplier: 1 }];
  assert.equal(valueAt(points, 0), 2);
  assert.equal(valueAt(points, 10), 1.5);
  assert.equal(valueAt(points, 30), 1);
});

test("riders get 5-minute steps, each from the start of its slot", () => {
  const points = [{ atMin: 0, multiplier: 2 }, { atMin: 60, multiplier: 1 }];
  const steps = curveSteps(points, 60);
  assert.equal(steps.length, 60 / STEP_MIN);
  assert.deepEqual(steps.slice(0, 3), [{ fromMin: 0, multiplier: 2 }, { fromMin: 5, multiplier: 1.9 }, { fromMin: 10, multiplier: 1.8 }]);
});

test("surgeAt gives the current step, and nothing before the start or from the end", () => {
  const start = Date.parse("2026-10-22T10:00:00Z");
  const curve = { startAt: new Date(start).toISOString(), endAt: new Date(start + 60 * 60_000).toISOString(), points: [{ atMin: 0, multiplier: 2 }, { atMin: 60, multiplier: 1 }] };
  assert.equal(surgeAt(curve, start - 1), null);
  assert.equal(surgeAt(curve, start), 2);
  assert.equal(surgeAt(curve, start + 4 * 60_000 + 59_000), 2, "still the first step");
  assert.equal(surgeAt(curve, start + 5 * 60_000), 1.9, "next step after 5 minutes");
  assert.equal(surgeAt(curve, start + 60 * 60_000), null, "the timer ended: back to normal");
});

test("points are cleaned: sorted, inside the time and the cap, ends filled", () => {
  const clean = cleanPoints([{ atMin: 40, multiplier: 9 }, { atMin: 10, multiplier: 0.5 }], 60, 6);
  assert.deepEqual(clean, [{ atMin: 0, multiplier: 1 }, { atMin: 10, multiplier: 1 }, { atMin: 40, multiplier: 6 }, { atMin: 60, multiplier: 6 }]);
  assert.match(curveIssue([{ atMin: 0, multiplier: 1 }], 60, 6) ?? "", /two points/);
});

test("exact end time turns into minutes until that clock time", () => {
  const tenAm = 10 * 60;
  assert.equal(minutesUntil("10:30", tenAm), 30);
  assert.equal(minutesUntil("09:00", tenAm), 23 * 60, "earlier today means tomorrow");
  assert.equal(minutesUntil("10:00", tenAm), 24 * 60, "now means the same time tomorrow");
  assert.equal(minutesUntil("25:00", tenAm), null);
});

test("a manual surge with a curve stores it, shows its peak and ends by itself", () => {
  const at = "2026-10-22T10:00:00.000Z";
  const result = startManualSurge(emptyPricingStore(), "Z001", 1.5, 30, "nora", "Manual surge", at, curvePreset("rampDown", 30, 1.8));
  assert.equal(result.error, undefined);
  const manual = zoneLive(result.store, "Z001").manual!;
  assert.equal(manual.multiplier, 1.8);
  assert.equal(manual.curve?.points.length, 3);
  assert.equal(Date.parse(manual.endsAt) - Date.parse(at), 30 * 60_000);
  assert.equal(surgeLevel(surgeAt(manual.curve!, Date.parse(at))!), "mid");
  const flat = startManualSurge(emptyPricingStore(), "Z001", 1.5, 30, "nora", "x", at, [{ atMin: 0, multiplier: 1 }, { atMin: 30, multiplier: 1 }]);
  assert.match(flat.error ?? "", /above ×1.0/);
  assert.match(startManualSurge(emptyPricingStore(), "Z001", 1.5, 3, "nora", "x", at).error ?? "", /5 min/);
});
