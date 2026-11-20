import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { isNoQueueArea, queueAreaWanted } from "./airportQueue.ts";
import { kpiRanges } from "./kpis.ts";

/** Launch click-through 2026-11-19 (admin-every): Zones › open zone, and Dashboard › Year. */

test("queue area: the server's 404 not_found (reason queue_area_not_found) means none drawn, not an error", () => {
  assert.equal(isNoQueueArea({ status: 404, code: "not_found", reason: "queue_area_not_found" }), true);
  assert.equal(isNoQueueArea({ status: 404, code: "not_found", reason: null }), true);
  assert.equal(isNoQueueArea({ status: 500, code: "internal" }), false);
  assert.equal(isNoQueueArea({ status: 403, code: "forbidden" }), false);
  assert.equal(isNoQueueArea(null), false);
});

test("queue area: only an airport zone asks the server (Z001, a city zone, sends no request)", () => {
  assert.equal(queueAreaWanted({ zoneId: "ARN", kind: "airport" }), true);
  assert.equal(queueAreaWanted({ zoneId: "Z001", kind: "city" }), false);
  assert.equal(queueAreaWanted({ zoneId: "", kind: "airport" }), false);
});

const MAX = (contract as unknown as { kpis: { maxDays: number } }).kpis.maxDays;
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;

test("KPIs Year: 2025-01-01..2026-11-19 is asked in parts of at most kpis.maxDays, covering every day once", () => {
  assert.equal(MAX, 400);
  const parts = kpiRanges("2025-01-01", "2026-11-19");
  assert.ok(parts.length >= 2);
  assert.equal(parts[0]!.fromDate, "2025-01-01");
  assert.equal(parts.at(-1)!.toDate, "2026-11-19");
  for (const part of parts) assert.ok(days(part.fromDate, part.toDate) <= MAX && part.fromDate <= part.toDate);
  for (let i = 1; i < parts.length; i += 1) assert.equal(days(parts[i - 1]!.toDate, parts[i]!.fromDate), 2);
  assert.equal(parts.reduce((n, p) => n + days(p.fromDate, p.toDate), 0), days("2025-01-01", "2026-11-19"));
});

test("KPIs: a short period stays one request; exactly maxDays is one request", () => {
  assert.deepEqual(kpiRanges("2026-11-19", "2026-11-19"), [{ fromDate: "2026-11-19", toDate: "2026-11-19" }]);
  assert.equal(kpiRanges("2025-01-01", "2026-02-04").length, 1);
  assert.equal(kpiRanges("2025-01-01", "2026-02-05").length, 2);
});
