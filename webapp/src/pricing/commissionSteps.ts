/**
 * J5b commission steps (contract v0.18.86, contract.json#commissionSteps; owner 2026-11-13 ~20:48 UTC "Yes, like this",
 * ~21:40 UTC placement + "Yes, warn", ~22:46 UTC "Add calculation machine"; Rules decisions/session-2026-11-06.md).
 *
 * ONE shared function set for the admin: the validation the server runs (400 commission_steps_invalid), the step pick,
 * the driver's ride part (half_up to a whole minor unit, never below 0, a fixed commission capped at the base), the
 * advisory warning and the calculator. The Commission panel's editor, its calculator, Test a ride and the Dispatch
 * previews all call these, so the admin shows the server's numbers to the minor unit. Pure code: node --test replays
 * every pick and warn case of fixtures/commission_steps.json through it.
 *
 * All amounts are minor units of the zone currency (öre, cents, millimes — TND has 3 decimals). The base may be exact
 * (a decimal string or number, e.g. "5000.4"); it is never rounded before the pick. Arithmetic is exact (BigInt
 * decimals), so 6025 × 0.82 = 4940.5 rounds half-up to 4941 as on the server.
 */
import contractJson from "../../../contracts/contract.json" with { type: "json" };

export type CommissionStep = { upToMinor: number | null; pct?: number; amountMinor?: number };

/** A car type's commission: the % (used only when there are no steps) and its steps ([] = none). */
export type CommissionRule = { pct: number; steps: readonly CommissionStep[] };

export type StepProblemCode =
  | "not_a_list" | "too_many_steps" | "pct_or_amount" | "up_to_missing" | "pct_out_of_range" | "amount_out_of_range"
  | "above_not_last" | "last_not_above" | "up_to_out_of_range" | "up_to_not_increasing";

export type StepProblem = { step: number | null; problem: StepProblemCode };

export type StepWarning = { step: number; upToMinor: number; atLimit: number; justAbove: number };

type Lang = "sv" | "fr" | "en";
type Texts3 = Record<Lang, string>;
type StepsContract = {
  validation: { maxSteps: number; pctMin: number; pctMax: number; problems: Record<StepProblemCode, string> };
  texts: Record<string, Texts3> & { calculator: Record<string, Texts3>; errors: Record<StepProblemCode, Texts3> };
};

export const STEPS_CONTRACT = (contractJson as unknown as { commissionSteps: StepsContract }).commissionSteps;
export const MAX_STEPS = STEPS_CONTRACT.validation.maxSteps;
const PCT_MIN = STEPS_CONTRACT.validation.pctMin;
const PCT_MAX = STEPS_CONTRACT.validation.pctMax;

/* ------------------------------------------------------------------ exact decimals */

/** n / 10^k, exact. */
type Dec = { n: bigint; k: number };

const TEN = BigInt(10);
const pow10 = (k: number): bigint => TEN ** BigInt(k);

/** A decimal string or a number as an exact decimal (a number is read by its shortest decimal text). */
export function decimalOf(value: number | string): Dec {
  let text = typeof value === "number" ? String(value) : value.trim();
  if (/e/i.test(text)) text = Number(text).toFixed(12);
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) throw new RangeError(`Not a decimal: ${String(value)}`);
  const frac = match[3] ?? "";
  const n = BigInt(`${match[2] || "0"}${frac}` || "0");
  return { n: match[1] === "-" ? -n : n, k: frac.length };
}

const scale = (a: Dec, k: number): bigint => a.n * pow10(k - a.k);
const cmp = (a: Dec, b: Dec): number => {
  const k = Math.max(a.k, b.k);
  const x = scale(a, k);
  const y = scale(b, k);
  return x < y ? -1 : x > y ? 1 : 0;
};
const ofInt = (value: number): Dec => ({ n: BigInt(value), k: 0 });

/** floor(n / d) for d > 0 (BigInt division truncates toward zero). */
function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== BigInt(0) && (n < BigInt(0)) !== (d < BigInt(0)) ? q - BigInt(1) : q;
}

/** half_up = floor(x + 1/2) of n / d (contract pricing.halfUp). */
const halfUp = (n: bigint, d: bigint): bigint => floorDiv(BigInt(2) * n + d, BigInt(2) * d);

/** A decimal as plain text ("900.4", "1000"). */
function decimalText(a: Dec): string {
  const negative = a.n < BigInt(0);
  const digits = (negative ? -a.n : a.n).toString().padStart(a.k + 1, "0");
  const whole = a.k ? digits.slice(0, -a.k) : digits;
  const frac = a.k ? digits.slice(-a.k).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/* ------------------------------------------------------------------ validation */

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isWhole = (value: unknown): value is number => isNumber(value) && Number.isInteger(value);
const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * contract.json#commissionSteps.validation: null when the steps are valid (null and [] = no steps), else the first
 * problem in step order, then in the order of problems — the same answer as the server's 400 (details step / problem).
 */
export function validateSteps(steps: unknown): StepProblem | null {
  if (steps === null || steps === undefined) return null;
  if (!Array.isArray(steps)) return { step: null, problem: "not_a_list" };
  if (steps.length > MAX_STEPS) return { step: null, problem: "too_many_steps" };
  let previous: number | null = null;
  for (let index = 0; index < steps.length; index += 1) {
    const step: unknown = steps[index];
    if (!isPlain(step) || ("pct" in step) === ("amountMinor" in step)) return { step: index, problem: "pct_or_amount" };
    if (!("upToMinor" in step)) return { step: index, problem: "up_to_missing" };
    const last = index === steps.length - 1;
    const up = step["upToMinor"];
    if ("pct" in step && (!isNumber(step["pct"]) || step["pct"] < PCT_MIN || step["pct"] > PCT_MAX)) return { step: index, problem: "pct_out_of_range" };
    if ("amountMinor" in step && (!isWhole(step["amountMinor"]) || step["amountMinor"] < 0)) return { step: index, problem: "amount_out_of_range" };
    if (up === null && !last) return { step: index, problem: "above_not_last" };
    if (up !== null && last) return { step: index, problem: "last_not_above" };
    if (up !== null && (!isWhole(up) || up <= 0)) return { step: index, problem: "up_to_out_of_range" };
    if (up !== null && previous !== null && (up as number) <= previous) return { step: index, problem: "up_to_not_increasing" };
    previous = up as number | null;
  }
  return null;
}

/* ------------------------------------------------------------------ pick and money */

/** The first step whose upToMinor is null ("above") or ≥ the exact base ("up to X" includes X); null = no steps. */
export function pickStep(steps: readonly CommissionStep[] | null | undefined, base: number | string): number | null {
  const exact = decimalOf(base);
  const list = steps ?? [];
  for (let index = 0; index < list.length; index += 1) {
    const up = list[index].upToMinor;
    if (up === null || cmp(exact, ofInt(up)) <= 0) return index;
  }
  return null;
}

/** The driver's part of the base for one % or fixed commission, half_up to a whole minor unit, never below 0. */
function ridePartOf(base: Dec, step: { pct?: number; amountMinor?: number }): number {
  const b = base.n < BigInt(0) ? { n: BigInt(0), k: base.k } : base;
  if (step.amountMinor !== undefined) {
    const amount = ofInt(step.amountMinor);
    const commission = cmp(amount, b) < 0 ? amount : b;
    const rest = scale(b, b.k) - scale(commission, b.k);
    const part = halfUp(rest, pow10(b.k));
    return Math.max(0, Number(part));
  }
  const pct = decimalOf(step.pct ?? 0);
  // base × (1 − pct / 100) = b.n × (100·10^pk − pct.n) / (10^bk · 10^pk · 100)
  const keep = BigInt(100) * pow10(pct.k) - pct.n;
  const part = halfUp(b.n * keep, pow10(b.k) * pow10(pct.k) * BigInt(100));
  return Math.max(0, Number(part));
}

export type RideSplit = {
  /** The step used (index from 0), or null when the % commission is used (no steps). */
  step: number | null;
  /** What the driver gets of the base (waiting and stop waiting are added on top, 100 % his). */
  driverRidePart: number;
  /** Movera's commission = base − driverRidePart, as a number (may have decimals with an exact base). */
  commission: number;
  /** The same commission as exact decimal text ("900.4"). */
  commissionText: string;
};

/**
 * contract.json#commissionSteps.pick + money + noSteps: the driver's ride part and Movera's commission for an exact
 * commission base (ride part + extras − waiting − stop waiting) in minor units.
 */
export function splitRidePart(rule: CommissionRule, base: number | string): RideSplit {
  const exact = decimalOf(base);
  const steps = rule.steps ?? [];
  const step = pickStep(steps, base);
  const driverRidePart = ridePartOf(exact, step === null ? { pct: rule.pct } : steps[step]);
  const left: Dec = { n: exact.n - BigInt(driverRidePart) * pow10(exact.k), k: exact.k };
  const commissionText = decimalText(left);
  return { step, driverRidePart, commission: Number(commissionText), commissionText };
}

/**
 * contract.json#commissionSteps.warn (ADVISORY: the admin may still save): for each limit L with a next step, a
 * warning when the driver's ride part at base L (step i) is greater than at base L + 1 minor unit (step i + 1).
 * Checked only on valid steps; equal is no warning.
 */
export function stepWarnings(steps: readonly CommissionStep[] | null | undefined): StepWarning[] {
  const list = steps ?? [];
  if (validateSteps(list)) return [];
  const out: StepWarning[] = [];
  for (let index = 0; index < list.length - 1; index += 1) {
    const limit = list[index].upToMinor as number;
    const atLimit = ridePartOf(ofInt(limit), list[index]);
    const justAbove = ridePartOf(ofInt(limit + 1), list[index + 1]);
    if (atLimit > justAbove) out.push({ step: index, upToMinor: limit, atLimit, justAbove });
  }
  return out;
}

/* ------------------------------------------------------------------ calculator */

export type Calculation =
  | { ok: true; split: RideSplit; driverGets: number }
  | { ok: false; problem: StepProblem };

/**
 * contract.json#commissionSteps.adminCalculator (v0.18.88, owner 2026-11-14 "And why its complicate ?!": ONE simple
 * calculator): the card's steps as edited (before saving) and ONE trip price (the commission base, exact, minor units)
 * → the split behind the card's two result lines (resultLines: "Driver gets" / "Movera gets", amounts only). No rows
 * around the limits, no step or % line (adminCalculator.removed). Invalid steps → the validation problem.
 */
export function calculate(rule: CommissionRule, base: number | string): Calculation {
  const problem = validateSteps(rule.steps);
  if (problem) return { ok: false, problem };
  const split = splitRidePart(rule, base);
  return { ok: true, split, driverGets: split.driverRidePart };
}

/**
 * The card's two result lines (owner 2026-11-14 "simply write only how much in amount driver get and how much movera
 * get in amount dont write any percentage"; contract v0.18.88 adminCalculator): for a trip price (the commission base,
 * minor units) → what the driver gets (his ride part) and what Movera gets = the commission + the app fee the rider pays
 * on top (half-up to a whole minor unit), as ONE amount. Invalid steps → the validation problem instead of numbers.
 */
export function resultLines(rule: CommissionRule, baseMinor: number, appFeePct: number): { ok: true; driverGets: number; moveraGets: number } | { ok: false; problem: StepProblem } {
  const calc = calculate(rule, baseMinor);
  if (!calc.ok) return calc;
  return { ok: true, driverGets: calc.driverGets, moveraGets: calc.split.commission + appFeeHalfUp(baseMinor, appFeePct) };
}

/**
 * The app fee the rider pays on top of a price (minor units): price × appFeePct / 100, exact decimal half_up to a whole
 * minor unit (contract pricing.halfUp), never float: 5500 öre at 0.7 % = 38.5 → 39 (float floor(x + 0.5) gave 38).
 */
export function appFeeHalfUp(priceMinor: number | string, appFeePct: number): number {
  const price = decimalOf(priceMinor);
  const pct = decimalOf(appFeePct);
  return Number(halfUp(price.n * pct.n, pow10(price.k) * pow10(pct.k) * BigInt(100)));
}

/**
 * The commission on a fare given in MAJOR units (kr, €, DT), for the previews that show a sample fare (Dispatch offer
 * card, fare raise). Same rule as the server: the steps when there are any, else the %. Returns major units.
 */
export function commissionOfMajor(rule: CommissionRule, fareMajor: number, minorUnits: number): { commission: number; driver: number; step: number | null } {
  const base = baseMinorOf(Math.max(0, fareMajor), minorUnits);
  const split = splitRidePart(rule, base);
  return { commission: split.commission / minorUnits, driver: split.driverRidePart / minorUnits, step: split.step };
}


/** A car type's commission rule from a zone book (its % and its steps). */
export function ruleOf(book: { commission: Record<string, number>; commissionSteps?: Record<string, readonly CommissionStep[]> }, categoryId: string): CommissionRule {
  return { pct: book.commission[categoryId] ?? 20, steps: book.commissionSteps?.[categoryId] ?? [] };
}

/**
 * A major-unit amount (float, e.g. 197.00000000000003) as an exact minor-unit base: float noise below 1e-6 of a minor
 * unit is dropped, real fractions of a minor unit are kept (the pick uses the exact base).
 */
export function baseMinorOf(major: number, minorUnits: number): string {
  return String(Number((major * minorUnits).toFixed(6)));
}

/* ------------------------------------------------------------------ editing helpers */

/** "Add step": with no steps, one "up to" step and the "above" step (both at the card's %); else a step before "above". */
export function addStep(steps: readonly CommissionStep[], pct: number, gapMinor: number): CommissionStep[] {
  if (!steps.length) return [{ upToMinor: gapMinor, pct }, { upToMinor: null, pct }];
  const list = steps.map((step) => ({ ...step }));
  const limits = list.map((step) => step.upToMinor).filter((value): value is number => value !== null);
  const previous = limits.length ? Math.max(...limits) : 0;
  const above = list[list.length - 1];
  const copy: CommissionStep = above.amountMinor !== undefined ? { upToMinor: previous + gapMinor, amountMinor: above.amountMinor } : { upToMinor: previous + gapMinor, pct: above.pct ?? pct };
  list.splice(list.length - 1, 0, copy);
  return list;
}

/** "Remove step": the steps without row i; the last row left is always "above" (a single row left stays as "above"). */
export function removeStep(steps: readonly CommissionStep[], index: number): CommissionStep[] {
  const list = steps.filter((_, i) => i !== index).map((step) => ({ ...step }));
  if (list.length) list[list.length - 1] = { ...list[list.length - 1], upToMinor: null };
  return list;
}

/** Switch a step between % and a fixed amount (the other value is dropped: a step has exactly one). */
export function setStepKind(step: CommissionStep, kind: "pct" | "amount", pct: number): CommissionStep {
  if (kind === "pct") return step.pct !== undefined ? step : { upToMinor: step.upToMinor, pct };
  return step.amountMinor !== undefined ? step : { upToMinor: step.upToMinor, amountMinor: 0 };
}

/** The steps in another currency (Copy zones between countries): amounts × rate, whole minor units, limits kept rising. */
export function convertSteps(steps: readonly CommissionStep[], fromMinor: number, toMinor: number, rate: number): CommissionStep[] {
  let previous = 0;
  return steps.map((step) => {
    const up = step.upToMinor === null ? null : Math.max(previous + 1, Math.round((step.upToMinor / fromMinor) * rate * toMinor));
    if (up !== null) previous = up;
    if (step.amountMinor !== undefined) return { upToMinor: up, amountMinor: Math.max(0, Math.round((step.amountMinor / fromMinor) * rate * toMinor)) };
    return { upToMinor: up, pct: step.pct };
  });
}

export const sameSteps = (a: readonly CommissionStep[] | undefined, b: readonly CommissionStep[] | undefined): boolean => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
