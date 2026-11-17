import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// J9 r2 (server J8b 09ae5e63 live, contract v0.18.118 debtModel.driverOwes.paidMovera): "Driver paid Movera" settles the
// open payouts below 0 oldest first and marks a payout it covers in full as paid (server src/admin/driversOwing.ts
// driverPaidMovera). So after a save the admin must read the payouts again, not only the owing list.
const owing: Record<string, unknown> = await import("./owingDrivers.ts").catch(() => ({}));

test("J9 r2: after Driver paid Movera the owing list AND the payouts are read again", () => {
  const keys = owing.afterPaidMoveraKeys as undefined | ((zoneQuery: string) => readonly (readonly unknown[])[]);
  assert.equal(typeof keys, "function", "owingDrivers.ts exports afterPaidMoveraKeys");
  const list = keys!("zoneId=Z1");
  assert.deepEqual(list, [["live", "drivers-owing", "zoneId=Z1"], ["live", "payouts"]]);
});

test("J9 r2: the Owe Movera tab refreshes with afterPaidMoveraKeys", () => {
  const src = readFileSync(new URL("./LiveOwingDrivers.tsx", import.meta.url), "utf8");
  assert.match(src, /afterPaidMoveraKeys\(zoneQuery\)/);
});
