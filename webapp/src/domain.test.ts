import { CATEGORIES, TRIP_STATUSES, formatOre, kronorToOre, tripStatusSchema } from "./domain/contract.ts";
import { statusPresentation } from "./domain/labels.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

assert(TRIP_STATUSES.length === 19, "19 trip statuses (contract v0.3.0)");
assert(new Set(TRIP_STATUSES).size === 19, "trip statuses are unique");
assert(tripStatusSchema.parse("cancelled_by_admin") === "cancelled_by_admin", "admin cancel status");
assert(CATEGORIES.length === 7, "7 categories");
assert(CATEGORIES[0]?.label === "Movera", "economy alias is Movera");
assert(kronorToOre(12.5) === 1250, "öre conversion");
assert(formatOre(20000) === "200,00 kr", "format öre");
assert(formatOre(-50) === "-0,50 kr", "negative öre");
assert(statusPresentation("completed")?.tone === "green", "completed has typed green status");
assert(statusPresentation("pending")?.tone === "amber", "pending has typed amber status");
assert(statusPresentation("cancelled_by_admin")?.tone === "red", "cancelled admin has typed red status");
assert(statusPresentation("Sara Berg") === null, "ordinary text is not guessed as a status");

console.log("domain contract ok");
