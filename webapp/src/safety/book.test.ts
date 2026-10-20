import { impossibleTravel, publicIncident } from "./book.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// Take and resolve moved to safety/ops.test.ts (C-21).
const taken = { id: "INC-1", state: "taken" as const, locationAt: "2026-10-05T10:00:00Z", accuracyM: 12, ownerId: "erik" };
const view = publicIncident(taken);
assert(!("pin" in view), "PIN is not in the view");
assert(view.locationAt === taken.locationAt && view.accuracyM === 12, "location time and accuracy");
assert(impossibleTravel(600, 10), "600 m in 10 s is impossible");
assert(!impossibleTravel(100, 10), "walking speed is fine");

console.log("safety ok");
