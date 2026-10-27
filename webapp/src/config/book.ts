export type Lang = "sv" | "en";
export type AppId = "rider" | "driver";
export type PlatformId = "ios" | "android";
export type ConfigStatus = "draft" | "in_review" | "approved";
export type ReasonGroup = "driver_before" | "driver_during" | "driver_next" | "rider_finding" | "rider_support";
export type FeatureKey = "reservations" | "wallet";
export type OverrideLevel = "market" | "zone" | "category" | "app" | "platform" | "appVersion" | "cohort";

export type OverrideRule = {
  id: string;
  key: FeatureKey;
  level: OverrideLevel;
  target: string;
  value: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
};

export type EffectiveContext = {
  market?: string;
  zoneId?: string;
  category?: string;
  app?: AppId;
  platform?: PlatformId;
  appVersion?: string;
  cohort?: string;
  nowIso?: string;
};

export type ReasonText = { id: string; group: ReasonGroup; sv: string; en: string };

export type FeatureSwitch = { id: string; app: AppId; label: string; on: boolean };

export type AppUpdate = {
  app: AppId;
  platform: PlatformId;
  enabled: boolean;
  minimumVersion: string;
  latestVersion: string;
  title: string;
  message: string;
  actionLabel: string;
  dismissLabel: string;
  mandatory: boolean;
  updateUrl: string;
};

export type ConfigDraft = {
  features: { luxury: false; reservations: boolean; wallet: boolean };
  switches: FeatureSwitch[];
  versions: { rider: string; driver: string };
  updates: AppUpdate[];
  reasons: ReasonText[];
  scheduleAt: string | null;
  expiresAt: string | null;
  booking: { maxStops: number };
  environment: { simulatedArrival: boolean; skipActivation: boolean; demoPopup: boolean; demoHint: boolean };
  zoneOverrides: Record<string, { reservations?: boolean; wallet?: boolean }>;
  overrides: OverrideRule[];
};

export type Publication = {
  rev: number;
  at: string;
  actorId: string;
  diff: string[];
  kind?: "publish" | "rollback" | "expired" | "scheduled";
  effectiveAt?: string | null;
  expiresAt?: string | null;
};

export type ScheduledConfig = {
  rev: number;
  actorId: string;
  effectiveAt: string;
  expiresAt: string | null;
  snapshot: ConfigDraft;
  diff: string[];
};

export type ConfigBook = {
  authorId: string;
  approverId: string | null;
  status: ConfigStatus;
  rev: number;
  draftRev: number;
  draft: ConfigDraft;
  published: ConfigDraft;
  history: ConfigDraft[];
  publications: Publication[];
  scheduled: ScheduledConfig[];
};

/** Switches that are gone: Swish is not a payment method any more (Q7 FINAL). */
const RETIRED_SWITCHES = new Set(["swish"]);

export const RIDER_SWITCHES: FeatureSwitch[] = [
  { id: "cash", app: "rider", label: "Cash", on: true },
  { id: "applePay", app: "rider", label: "Apple Pay", on: true },
  { id: "googlePay", app: "rider", label: "Google Pay", on: true },
  { id: "scheduled", app: "rider", label: "Scheduled rides", on: true },
  { id: "wallet", app: "rider", label: "Wallet", on: true },
  { id: "pin", app: "rider", label: "PIN", on: true },
  { id: "shareTrip", app: "rider", label: "Share trip", on: true },
  { id: "bookLater", app: "rider", label: "Book later", on: true },
];

export const DRIVER_SWITCHES: FeatureSwitch[] = [
  { id: "showRating", app: "driver", label: "Show rating", on: true },
  { id: "showAcceptance", app: "driver", label: "Show acceptance", on: true },
  { id: "showCancellation", app: "driver", label: "Show cancellation", on: true },
  { id: "scheduledRides", app: "driver", label: "Reservations row", on: true },
];

export const REASON_GROUPS: { id: ReasonGroup; label: string }[] = [
  { id: "driver_before", label: "Driver before pickup" },
  { id: "driver_during", label: "Driver during trip" },
  { id: "driver_next", label: "Driver next trip" },
  { id: "rider_finding", label: "Rider while finding" },
  { id: "rider_support", label: "Rider support and receipt" },
];

export const REASONS: ReasonText[] = [
  { id: "rider_requested_cancel", group: "driver_before", sv: "Resenären bad om att avboka", en: "Rider asked to cancel" },
  { id: "rider_not_at_pickup", group: "driver_before", sv: "Resenären var inte på upphämtningen", en: "Rider not at pickup" },
  { id: "unsafe_pickup", group: "driver_before", sv: "Osäker upphämtning", en: "Pickup unsafe" },
  { id: "vehicle_issue_before_start", group: "driver_before", sv: "Fordonsproblem", en: "Vehicle problem" },
  { id: "driver_emergency_before_start", group: "driver_before", sv: "Personligt nödläge", en: "Personal emergency" },
  { id: "other_before_start", group: "driver_before", sv: "Annan orsak", en: "Other reason" },
  { id: "rider_no_show", group: "driver_before", sv: "Resenären kom inte", en: "Rider did not arrive" },
  { id: "rider_requested_early_end", group: "driver_during", sv: "Resenären bad att avsluta", en: "Rider asked to end the trip" },
  { id: "safety_concern_on_trip", group: "driver_during", sv: "Säkerhetsproblem", en: "Safety concern" },
  { id: "vehicle_issue_on_trip", group: "driver_during", sv: "Fordonsproblem under resan", en: "Vehicle problem" },
  { id: "accident_or_road_emergency", group: "driver_during", sv: "Olycka eller vägnödläge", en: "Accident or road emergency" },
  { id: "rider_behavior", group: "driver_during", sv: "Resenärens beteende", en: "Rider behavior" },
  { id: "trip_or_destination_issue", group: "driver_during", sv: "Resa eller destination", en: "Trip or destination issue" },
  { id: "other_on_trip", group: "driver_during", sv: "Annan orsak", en: "Other reason" },
  { id: "next_trip_current_running_late", group: "driver_next", sv: "Nuvarande resa tar längre tid", en: "Current trip is taking longer" },
  { id: "next_trip_pickup_too_far", group: "driver_next", sv: "För långt till upphämtningen", en: "Too far from the pickup" },
  { id: "next_trip_rider_requested", group: "driver_next", sv: "Resenären bad mig avboka", en: "Rider asked me to cancel" },
  { id: "next_trip_vehicle_issue", group: "driver_next", sv: "Problem med bilen", en: "Problem with the car" },
  { id: "next_trip_driver_emergency", group: "driver_next", sv: "Personligt nödläge", en: "Personal emergency" },
  { id: "next_trip_other", group: "driver_next", sv: "Annan orsak", en: "Other reason" },
  { id: "wait_too_long", group: "rider_finding", sv: "Väntan var för lång", en: "Wait was too long" },
  { id: "plans_changed", group: "rider_finding", sv: "Planerna ändrades", en: "Plans changed" },
  { id: "requested_by_mistake", group: "rider_finding", sv: "Bokade av misstag", en: "Requested by mistake" },
  { id: "wrong_ride_option", group: "rider_finding", sv: "Fel resealternativ", en: "Wrong ride option" },
  { id: "pickup_incorrect", group: "rider_finding", sv: "Fel upphämtning", en: "Pickup incorrect" },
  { id: "destination_change", group: "rider_finding", sv: "Destinationen ändrades", en: "Destination change" },
  { id: "driver_not_suitable", group: "rider_finding", sv: "Föraren passade inte", en: "Driver not suitable" },
  { id: "something_else", group: "rider_finding", sv: "Något annat", en: "Something else" },
  { id: "charged_more", group: "rider_support", sv: "Drog mer än väntat", en: "Charged more than expected" },
  { id: "charged_twice", group: "rider_support", sv: "Drog två gånger", en: "Charged twice" },
  { id: "wrong_wait_fee", group: "rider_support", sv: "Fel väntavgift", en: "Wrong wait time fee" },
  { id: "lost_item", group: "rider_support", sv: "Glömt föremål", en: "Lost item" },
  { id: "ride_without_me", group: "rider_support", sv: "Resa utan mig", en: "Ride happened without me" },
  { id: "question_about_tips", group: "rider_support", sv: "Fråga om dricks", en: "Question about tips" },
  { id: "something_else_support", group: "rider_support", sv: "Något annat", en: "Something else" },
];

function appUpdate(app: AppId, platform: PlatformId): AppUpdate {
  const store = platform === "ios" ? "https://apps.apple.com" : "https://play.google.com";
  return {
    app,
    platform,
    enabled: true,
    minimumVersion: "1.0.0",
    latestVersion: "1.0.0",
    title: "Update Movera",
    message: "A new version of Movera is available.",
    actionLabel: "Update",
    dismissLabel: "Later",
    mandatory: false,
    updateUrl: store,
  };
}

function blankDraft(): ConfigDraft {
  return {
    features: { luxury: false, reservations: true, wallet: true },
    switches: [...RIDER_SWITCHES, ...DRIVER_SWITCHES].map((item) => ({ ...item })),
    versions: { rider: "1.0.0", driver: "1.0.0" },
    updates: [
      appUpdate("rider", "ios"),
      appUpdate("rider", "android"),
      appUpdate("driver", "ios"),
      appUpdate("driver", "android"),
    ],
    reasons: REASONS.map((reason) => ({ ...reason })),
    scheduleAt: null,
    expiresAt: null,
    booking: { maxStops: 3 },
    environment: { simulatedArrival: false, skipActivation: false, demoPopup: false, demoHint: false },
    zoneOverrides: {},
    overrides: [],
  };
}

export function emptyConfig(authorId = "nora"): ConfigBook {
  const draft = blankDraft();
  const published = JSON.parse(JSON.stringify(draft)) as ConfigDraft;
  return {
    authorId,
    approverId: null,
    status: "draft",
    rev: 1,
    draftRev: 1,
    draft,
    published,
    history: [JSON.parse(JSON.stringify(draft)) as ConfigDraft],
    publications: [],
    scheduled: [],
  };
}

export function normalizeConfig(raw: Partial<ConfigBook> | null | undefined): ConfigBook {
  const base = emptyConfig(raw?.authorId || "nora");
  if (!raw?.draft?.features) return base;
  const mergeDraft = (incoming: Partial<ConfigDraft> | undefined): ConfigDraft => ({
    ...base.draft,
    ...incoming,
    features: { ...base.draft.features, ...incoming?.features, luxury: false },
    // Owner Q7 FINAL: no Swish anywhere; older saves drop the switch.
    switches: incoming?.switches?.length ? incoming.switches.filter((item) => !RETIRED_SWITCHES.has(item.id)) : base.draft.switches,
    updates: incoming?.updates?.length === 4 ? incoming.updates : base.draft.updates,
    reasons: incoming?.reasons?.length ? [...incoming.reasons, ...base.draft.reasons.filter((reason) => !incoming.reasons!.some((item) => item.id === reason.id))] : base.draft.reasons,
    booking: { ...base.draft.booking, ...incoming?.booking },
    environment: { ...base.draft.environment, ...incoming?.environment },
    versions: { ...base.draft.versions, ...incoming?.versions },
    zoneOverrides: incoming?.zoneOverrides ?? {},
    overrides: incoming?.overrides ?? [],
    expiresAt: incoming?.expiresAt ?? null,
  });
  const status: ConfigStatus = raw.status === "in_review" || raw.status === "approved" ? raw.status : "draft";
  return {
    ...base,
    authorId: raw.authorId || base.authorId,
    approverId: raw.approverId ?? null,
    status,
    rev: raw.rev || 1,
    draftRev: raw.draftRev || 1,
    draft: mergeDraft(raw.draft),
    published: mergeDraft(raw.published),
    history: raw.history?.length ? raw.history.map((item) => mergeDraft(item)) : base.history,
    publications: raw.publications ?? [],
    scheduled: raw.scheduled ?? [],
  };
}

export function missingTranslations(reasons: readonly ReasonText[]): string[] {
  return reasons.filter((reason) => !reason.sv.trim() || !reason.en.trim()).map((reason) => reason.id);
}

function edited(book: ConfigBook, draft: ConfigDraft, authorId: string): ConfigBook {
  return {
    ...book,
    authorId,
    approverId: null,
    status: "draft",
    draftRev: book.draftRev + 1,
    draft,
  };
}

export function setFeature(book: ConfigBook, key: "reservations" | "wallet", value: boolean, authorId: string): ConfigBook {
  const switches = book.draft.switches.map((item) => (item.id === key ? { ...item, on: value } : item));
  return edited(book, { ...book.draft, features: { ...book.draft.features, luxury: false, [key]: value }, switches }, authorId);
}

export function setSwitch(book: ConfigBook, id: string, on: boolean, authorId: string): ConfigBook {
  const switches = book.draft.switches.map((item) => (item.id === id ? { ...item, on } : item));
  const features = { ...book.draft.features, luxury: false as const };
  if (id === "wallet" || id === "reservations") features[id] = on;
  return edited(book, { ...book.draft, features, switches }, authorId);
}

export function setAppVersion(book: ConfigBook, which: "rider" | "driver", value: string, authorId: string): ConfigBook {
  const updates = book.draft.updates.map((item) => (item.app === which ? { ...item, latestVersion: value } : item));
  return edited(book, { ...book.draft, versions: { ...book.draft.versions, [which]: value }, updates }, authorId);
}

export function setAppUpdate(book: ConfigBook, app: AppId, platform: PlatformId, patch: Partial<AppUpdate>, authorId: string): ConfigBook {
  const updates = book.draft.updates.map((item) => (item.app === app && item.platform === platform ? { ...item, ...patch, app, platform } : item));
  return edited(book, { ...book.draft, updates }, authorId);
}

export function setReason(book: ConfigBook, id: string, lang: Lang, text: string, authorId: string): ConfigBook {
  return edited(book, {
    ...book.draft,
    reasons: book.draft.reasons.map((reason) => (reason.id === id ? { ...reason, [lang]: text } : reason)),
  }, authorId);
}

export function setSchedule(book: ConfigBook, scheduleAt: string | null, authorId: string): ConfigBook {
  return edited(book, { ...book.draft, scheduleAt }, authorId);
}

export function setExpiry(book: ConfigBook, expiresAt: string | null, authorId: string): ConfigBook {
  return edited(book, { ...book.draft, expiresAt }, authorId);
}

export function setOverride(book: ConfigBook, rule: OverrideRule, authorId: string): ConfigBook {
  const overrides = [...book.draft.overrides.filter((item) => item.id !== rule.id), { ...rule }];
  return edited(book, { ...book.draft, overrides }, authorId);
}

export function removeOverride(book: ConfigBook, id: string, authorId: string): ConfigBook {
  return edited(book, { ...book.draft, overrides: book.draft.overrides.filter((item) => item.id !== id) }, authorId);
}

export function setMaxStops(book: ConfigBook, maxStops: number, authorId: string): ConfigBook {
  return edited(book, { ...book.draft, booking: { maxStops } }, authorId);
}

export function setEnvironment(book: ConfigBook, key: keyof ConfigDraft["environment"], value: boolean, authorId: string): ConfigBook {
  return edited(book, { ...book.draft, environment: { ...book.draft.environment, [key]: value } }, authorId);
}

export function setZoneOverride(
  book: ConfigBook,
  zoneId: string,
  key: "reservations" | "wallet",
  value: boolean | null,
  authorId: string,
): ConfigBook {
  const current = { ...(book.draft.zoneOverrides[zoneId] ?? {}) };
  if (value === null) delete current[key];
  else current[key] = value;
  const zoneOverrides = { ...book.draft.zoneOverrides };
  if (Object.keys(current).length === 0) delete zoneOverrides[zoneId];
  else zoneOverrides[zoneId] = current;
  return edited(book, { ...book.draft, zoneOverrides }, authorId);
}

function onOff(value: boolean): string {
  return value ? "on" : "off";
}

export function configDiff(published: ConfigDraft, draft: ConfigDraft): string[] {
  const lines: string[] = [];
  if (published.features.reservations !== draft.features.reservations) {
    lines.push(`Reservations ${onOff(published.features.reservations)} → ${onOff(draft.features.reservations)}`);
  }
  if (published.features.wallet !== draft.features.wallet) {
    lines.push(`Wallet ${onOff(published.features.wallet)} → ${onOff(draft.features.wallet)}`);
  }
  for (const item of draft.switches) {
    const before = published.switches.find((entry) => entry.id === item.id && entry.app === item.app);
    if (before && before.on !== item.on) lines.push(`${item.app} ${item.label} ${onOff(before.on)} → ${onOff(item.on)}`);
  }
  if (published.versions.rider !== draft.versions.rider) lines.push(`Rider app ${published.versions.rider} → ${draft.versions.rider}`);
  if (published.versions.driver !== draft.versions.driver) lines.push(`Driver app ${published.versions.driver} → ${draft.versions.driver}`);
  for (const item of draft.updates) {
    const before = published.updates.find((entry) => entry.app === item.app && entry.platform === item.platform);
    if (!before) continue;
    if (before.minimumVersion !== item.minimumVersion) lines.push(`${item.app} ${item.platform} minimum ${before.minimumVersion} → ${item.minimumVersion}`);
    if (before.latestVersion !== item.latestVersion && published.versions[item.app] === draft.versions[item.app]) {
      lines.push(`${item.app} ${item.platform} latest ${before.latestVersion} → ${item.latestVersion}`);
    }
    if (before.mandatory !== item.mandatory) lines.push(`${item.app} ${item.platform} mandatory ${onOff(before.mandatory)} → ${onOff(item.mandatory)}`);
    if (before.message !== item.message) lines.push(`${item.app} ${item.platform} message changed`);
  }
  if ((published.scheduleAt ?? "") !== (draft.scheduleAt ?? "")) {
    lines.push(`Schedule ${published.scheduleAt ?? "now"} → ${draft.scheduleAt ?? "now"}`);
  }
  if (published.booking.maxStops !== draft.booking.maxStops) {
    lines.push(`Max stops ${published.booking.maxStops} → ${draft.booking.maxStops}`);
  }
  for (const reason of draft.reasons) {
    const before = published.reasons.find((item) => item.id === reason.id);
    if (!before) lines.push(`New reason ${reason.id}`);
    else if (before.sv !== reason.sv || before.en !== reason.en) lines.push(`Reason ${reason.id} text changed`);
  }
  const ids = new Set([...Object.keys(published.zoneOverrides ?? {}), ...Object.keys(draft.zoneOverrides ?? {})]);
  for (const id of ids) {
    if (JSON.stringify(published.zoneOverrides?.[id] ?? {}) !== JSON.stringify(draft.zoneOverrides?.[id] ?? {})) {
      lines.push(`Zone ${id} override changed`);
    }
  }
  if (JSON.stringify(published.overrides ?? []) !== JSON.stringify(draft.overrides ?? [])) {
    lines.push("Advanced precedence overrides changed");
  }
  if ((published.expiresAt ?? "") !== (draft.expiresAt ?? "")) {
    lines.push(`Expiry ${published.expiresAt ?? "none"} → ${draft.expiresAt ?? "none"}`);
  }
  return lines;
}

const OVERRIDE_LEVELS: OverrideLevel[] = ["market", "zone", "category", "app", "platform", "appVersion", "cohort"];

function targetFor(level: OverrideLevel, context: EffectiveContext): string | undefined {
  if (level === "market") return context.market;
  if (level === "zone") return context.zoneId;
  if (level === "category") return context.category;
  if (level === "app") return context.app;
  if (level === "platform") return context.platform;
  if (level === "appVersion") return context.appVersion;
  return context.cohort;
}

function activeAt(rule: OverrideRule, nowIso: string): boolean {
  if (rule.startsAt && rule.startsAt > nowIso) return false;
  if (rule.expiresAt && rule.expiresAt <= nowIso) return false;
  return true;
}

export function effectiveValue(
  draft: ConfigDraft,
  key: FeatureKey,
  contextOrZone: EffectiveContext | string,
): { value: string; level: string; chain: string[]; winnerId?: string } {
  const context: EffectiveContext =
    typeof contextOrZone === "string"
      ? { market: "SE-STO", zoneId: contextOrZone }
      : contextOrZone;
  const nowIso = context.nowIso ?? new Date().toISOString();
  let value = draft.features[key];
  let level = "global";
  let winnerId: string | undefined;
  const chain = [`global ${onOff(value)}`];

  for (const candidate of OVERRIDE_LEVELS) {
    const target = targetFor(candidate, context);
    const advanced = target
      ? draft.overrides.filter(
          (rule) => rule.key === key && rule.level === candidate && rule.target === target && activeAt(rule, nowIso),
        )
      : [];

    let winner = advanced[advanced.length - 1];
    if (candidate === "zone" && context.zoneId) {
      const legacy = draft.zoneOverrides[context.zoneId]?.[key];
      if (legacy !== undefined && !winner) {
        winner = {
          id: `legacy-zone-${context.zoneId}-${key}`,
          key,
          level: "zone",
          target: context.zoneId,
          value: legacy,
        };
      }
    }

    if (winner) {
      value = winner.value;
      level = candidate;
      winnerId = winner.id;
      chain.push(`${candidate} ${winner.target} ${onOff(winner.value)}`);
    } else {
      chain.push(`${candidate} not set`);
    }
  }

  return { value: onOff(value), level, chain, winnerId };
}

export function impactPreview(book: ConfigBook): {
  changed: number;
  scopes: string[];
  missingTranslations: string[];
  scheduledFor: string | null;
  expiresAt: string | null;
} {
  const diff = configDiff(book.published, book.draft);
  const scopes = new Set<string>();
  for (const zoneId of Object.keys(book.draft.zoneOverrides)) scopes.add(`zone:${zoneId}`);
  for (const rule of book.draft.overrides) scopes.add(`${rule.level}:${rule.target}`);
  if (scopes.size === 0) scopes.add("global");
  return {
    changed: diff.length,
    scopes: [...scopes],
    missingTranslations: missingTranslations(book.draft.reasons),
    scheduledFor: book.draft.scheduleAt,
    expiresAt: book.draft.expiresAt,
  };
}

export function submitConfigApproval(book: ConfigBook, actorId: string): { book: ConfigBook; error?: string } {
  const missing = missingTranslations(book.draft.reasons);
  if (missing.length > 0) return { book, error: `Missing translation: ${missing.join(", ")}` };
  if (configDiff(book.published, book.draft).length === 0) return { book, error: "There is no unpublished change to review." };
  return { book: { ...book, authorId: actorId, approverId: null, status: "in_review", draftRev: book.draftRev + 1 } };
}

export function approveConfig(book: ConfigBook, actorId: string): { book: ConfigBook; error?: string } {
  if (book.status !== "in_review") return { book, error: "Send the draft for approval first." };
  if (actorId === book.authorId) return { book, error: "A second agent must approve." };
  return { book: { ...book, approverId: actorId, status: "approved", draftRev: book.draftRev + 1 } };
}

function cloneDraft(draft: ConfigDraft): ConfigDraft {
  return JSON.parse(JSON.stringify(draft)) as ConfigDraft;
}

export function publishConfig(
  book: ConfigBook,
  actorId: string,
  nowIso: string,
  /** v0.8.0 (owner 2026-10-27): the live panel publishes at once, no second admin and no approval step. */
  options: { direct?: boolean } = {},
): { book: ConfigBook; error?: string; scheduled?: boolean } {
  const missing = missingTranslations(book.draft.reasons);
  if (missing.length > 0) return { book, error: `Missing translation: ${missing.join(", ")}` };
  if (book.draft.features.luxury !== false) return { book, error: "luxury is not a feature." };
  if (options.direct) {
    if (configDiff(book.published, book.draft).length === 0) return { book, error: "There is no unpublished change to review." };
  } else {
    if (actorId === book.authorId) return { book, error: "A second agent must publish." };
    if (book.status !== "approved") return { book, error: "Approve the draft before publishing." };
  }

  const snapshot = cloneDraft(book.draft);
  const diff = configDiff(book.published, snapshot);
  const nextRev = book.rev + 1;

  if (snapshot.scheduleAt && snapshot.scheduleAt > nowIso) {
    const scheduled: ScheduledConfig = {
      rev: nextRev,
      actorId,
      effectiveAt: snapshot.scheduleAt,
      expiresAt: snapshot.expiresAt,
      snapshot,
      diff,
    };
    return {
      scheduled: true,
      book: {
        ...book,
        authorId: actorId,
        approverId: null,
        status: "draft",
        rev: nextRev,
        draftRev: book.draftRev + 1,
        draft: { ...snapshot, scheduleAt: null },
        scheduled: [...book.scheduled, scheduled],
        publications: [
          ...book.publications,
          {
            rev: nextRev,
            at: nowIso,
            actorId,
            diff,
            kind: "scheduled",
            effectiveAt: scheduled.effectiveAt,
            expiresAt: scheduled.expiresAt,
          },
        ],
      },
    };
  }

  const live = { ...snapshot, scheduleAt: null };
  return {
    book: {
      ...book,
      authorId: actorId,
      approverId: null,
      status: "draft",
      rev: nextRev,
      draftRev: book.draftRev + 1,
      draft: cloneDraft(live),
      published: cloneDraft(live),
      history: [...book.history, cloneDraft(live)],
      publications: [
        ...book.publications,
        {
          rev: nextRev,
          at: nowIso,
          actorId,
          diff,
          kind: "publish",
          effectiveAt: nowIso,
          expiresAt: live.expiresAt,
        },
      ],
    },
  };
}

export function rollbackConfig(
  book: ConfigBook,
  actorId = "system",
  nowIso = new Date().toISOString(),
  kind: "rollback" | "expired" = "rollback",
): ConfigBook {
  if (book.history.length < 2) return book;
  const previous = cloneDraft(book.history[book.history.length - 2]!);
  previous.scheduleAt = null;
  const nextRev = book.rev + 1;
  const diff = configDiff(book.published, previous);
  return {
    ...book,
    authorId: actorId,
    approverId: null,
    status: "draft",
    rev: nextRev,
    draftRev: book.draftRev + 1,
    published: cloneDraft(previous),
    draft: cloneDraft(previous),
    history: [...book.history, cloneDraft(previous)],
    publications: [
      ...book.publications,
      {
        rev: nextRev,
        at: nowIso,
        actorId,
        diff,
        kind,
        effectiveAt: nowIso,
        expiresAt: previous.expiresAt,
      },
    ],
  };
}

export function draftRevisionMatches(current: ConfigBook, expectedDraftRev: number): boolean {
  return current.draftRev === expectedDraftRev;
}

export function advanceConfigClock(book: ConfigBook, nowIso: string): ConfigBook {
  let next = book;
  const due = [...next.scheduled]
    .filter((item) => item.effectiveAt <= nowIso)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));

  for (const scheduled of due) {
    const snapshot = cloneDraft(scheduled.snapshot);
    snapshot.scheduleAt = null;
    next = {
      ...next,
      draftRev: next.draftRev + 1,
      published: cloneDraft(snapshot),
      draft: cloneDraft(snapshot),
      history: [...next.history, cloneDraft(snapshot)],
      scheduled: next.scheduled.filter((item) => item.rev !== scheduled.rev),
      publications: [
        ...next.publications,
        {
          rev: scheduled.rev,
          at: nowIso,
          actorId: scheduled.actorId,
          diff: scheduled.diff,
          kind: "publish",
          effectiveAt: scheduled.effectiveAt,
          expiresAt: scheduled.expiresAt,
        },
      ],
    };
  }

  if (next.published.expiresAt && next.published.expiresAt <= nowIso && next.history.length >= 2) {
    next = rollbackConfig(next, "system-expiry", nowIso, "expired");
  }

  return next;
}

