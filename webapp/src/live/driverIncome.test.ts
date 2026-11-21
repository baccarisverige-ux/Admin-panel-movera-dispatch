import assert from "node:assert/strict";
import test from "node:test";
import { COLUMN_INFO, DETAIL_CHOICES, FIELD_LABEL, MONEY_FIELDS, TABLE_FIELDS, csvFileName, defaultYear, incomeQuery, listDetail, monthChoices, tripsNeedScope, yearChoices } from "./driverIncome.ts";

// v0.18.153 P29 (contract.json#driverIncomeYear): the pure parts of Admin › Finance › Driver income (year).
test("the year picker starts with last year and lists 2020 up to this year", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  assert.equal(defaultYear(now), 2025);
  assert.deepEqual(yearChoices(now), [2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  assert.equal(defaultYear(new Date("2020-03-01T00:00:00Z")), 2020);
});

test("the owner's four detail levels, in order", () => {
  assert.deepEqual(DETAIL_CHOICES.map((c) => [c.id, c.label]), [["quarter", "Quarters"], ["month", "Months"], ["day", "Months + days"], ["trips", "All trips per day"]]);
});

test("the query carries the year, the level, the month, the payee and the top bar's zones", () => {
  assert.equal(incomeQuery({ year: 2025, detail: "quarter" }), "year=2025&detail=quarter");
  assert.equal(incomeQuery({ year: 2025, detail: "trips", month: "2025-03", payeeId: "flt_1", zoneParams: [["country", "SE"]], cursor: "abc", limit: 50 }), "year=2025&detail=trips&month=2025-03&payeeId=flt_1&country=SE&cursor=abc&limit=50");
});

test("All trips per day: the list shows days; trips need a month or a payee (the server's income_detail_too_big)", () => {
  assert.equal(listDetail("trips"), "day");
  assert.equal(listDetail("month"), "month");
  assert.equal(tripsNeedScope("trips", null, null), true);
  assert.equal(tripsNeedScope("trips", "2025-01", null), false);
  assert.equal(tripsNeedScope("trips", null, "drv_1"), false);
  assert.equal(tripsNeedScope("day", null, null), false);
});

test("the download name matches the server's", () => {
  assert.equal(csvFileName(2025, "month"), "movera-driver-income-2025-month.csv");
  assert.equal(csvFileName(2025, "trips", "2025-03"), "movera-driver-income-2025-03-trips.csv");
  assert.deepEqual(monthChoices(2025).slice(0, 2), ["2025-01", "2025-02"]);
  assert.equal(monthChoices(2025).length, 12);
});

test("every money column has a label and an (i) text; the table shows every field once", () => {
  for (const field of MONEY_FIELDS) {
    assert.ok(FIELD_LABEL[field], field);
    assert.ok(COLUMN_INFO[field].length > 10, field);
  }
  assert.deepEqual([...TABLE_FIELDS].sort(), [...MONEY_FIELDS].sort());
});
