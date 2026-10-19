import {
  CATEGORY_IDS,
  RIDE_OPTION_INFO,
  defaultPriceBook,
  type PriceBook,
  type PriceCategoryId,
  type ZonePrice,
} from "./sets.ts";

export type BoostSchedule = {
  id: string;
  zoneId: string;
  multiplier: number;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

export type PricingSnapshot = {
  rev: number;
  at: string;
  actorId: string;
  reason: string;
  book: PriceBook;
  schedules: BoostSchedule[];
};

export type PricingBook = {
  draftRev: number;
  book: PriceBook;
  schedules: BoostSchedule[];
  history: PricingSnapshot[];
};

function cloneBook(book: PriceBook): PriceBook {
  return structuredClone(book);
}

function defaultZone(zoneId: string): ZonePrice {
  const defaults = defaultPriceBook().zones;
  return structuredClone(defaults.find((zone) => zone.zoneId === zoneId) ?? defaults[0]!);
}

/** Older saves had a zone-wide rider "cancelFee". Rider cancel fees are set in Dispatch › Rider cancel fees only. */
function withoutRetired(value: ZonePrice): ZonePrice {
  const copy = { ...value } as ZonePrice & { cancelFee?: unknown };
  delete copy.cancelFee;
  return copy;
}

function normalizeZone(value: ZonePrice): ZonePrice {
  const fallback = defaultZone(value.zoneId);
  return {
    ...fallback,
    ...withoutRetired(value),
    rates: Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, { ...fallback.rates[id], ...(value.rates?.[id] ?? {}) }]),
    ) as ZonePrice["rates"],
    commission: Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, Number.isFinite(value.commission?.[id]) ? value.commission[id] : fallback.commission[id]]),
    ) as ZonePrice["commission"],
    enabledCategories: Object.fromEntries(
      CATEGORY_IDS.map((id) => [id, value.enabledCategories?.[id] ?? true]),
    ) as ZonePrice["enabledCategories"],
    optionFee: Object.fromEntries(
      RIDE_OPTION_INFO.map((item) => [item.id, Number.isFinite(value.optionFee?.[item.id]) ? value.optionFee[item.id] : fallback.optionFee[item.id]]),
    ),
    enabledOptions: Object.fromEntries(
      RIDE_OPTION_INFO.map((item) => [item.id, value.enabledOptions?.[item.id] ?? true]),
    ),
    tips: Array.isArray(value.tips) && value.tips.length > 0 ? value.tips.map(Number) : fallback.tips,
  };
}

export function normalizePricingBook(value: unknown): PricingBook {
  if (!value || typeof value !== "object") return defaultPricingBook();
  const raw = value as Partial<PricingBook> & Partial<PriceBook>;
  if (Array.isArray(raw.zones)) {
    return {
      draftRev: 1,
      book: { zones: raw.zones.map((zone) => normalizeZone(zone)) },
      schedules: [],
      history: [],
    };
  }
  const book = raw.book && Array.isArray(raw.book.zones)
    ? { zones: raw.book.zones.map((zone) => normalizeZone(zone)) }
    : defaultPriceBook();
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    book,
    schedules: Array.isArray(raw.schedules)
      ? raw.schedules
          .filter((item): item is BoostSchedule => Boolean(item && typeof item.id === "string" && typeof item.zoneId === "string"))
          .map((item) => ({ ...item }))
      : [],
    history: Array.isArray(raw.history)
      ? raw.history
          .filter((item): item is PricingSnapshot => Boolean(item && typeof item.rev === "number" && item.book && Array.isArray(item.book.zones)))
          .map((item) => ({ ...item, book: cloneBook(item.book), schedules: item.schedules?.map((schedule) => ({ ...schedule })) ?? [] }))
      : [],
  };
}

export function defaultPricingBook(): PricingBook {
  return { draftRev: 1, book: defaultPriceBook(), schedules: [], history: [] };
}

function numberError(value: number, label: string, min = 0, max = Number.POSITIVE_INFINITY): string | null {
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

export function validateZonePrice(zone: ZonePrice): string | null {
  for (const category of CATEGORY_IDS) {
    const rate = zone.rates[category];
    const checks = [
      numberError(rate.pickup, `${category} pickup`),
      numberError(rate.perKm, `${category} per km`),
      numberError(rate.perMin, `${category} per minute`),
      numberError(rate.minimum, `${category} minimum`),
      numberError(rate.maximum, `${category} maximum`),
    ];
    const error = checks.find(Boolean);
    if (error) return error;
    if (rate.maximum < rate.minimum) return `${category} maximum must be at least its minimum.`;
    const commission = numberError(zone.commission[category], `${category} commission`, 0, 100);
    if (commission) return commission;
  }

  if (!(zone.adjustMin > 0 && zone.adjustMin <= 100)) return "Adjustment minimum must be above 0% and at most 100%.";
  if (!(zone.adjustMax >= 100 && zone.adjustMax <= 300)) return "Adjustment maximum must be between 100% and 300%.";
  if (zone.adjustMin > zone.adjustMax) return "Adjustment minimum cannot exceed maximum.";
  if (!(zone.adjustStep > 0 && zone.adjustStep <= 50)) return "Adjustment step must be above 0% and at most 50%.";
  if (!(zone.quoteSeconds >= 15 && zone.quoteSeconds <= 900)) return "Quote validity must be between 15 and 900 seconds.";

  for (const [label, value] of [
    ["Reservation fee", zone.reservationFee],
    ["Booking fee", zone.bookingFee],
    ["Airport fee", zone.airportFee],
    ["Event fee", zone.eventFee],
    ["Waiting per minute", zone.waitingPerMin],
  ] as const) {
    const error = numberError(value, label, 0, 10_000);
    if (error) return error;
  }

  for (const item of RIDE_OPTION_INFO) {
    const error = numberError(zone.optionFee[item.id], `${item.label} fee`, 0, 10_000);
    if (error) return error;
  }

  for (const [label, value] of [
    ["Manual boost", zone.boostManual],
    ["Scheduled boost", zone.boostScheduled],
    ["Automatic boost", zone.boostAuto],
    ["Boost cap", zone.boostCap],
  ] as const) {
    const error = numberError(value, label, 1, 5);
    if (error) return error;
  }
  if (Math.max(zone.boostManual, zone.boostScheduled, zone.boostAuto) > zone.boostCap) {
    return "Boost cap must be at least every configured boost multiplier.";
  }

  const fleet = numberError(zone.fleetCommission, "Fleet commission", 0, 100);
  if (fleet) return fleet;

  if (zone.tips.length === 0 || zone.tips.some((tip) => !Number.isFinite(tip) || tip < 0 || tip > 5_000)) {
    return "Tip presets must contain values between 0 and 5000 kr.";
  }
  if (new Set(zone.tips).size !== zone.tips.length) return "Tip presets must be unique.";
  return null;
}

export function pricingDiff(before: PriceBook, after: PriceBook): string[] {
  const changes: string[] = [];
  for (const next of after.zones) {
    const previous = before.zones.find((zone) => zone.zoneId === next.zoneId);
    if (!previous) {
      changes.push(`${next.zoneName}: added`);
      continue;
    }
    if (JSON.stringify(previous) !== JSON.stringify(next)) changes.push(`${next.zoneName}: pricing changed`);
  }
  return changes;
}

export function savePriceZone(
  current: PricingBook,
  draft: PriceBook,
  zoneId: string,
  actorId: string,
  reason: string,
  nowIso: string,
): { book: PricingBook; error?: string } {
  const currentZone = current.book.zones.find((zone) => zone.zoneId === zoneId);
  const draftZone = draft.zones.find((zone) => zone.zoneId === zoneId);
  if (!currentZone || !draftZone) return { book: current, error: "Price zone was not found." };
  const error = validateZonePrice(draftZone);
  if (error) return { book: current, error };
  if (JSON.stringify(currentZone) === JSON.stringify(draftZone)) return { book: current, error: "No price changes to save." };

  const nextRev = current.draftRev + 1;
  const nextBook: PriceBook = {
    zones: current.book.zones.map((zone) =>
      zone.zoneId === zoneId ? { ...structuredClone(draftZone), version: zone.version + 1 } : structuredClone(zone),
    ),
  };
  const snapshot: PricingSnapshot = {
    rev: nextRev,
    at: nowIso,
    actorId,
    reason: reason.trim() || "Pricing update",
    book: cloneBook(nextBook),
    schedules: current.schedules.map((schedule) => ({ ...schedule })),
  };
  return {
    book: {
      draftRev: nextRev,
      book: nextBook,
      schedules: current.schedules.map((schedule) => ({ ...schedule })),
      history: [snapshot, ...current.history].slice(0, 30),
    },
  };
}

export function saveBoostSchedule(
  current: PricingBook,
  schedule: BoostSchedule,
  actorId: string,
  reason: string,
  nowIso: string,
): { book: PricingBook; error?: string } {
  if (!current.book.zones.some((zone) => zone.zoneId === schedule.zoneId)) return { book: current, error: "Schedule zone was not found." };
  const multiplierError = numberError(schedule.multiplier, "Scheduled boost multiplier", 1, 5);
  if (multiplierError) return { book: current, error: multiplierError };
  if (!schedule.startsAt || !schedule.endsAt) return { book: current, error: "Boost schedule needs a start and end." };
  if (Date.parse(schedule.endsAt) <= Date.parse(schedule.startsAt)) return { book: current, error: "Boost schedule end must be after its start." };
  const zone = current.book.zones.find((item) => item.zoneId === schedule.zoneId)!;
  if (schedule.multiplier > zone.boostCap) return { book: current, error: "Scheduled boost cannot exceed the zone boost cap." };

  const nextSchedules = [
    { ...schedule },
    ...current.schedules.filter((item) => item.id !== schedule.id),
  ];
  const nextRev = current.draftRev + 1;
  const snapshot: PricingSnapshot = {
    rev: nextRev,
    at: nowIso,
    actorId,
    reason: reason.trim() || "Boost schedule update",
    book: cloneBook(current.book),
    schedules: nextSchedules.map((item) => ({ ...item })),
  };
  return {
    book: {
      draftRev: nextRev,
      book: cloneBook(current.book),
      schedules: nextSchedules,
      history: [snapshot, ...current.history].slice(0, 30),
    },
  };
}

export function removeBoostSchedule(
  current: PricingBook,
  id: string,
  actorId: string,
  reason: string,
  nowIso: string,
): { book: PricingBook; error?: string } {
  if (!current.schedules.some((item) => item.id === id)) return { book: current, error: "Boost schedule was not found." };
  const nextSchedules = current.schedules.filter((item) => item.id !== id);
  const nextRev = current.draftRev + 1;
  const snapshot: PricingSnapshot = {
    rev: nextRev,
    at: nowIso,
    actorId,
    reason: reason.trim() || "Boost schedule removed",
    book: cloneBook(current.book),
    schedules: nextSchedules.map((item) => ({ ...item })),
  };
  return {
    book: {
      draftRev: nextRev,
      book: cloneBook(current.book),
      schedules: nextSchedules,
      history: [snapshot, ...current.history].slice(0, 30),
    },
  };
}

export function restorePricingVersion(
  current: PricingBook,
  rev: number,
  actorId: string,
  nowIso: string,
): { book: PricingBook; error?: string } {
  const snapshot = current.history.find((item) => item.rev === rev);
  if (!snapshot) return { book: current, error: "Pricing version was not found." };

  const restoredZones = snapshot.book.zones.map((zone) => {
    const currentZone = current.book.zones.find((item) => item.zoneId === zone.zoneId);
    return { ...structuredClone(zone), version: (currentZone?.version ?? zone.version) + 1 };
  });
  const nextRev = current.draftRev + 1;
  const restoredBook = { zones: restoredZones };
  const nextSnapshot: PricingSnapshot = {
    rev: nextRev,
    at: nowIso,
    actorId,
    reason: `Restore pricing revision ${rev}`,
    book: cloneBook(restoredBook),
    schedules: snapshot.schedules.map((item) => ({ ...item })),
  };
  return {
    book: {
      draftRev: nextRev,
      book: restoredBook,
      schedules: snapshot.schedules.map((item) => ({ ...item })),
      history: [nextSnapshot, ...current.history].slice(0, 30),
    },
  };
}

export function activeScheduledBoost(book: PricingBook, zoneId: string, whenIso: string): BoostSchedule | null {
  const when = Date.parse(whenIso);
  if (!Number.isFinite(when)) return null;
  return book.schedules.find((schedule) =>
    schedule.enabled &&
    schedule.zoneId === zoneId &&
    Date.parse(schedule.startsAt) <= when &&
    when < Date.parse(schedule.endsAt),
  ) ?? null;
}

export function enabledCategoryIds(zone: ZonePrice): PriceCategoryId[] {
  return CATEGORY_IDS.filter((id) => zone.enabledCategories[id]);
}
