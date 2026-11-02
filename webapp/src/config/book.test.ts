import {
  advanceConfigClock,
  approveConfig,
  configDiff,
  draftRevisionMatches,
  effectiveValue,
  emptyConfig,
  impactPreview,
  missingTranslations,
  normalizeConfig,
  publishConfig,
  rollbackConfig,
  setExpiry,
  setFeature,
  setMaxStops,
  setOverride,
  setSchedule,
  setZoneOverride,
  submitConfigApproval,
} from "./book.ts";
import type { ReasonText } from "./book.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

let book = setFeature(emptyConfig("nora"), "wallet", false, "nora");
assert(book.draft.features.luxury === false, "luxury stays off");
assert(book.draft.features.wallet === false, "wallet can be turned off");
assert(book.status === "draft", "edit returns to draft");
assert(book.draftRev === 2, "draft edit advances conflict token");
assert(draftRevisionMatches(book, 2), "matching draft revision is accepted");
assert(!draftRevisionMatches(book, 1), "stale draft revision is rejected");
const blocked = publishConfig(book, "nora", "2026-10-05T10:00:00Z");
assert(blocked.error === "A second agent must publish.", "second person");
const sent = submitConfigApproval(book, "nora");
assert(!sent.error && sent.book.status === "in_review", "sent");
assert(approveConfig(sent.book, "nora").error === "A second agent must approve.", "author cannot approve");
const approved = approveConfig(sent.book, "lena");
assert(!approved.error && approved.book.status === "approved", "approved");
assert(publishConfig(book, "lena", "2026-10-05T10:00:00Z").error === "Approve the draft before publishing.", "draft cannot publish");
const live = publishConfig(approved.book, "lena", "2026-10-05T10:00:00Z");
assert(!live.error && live.book.published.features.wallet === false, "published");
assert(live.book.publications.some((item) => item.kind === "publish"), "publish history records kind");
book = live.book;
const back = rollbackConfig(book, "nora", "2026-10-05T10:05:00Z");
assert(back.published.features.wallet === true, "rollback restores wallet");
assert(back.rev === book.rev + 1, "rollback is a new version");
assert(back.publications.at(-1)?.kind === "rollback", "rollback is recorded, not history deletion");

const broken: ReasonText = { id: "x", group: "rider_finding", sv: "", en: "Hi" };
book = { ...emptyConfig(), draft: { ...emptyConfig().draft, reasons: [broken] } };
assert(missingTranslations(book.draft.reasons).includes("x"), "missing swedish");
assert(publishConfig(book, "lena", "2026-10-05T10:00:00Z").error?.includes("Missing translation"), "publish blocked");

book = emptyConfig("nora");
book = setSchedule(book, "2026-10-06T00:00:00Z", "nora");
const scheduledSent = submitConfigApproval(book, "nora");
const scheduledApproved = approveConfig(scheduledSent.book, "lena");
const scheduled = publishConfig(scheduledApproved.book, "lena", "2026-10-05T10:00:00Z");
assert(scheduled.scheduled === true && scheduled.book.scheduled.length === 1, "future publish becomes a scheduled version");
assert(scheduled.book.published.features.wallet === true, "scheduled version is not live early");
const activated = advanceConfigClock(scheduled.book, "2026-10-06T00:00:01Z");
assert(activated.scheduled.length === 0, "due schedule leaves the queue");
assert(activated.publications.at(-1)?.kind === "publish", "schedule activation is recorded");

let expiring = setFeature(emptyConfig("nora"), "wallet", false, "nora");
expiring = setExpiry(expiring, "2026-10-05T11:00:00Z", "nora");
const expiringApproved = approveConfig(submitConfigApproval(expiring, "nora").book, "lena");
const expiringLive = publishConfig(expiringApproved.book, "lena", "2026-10-05T10:00:00Z").book;
const expired = advanceConfigClock(expiringLive, "2026-10-05T11:00:01Z");
assert(expired.published.features.wallet === true, "expiry restores the previous snapshot");
assert(expired.publications.at(-1)?.kind === "expired", "expiry creates an explicit version event");

let precedence = emptyConfig("nora");
precedence = setOverride(precedence, { id: "m", key: "wallet", level: "market", target: "SE-STO", value: false }, "nora");
precedence = setOverride(precedence, { id: "z", key: "wallet", level: "zone", target: "op-norrmalm", value: true }, "nora");
precedence = setOverride(precedence, { id: "c", key: "wallet", level: "category", target: "premium", value: false }, "nora");
precedence = setOverride(precedence, { id: "a", key: "wallet", level: "app", target: "rider", value: true }, "nora");
precedence = setOverride(precedence, { id: "p", key: "wallet", level: "platform", target: "ios", value: false }, "nora");
precedence = setOverride(precedence, { id: "v", key: "wallet", level: "appVersion", target: "2.0.0", value: true }, "nora");
precedence = setOverride(precedence, { id: "co", key: "wallet", level: "cohort", target: "beta", value: false }, "nora");
const resolved = effectiveValue(precedence.draft, "wallet", {
  market: "SE-STO",
  zoneId: "op-norrmalm",
  category: "premium",
  app: "rider",
  platform: "ios",
  appVersion: "2.0.0",
  cohort: "beta",
  nowIso: "2026-10-05T10:00:00Z",
});
assert(resolved.level === "cohort" && resolved.value === "off", "cohort wins full precedence chain");
assert(resolved.chain.length === 8, "effective viewer shows every precedence level");

const changed = setZoneOverride(setFeature(emptyConfig("nora"), "wallet", false, "nora"), "op-norrmalm", "reservations", false, "nora");
const lines = configDiff(changed.published, changed.draft);
assert(lines.some((line) => line.includes("Wallet on → off")), "diff shows the wallet change");
assert(lines.some((line) => line.includes("op-norrmalm")), "diff shows the zone override");
const effect = effectiveValue(changed.draft, "reservations", "op-norrmalm");
assert(effect.level === "zone" && effect.value === "off", "zone wins");
assert(effect.chain.some((line) => line.includes("market")) && effect.chain.some((line) => line.includes("platform")), "precedence chain");
const impact = impactPreview(precedence);
assert(impact.changed > 0 && impact.scopes.includes("cohort:beta"), "impact preview names affected scopes");

const stops = setMaxStops(emptyConfig(), 2, "nora");
assert(configDiff(stops.published, stops.draft).some((line) => line.includes("Max stops 3 → 2")), "max stops");
const fresh = emptyConfig();
assert(fresh.draft.switches.length === 11, "both apps (G8: no Google Pay switch)");
assert(!fresh.draft.switches.some((item) => item.id === "swish"), "Q7 FINAL: no Swish switch");
assert(!normalizeConfig({ ...fresh, draft: { ...fresh.draft, switches: [...fresh.draft.switches, { id: "swish", app: "rider", label: "Swish", on: true }] } }).draft.switches.some((item) => item.id === "swish"), "an older save drops the Swish switch");
assert(fresh.draft.reasons.length === 35, "reasons");
assert(fresh.draft.updates.length === 4, "platforms");
assert(!fresh.draft.switches.some((item) => item.id === "luxury"), "no luxury switch");
assert(fresh.draft.booking.maxStops === 3, "three stops");
assert(fresh.draft.overrides.length === 0, "advanced overrides start empty");

console.log("config ok");
