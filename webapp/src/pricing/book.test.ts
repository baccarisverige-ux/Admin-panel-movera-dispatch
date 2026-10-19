import {
  activeScheduledBoost,
  defaultPricingBook,
  normalizePricingBook,
  removeBoostSchedule,
  restorePricingVersion,
  saveBoostSchedule,
  savePriceZone,
  validateZonePrice,
} from "./book.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

let book = defaultPricingBook();
const norrmalm = book.book.zones.find((zone) => zone.zoneId === "Z001")!;
assert(book.draftRev === 1, "pricing revision starts at one");
assert(validateZonePrice(norrmalm) === null, "default price zone is valid");

const legacy = normalizePricingBook({ zones: book.book.zones });
assert(legacy.book.zones.length === book.book.zones.length, "legacy PriceBook migrates");
assert(legacy.book.zones[0]?.enabledCategories.economy === true, "legacy categories default enabled");
assert(legacy.book.zones[0]?.enabledOptions.pet === true, "legacy ride options default enabled");

const draft = structuredClone(book.book);
const changed = draft.zones.find((zone) => zone.zoneId === "Z001")!;
changed.rates.economy.perKm = 20;
changed.waitingPerMin = 8;
changed.optionFee.pet = 45;
changed.commission.economy = 17;
changed.enabledCategories.premium = false;

const saved = savePriceZone(book, draft, "Z001", "nora", "Norrmalm pricing update", "2026-10-06T10:00:00.000Z");
assert(!saved.error, "valid price zone saves");
book = saved.book;
assert(book.draftRev === 2, "saving advances pricing revision");
assert(book.book.zones.find((zone) => zone.zoneId === "Z001")?.version === 2, "zone version advances");
assert(book.book.zones.find((zone) => zone.zoneId === "Z001")?.rates.economy.perKm === 20, "rate persists");
assert(book.book.zones.find((zone) => zone.zoneId === "Z001")?.enabledCategories.premium === false, "category availability persists");
assert(book.history[0]?.reason === "Norrmalm pricing update", "history records reason");

const badDraft = structuredClone(book.book);
badDraft.zones.find((zone) => zone.zoneId === "Z001")!.boostCap = 1.2;
const rejected = savePriceZone(book, badDraft, "Z001", "nora", "Bad boost", "2026-10-06T10:05:00.000Z");
assert(rejected.error?.includes("Boost cap"), "boost cap protects higher multipliers");
assert(rejected.book.draftRev === 2, "invalid price save does not advance revision");

const schedule = {
  id: "Z001-evening",
  zoneId: "Z001",
  multiplier: 1.7,
  startsAt: "2026-10-06T17:00:00.000Z",
  endsAt: "2026-10-06T22:00:00.000Z",
  enabled: true,
};
const scheduled = saveBoostSchedule(book, schedule, "nora", "Evening boost", "2026-10-06T10:10:00.000Z");
assert(!scheduled.error, "valid scheduled boost saves");
book = scheduled.book;
assert(book.draftRev === 3, "schedule advances pricing revision");
assert(activeScheduledBoost(book, "Z001", "2026-10-06T19:00:00.000Z")?.id === schedule.id, "active schedule resolves by time");
assert(activeScheduledBoost(book, "Z001", "2026-10-06T23:00:00.000Z") === null, "expired schedule is not active");

const removed = removeBoostSchedule(book, schedule.id, "nora", "Remove boost", "2026-10-06T10:20:00.000Z");
assert(!removed.error && removed.book.schedules.length === 0, "scheduled boost removal persists");
book = removed.book;
assert(book.draftRev === 4, "schedule removal advances revision");

const restored = restorePricingVersion(book, 2, "lena", "2026-10-06T10:30:00.000Z");
assert(!restored.error, "historical pricing revision restores");
assert(restored.book.draftRev === 5, "restore creates a new revision");
assert(restored.book.book.zones.find((zone) => zone.zoneId === "Z001")?.rates.economy.perKm === 20, "restored rate matches snapshot");

const oldZones = normalizePricingBook({ zones: book.book.zones.map((zone) => ({ ...zone, cancelFee: 50 })) });
assert(oldZones.book.zones.every((zone) => !("cancelFee" in zone)) && !validateZonePrice(oldZones.book.zones[0]!), "an older save with a zone cancel fee still opens, without it");

console.log("pricing book ok");
