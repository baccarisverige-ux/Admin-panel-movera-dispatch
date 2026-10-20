import { averageStars } from "./book.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// No stacking, budget, named bonuses and hiding with the original text moved to growth/ops.test.ts and acceptance.test.ts (C-21).
const reviews = [
  { id: "V1", stars: 5, text: "Great", hidden: false, hideReason: null },
  { id: "V2", stars: 1, text: "Late", hidden: true, hideReason: "Abuse" },
];
assert(averageStars(reviews) === 5, "hidden review leaves the average");
assert(averageStars([reviews[1]!]) === 0, "only hidden reviews give 0");

console.log("growth ok");
