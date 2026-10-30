import { fleetStatus, type FleetCar } from "./fleet.ts";
import { effectiveVehicleRules } from "./rules.ts";
import { emptySettingsBook } from "../drivers/onboardingSettings.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

const ok: FleetCar = { id: "V1", plate: "ABC 123", driverName: "Erik Lind", year: 2022, seats: 4, fuel: "electric", category: "electric" };
const old: FleetCar = { ...ok, id: "V2", plate: "OLD 14", year: 2012 };
const xl: FleetCar = { ...ok, id: "V3", plate: "XL 1", category: "xl", seats: 4, fuel: "petrol" };

assert(fleetStatus(ok).eligible, "electric car is eligible");
assert(fleetStatus(old).reason?.includes("older"), "old car refused");
assert(fleetStatus(xl).reason?.includes("6 seats"), "XL seats");

console.log("fleet ok");

// Owner G2 R2/R10 (2026-10-30): live pages use the onboarding config from the server, not the browser's demo slice.
{
  const browserSlice = { countries: { SE: { warnDays: 99, categories: [{ category: "economy", minYear: 2001 }] } }, photos: { V1: { front: { status: "approved", by: "nora", at: "", note: "" } } } };
  const book = emptySettingsBook();
  book.countries.SE.document.vehicles.warnDays = 21;
  const live = effectiveVehicleRules(browserSlice, book, true);
  assert(live.countries.SE.warnDays === 21, "live: the server's warn days");
  assert(live.countries.SE.categories.find((rule) => rule.category === "economy")?.minYear === 2015, "live: the browser slice's year is ignored");
  assert(Object.keys(live.photos).length === 0, "live: no simulated photo state from the browser");
  const demo = effectiveVehicleRules(browserSlice, emptySettingsBook(), false);
  assert(demo.countries.SE.categories.find((rule) => rule.category === "economy")?.minYear !== undefined, "demo still reads its slice");
  assert(Object.keys(demo.photos).length === 1, "demo keeps its photos");
  console.log("live car rules ok");
}
