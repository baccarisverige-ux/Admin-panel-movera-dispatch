import test from "node:test";
import assert from "node:assert/strict";
import { DISPATCH_TABS, dispatchHref, dispatchTabOf } from "./section.ts";

test("the Dispatch section has four tabs in the owner's order", () => {
  assert.deepEqual(DISPATCH_TABS.map((tab) => tab.id), ["map", "radar", "bookings", "rules"]);
  assert.equal(dispatchTabOf("/dispatch/bookings"), "bookings");
  assert.equal(dispatchTabOf("/dispatch/rules/"), "rules");
  assert.equal(dispatchTabOf("/dispatch"), null);
  assert.equal(dispatchTabOf("/dispatch/other"), null);
});

test("old Live map, Radar · Exclusive · Reservations and Dispatch links open the right tab", () => {
  assert.equal(dispatchHref("/live"), "/dispatch/map");
  assert.equal(dispatchHref("/live?zone=Z1&at=59.3,18.0,12"), "/dispatch/map?zone=Z1&at=59.3%2C18.0%2C12");
  assert.equal(dispatchHref("/offers"), "/dispatch/radar");
  assert.equal(dispatchHref("/offers?tab=radar&zone=Z1"), "/dispatch/radar?zone=Z1");
  assert.equal(dispatchHref("/offers?tab=exclusive&zone=Z1"), "/dispatch/radar?tab=exclusive&zone=Z1");
  assert.equal(dispatchHref("/offers?tab=reservations&zone=Z1&card=Reservations"), "/dispatch/bookings?zone=Z1&card=Reservations");
  assert.equal(dispatchHref("/dispatch"), "/dispatch/rules");
  assert.equal(dispatchHref("/dispatch?tab=reservations&zone=Z2"), "/dispatch/bookings?zone=Z2");
  assert.equal(dispatchHref("/dispatch?tab=exclusive"), "/dispatch/radar?tab=exclusive");
  assert.equal(dispatchHref("/dispatch?view=history"), "/dispatch/rules?view=history");
  assert.equal(dispatchHref("/dispatch?zone=Z1&tab=rides#dx-rider-cancel-fees"), "/dispatch/rules?zone=Z1&tab=rides#dx-rider-cancel-fees");
  assert.equal(dispatchHref("/dispatch/rules?tab=best"), "/dispatch/rules?tab=best");
  assert.equal(dispatchHref("/pricing?tab=prices"), "/pricing?tab=prices");
});
