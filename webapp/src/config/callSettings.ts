import { tr, type MessageKey } from "../i18n/core.ts";

/**
 * v0.18.38 §62 (fix job 8, contract.json#inAppCalls.settings; owner G15 2026-11-05 "In-app calls only"): the call
 * settings of a country (CountryRules.calls). Admin › Pricing › Tips & limits › Calls. Saved with Save tips & limits.
 * Mode phone needs a phone company on the server; until then the server keeps calls in-app.
 */
export type CallMode = "in_app" | "phone";
export type CallSettings = { on: boolean; mode: CallMode; callWindowAfterTripMin: number; ringSeconds: number; maxCallMin: number; connectTimeoutSeconds: number };
/** v0.18.66 §87 (owner 2026-11-11, Rule 16): connectTimeoutSeconds, how long an answered call may take to connect (10–60, default 25). */
export const CALL_DEFAULTS: CallSettings = { on: true, mode: "in_app", callWindowAfterTripMin: 60, ringSeconds: 30, maxCallMin: 15, connectTimeoutSeconds: 25 };
export const CALL_RANGES = { callWindowAfterTripMin: [0, 240], ringSeconds: [10, 120], maxCallMin: [1, 60], connectTimeoutSeconds: [10, 60] } as const;
type RangeKey = keyof typeof CALL_RANGES;
/** The number boxes of the Calls card, each with a visible label (job 8 screenshot check). */
export const CALL_FIELDS = [
  { key: "callWindowAfterTripMin", label: "Window after drop-off (min)" },
  { key: "ringSeconds", label: "Ring time (s)" },
  { key: "maxCallMin", label: "Longest call (min)" },
  { key: "connectTimeoutSeconds", label: "Connect time limit (s)" },
] as const satisfies readonly { key: RangeKey; label: MessageKey }[];

const inRange = (key: RangeKey, v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= CALL_RANGES[key][0] && v <= CALL_RANGES[key][1];

/** A stored calls block (or nothing) as settings; anything missing or out of range reads as the default. */
export function callSettingsOf(raw: unknown): CallSettings {
  const v = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const pick = (key: RangeKey) => (inRange(key, v[key]) ? v[key] : CALL_DEFAULTS[key]);
  return {
    on: typeof v["on"] === "boolean" ? v["on"] : CALL_DEFAULTS.on,
    mode: v["mode"] === "phone" || v["mode"] === "in_app" ? v["mode"] : CALL_DEFAULTS.mode,
    callWindowAfterTripMin: pick("callWindowAfterTripMin"),
    ringSeconds: pick("ringSeconds"),
    maxCallMin: pick("maxCallMin"),
    connectTimeoutSeconds: pick("connectTimeoutSeconds"),
  };
}

export function callSettingsIssues(name: string, s: CallSettings): string[] {
  const issues: string[] = [];
  if (!inRange("callWindowAfterTripMin", s.callWindowAfterTripMin)) issues.push(tr("{0}: the call window after the trip must be 0 to 240 minutes.", [name]));
  if (!inRange("ringSeconds", s.ringSeconds)) issues.push(tr("{0}: the ring time must be 10 to 120 seconds.", [name]));
  if (!inRange("maxCallMin", s.maxCallMin)) issues.push(tr("{0}: the longest call must be 1 to 60 minutes.", [name]));
  if (!inRange("connectTimeoutSeconds", s.connectTimeoutSeconds)) issues.push(tr("{0}: the connect time limit must be 10 to 60 seconds.", [name]));
  return issues;
}

const onOff = (on: boolean) => (on ? tr("On") : tr("Off"));
const modeText = (mode: CallMode) => (mode === "phone" ? tr("Phone (needs a phone company)") : tr("In the app"));
export function callSettingsLines(before: CallSettings, after: CallSettings): string[] {
  const lines: string[] = [];
  if (before.on !== after.on) lines.push(tr("Calls: {0} → {1}", [onOff(before.on), onOff(after.on)]));
  if (before.mode !== after.mode) lines.push(tr("Call mode: {0} → {1}", [modeText(before.mode), modeText(after.mode)]));
  if (before.callWindowAfterTripMin !== after.callWindowAfterTripMin) lines.push(tr("Call window after the trip: {0} min → {1} min", [before.callWindowAfterTripMin, after.callWindowAfterTripMin]));
  if (before.ringSeconds !== after.ringSeconds) lines.push(tr("Ring time: {0} s → {1} s", [before.ringSeconds, after.ringSeconds]));
  if (before.maxCallMin !== after.maxCallMin) lines.push(tr("Longest call: {0} min → {1} min", [before.maxCallMin, after.maxCallMin]));
  if (before.connectTimeoutSeconds !== after.connectTimeoutSeconds) lines.push(tr("Connect time limit: {0} s → {1} s", [before.connectTimeoutSeconds, after.connectTimeoutSeconds]));
  return lines;
}
export { modeText as callModeText };
