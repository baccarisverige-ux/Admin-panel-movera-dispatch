import type { MarketId } from "../markets/markets.ts";
import { DRIVER_DOCUMENTS, type DocId, type DocStatus } from "./gate.ts";
import type { SettingsBook } from "./onboardingSettings.ts";

/**
 * Onboarding: the steps a new driver goes through in each country, which documents are needed,
 * how long each step may take, reminders, and where applicants get stuck.
 */

export const ONBOARDING_KEY = "onboardingRules";

export type StepId = "signup" | "documents" | "checks" | "training" | "ready";

export const STEPS: { id: StepId; label: string; help: string }[] = [
  { id: "signup", label: "Signed up", help: "Made an account, nothing uploaded yet." },
  { id: "documents", label: "Documents", help: "Uploading and waiting for review of the papers." },
  { id: "checks", label: "Checks", help: "Bank details and the car are checked." },
  { id: "training", label: "Training", help: "Terms accepted and the training session done." },
  { id: "ready", label: "Ready to activate", help: "Everything is approved. An admin activates the account." },
];

/** Documents that belong to the training step instead of the documents step. */
export const TRAINING_DOCS: DocId[] = ["terms", "virtual_session"];

export type StepRule = { id: StepId; on: boolean; days: number };
/**
 * docWarnDays: before a document expires the driver gets a warning on the island and in the app, with "Upload new", this many days before
 * (largest first). blockAtExpiry: on the expiry day the driver can't go online until an admin approves the new document.
 */
export type CountryOnboarding = { steps: StepRule[]; docs: DocId[]; reminders: boolean; remindEveryDays: number; stuckAfterDays: number; docWarnDays: number[]; blockAtExpiry: boolean };
export type Reminder = { driverId: string; at: string; by: string; step: StepId };
export type OnboardingRules = { draftRev: number; countries: Record<MarketId, CountryOnboarding>; reminders: Reminder[] };

function defaults(country: MarketId): CountryOnboarding {
  const docs = DRIVER_DOCUMENTS.filter((id) => country === "SE" || (id !== "taxi_traffic_permit" && id !== "tax_settings"));
  return {
    steps: STEPS.map((step) => ({ id: step.id, on: true, days: step.id === "signup" ? 3 : step.id === "documents" ? 7 : step.id === "checks" ? 3 : step.id === "training" ? 5 : 2 })),
    docs,
    reminders: true,
    remindEveryDays: 2,
    stuckAfterDays: 10,
    docWarnDays: [30, 7, 1],
    blockAtExpiry: true,
  };
}

export function emptyOnboardingRules(): OnboardingRules {
  return { draftRev: 1, countries: { SE: defaults("SE"), FR: defaults("FR"), TN: defaults("TN") }, reminders: [] };
}

export function normalizeOnboardingRules(value: unknown): OnboardingRules {
  const base = emptyOnboardingRules();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<OnboardingRules>;
  const countries = { ...base.countries };
  for (const id of Object.keys(base.countries) as MarketId[]) {
    const saved = raw.countries?.[id];
    if (saved) countries[id] = { ...base.countries[id], ...saved, steps: base.countries[id].steps.map((step) => ({ ...step, ...(saved.steps?.find((row) => row.id === step.id) ?? {}) })), docWarnDays: Array.isArray(saved.docWarnDays) && saved.docWarnDays.every((day) => typeof day === "number") ? saved.docWarnDays : base.countries[id].docWarnDays, blockAtExpiry: typeof saved.blockAtExpiry === "boolean" ? saved.blockAtExpiry : base.countries[id].blockAtExpiry };
  }
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, countries, reminders: Array.isArray(raw.reminders) ? raw.reminders : [] };
}

/** The country's first document warning, in days before expiry. Documents show orange from then. */
export function firstWarningDays(rules: OnboardingRules, country: MarketId): number {
  const days = rules.countries[country]?.docWarnDays ?? [];
  return days.length ? Math.max(...days) : 30;
}

const DONE: DocStatus[] = ["approved", "expiring"];

export type Applicant = {
  id: string;
  name: string;
  zoneId: string;
  fleet: boolean;
  status: string;
  docs: Record<DocId, { status: DocStatus }>;
  bankOk: boolean;
  carOk: boolean;
  /** A demo sign-up with no account record yet. */
  lead?: boolean;
};

/** The documents this applicant needs in the documents step. Fleet drivers skip company registration. */
export function neededDocs(rules: CountryOnboarding, fleet: boolean): DocId[] {
  return rules.docs.filter((id) => !TRAINING_DOCS.includes(id) && !(fleet && id === "company_registration"));
}

export function stepOf(applicant: Applicant, rules: CountryOnboarding): StepId {
  if (applicant.lead) return "signup";
  const on = (id: StepId) => rules.steps.find((step) => step.id === id)?.on !== false;
  const needed = neededDocs(rules, applicant.fleet);
  const uploaded = needed.filter((id) => applicant.docs[id]?.status !== "needed").length;
  if (on("signup") && uploaded === 0 && needed.length) return "signup";
  if (on("documents") && needed.some((id) => !DONE.includes(applicant.docs[id]?.status))) return "documents";
  if (on("checks") && (!applicant.bankOk || !applicant.carOk)) return "checks";
  if (on("training") && TRAINING_DOCS.filter((id) => rules.docs.includes(id)).some((id) => !DONE.includes(applicant.docs[id]?.status))) return "training";
  return "ready";
}

/** Documents done out of needed, for the card. */
export function docProgress(applicant: Applicant, rules: CountryOnboarding): { done: number; total: number; waiting: number } {
  const needed = neededDocs(rules, applicant.fleet);
  return {
    done: needed.filter((id) => DONE.includes(applicant.docs[id]?.status)).length,
    total: needed.length,
    waiting: needed.filter((id) => applicant.docs[id]?.status === "in_review").length,
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

/** Days in the current step: demo values from the id until the backend keeps the real dates. */
export function daysInStep(applicant: Applicant): number {
  return hash(`${applicant.id}:${applicant.status}`) % 14;
}

export type Timing = { days: number; limit: number; late: boolean; stuck: boolean };

export function timing(applicant: Applicant, step: StepId, rules: CountryOnboarding): Timing {
  const days = daysInStep(applicant);
  const limit = rules.steps.find((row) => row.id === step)?.days ?? 7;
  return { days, limit, late: days > limit, stuck: days >= rules.stuckAfterDays };
}

/** Is a reminder due: reminders on, the applicant waits on themself, and none was sent recently. */
export function reminderDue(applicant: Applicant, step: StepId, rules: OnboardingRules, country: MarketId, now: number): boolean {
  const settings = rules.countries[country];
  if (!settings.reminders || step === "ready" || step === "checks") return false;
  const last = rules.reminders.filter((item) => item.driverId === applicant.id).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (!last) return daysInStep(applicant) >= settings.remindEveryDays;
  return now - Date.parse(last.at) >= settings.remindEveryDays * 86_400_000;
}

export function remind(rules: OnboardingRules, driverId: string, step: StepId, by: string, at: string): OnboardingRules {
  return { ...rules, draftRev: rules.draftRev + 1, reminders: [...rules.reminders, { driverId, step, by, at }] };
}

/** Demo sign-ups that have not uploaded anything yet, per country. */
export function demoLeads(country: MarketId, zoneIds: readonly string[]): Applicant[] {
  const names: Record<MarketId, string[]> = {
    SE: ["Elin Berg", "Omar Said", "Viktor Lund", "Sanna Ek", "Jonas Ali"],
    FR: ["Hugo Petit", "Sarah Benali", "Théo Garnier", "Nina Roussel"],
    TN: ["Ali Gharbi", "Sonia Mejri", "Walid Ayari", "Hiba Khelifi"],
  };
  return names[country].map((name, index) => ({
    id: `L-${country}-${index + 1}`,
    name,
    zoneId: zoneIds[index % Math.max(zoneIds.length, 1)] ?? "",
    fleet: false,
    status: "signup",
    docs: Object.fromEntries(DRIVER_DOCUMENTS.map((id) => [id, { status: "needed" as DocStatus }])) as Applicant["docs"],
    bankOk: false,
    carOk: false,
    lead: true,
  }));
}

export type Funnel = { step: StepId; label: string; now: number; reached: number; pct: number }[];

/**
 * The last 30 days as a funnel: how many reached each step. Demo history, scaled from the
 * applicants and the drivers already active, until the backend counts sign-ups for real.
 */
export function funnel(applicants: readonly Applicant[], activeLast30: number, rules: CountryOnboarding): Funnel {
  const steps = STEPS.filter((step) => rules.steps.find((row) => row.id === step.id)?.on !== false);
  const index = (id: StepId) => steps.findIndex((step) => step.id === id);
  const counts = steps.map((step) => applicants.filter((applicant) => stepOf(applicant, rules) === step.id).length);
  const reached = steps.map((_, at) => counts.slice(at).reduce((sum, value) => sum + value, 0) + activeLast30);
  const first = reached[0] || 1;
  return steps.map((step, at) => ({ step: step.id, label: step.label, now: counts[index(step.id)], reached: reached[at], pct: Math.round((reached[at] / first) * 100) }));
}

export function rulesError(rules: CountryOnboarding): string | null {
  if (!rules.steps.some((step) => step.on)) return "Keep at least one step on.";
  for (const step of rules.steps) if (!Number.isInteger(step.days) || step.days < 1 || step.days > 60) return `${STEPS.find((row) => row.id === step.id)?.label}: 1 to 60 days.`;
  if (!rules.docs.includes("driver_license")) return "The driving licence is always needed.";
  if (rules.reminders && (rules.remindEveryDays < 1 || rules.remindEveryDays > 30)) return "Remind every 1 to 30 days.";
  if (rules.stuckAfterDays < 2 || rules.stuckAfterDays > 90) return "Stuck after 2 to 90 days.";
  if (!rules.docWarnDays.length || rules.docWarnDays.some((day) => !Number.isInteger(day) || day < 1 || day > 90)) return "Document warnings: 1 to 90 days before expiry.";
  if (rules.docWarnDays.some((day, index) => index > 0 && day >= rules.docWarnDays[index - 1])) return "Document warnings: each warning must come after the one before (fewer days).";
  return null;
}

/** Activation for this country: the country's documents, the bank and the car. */
export function countryActivationIssue(applicant: Applicant, rules: CountryOnboarding, vehicleIssue: string | null): string | null {
  const needed = [...neededDocs(rules, applicant.fleet), ...TRAINING_DOCS.filter((id) => rules.docs.includes(id))];
  const waiting = needed.filter((id) => !DONE.includes(applicant.docs[id]?.status));
  if (waiting.length) return `Still needed: ${waiting.join(", ")}`;
  if (vehicleIssue) return vehicleIssue;
  if (!applicant.bankOk) return "Bank details must be approved.";
  return null;
}

/** The text the driver gets in the app when a document is rejected or more is needed. */
export function driverMessage(name: string, doc: string, action: "rejected" | "needed", note: string): string {
  const first = name.split(" ")[0] ?? name;
  const reason = note.trim() ? ` Reason: ${note.trim()}` : "";
  return action === "rejected"
    ? `Hi ${first}, your ${doc.toLowerCase()} could not be approved.${reason} Please upload a new one in the Movera Driver app.`
    : `Hi ${first}, we need more information about your ${doc.toLowerCase()}.${reason} Please add it in the Movera Driver app.`;
}

/**
 * Contract v0.17.0 §25: the steps, sign-up reminders and expiry warnings come from the country's onboarding settings
 * document (the page Steps and papers publishes it). The demo board keeps its own paper list (demo document ids).
 */
export function withSettings(rules: OnboardingRules, book: SettingsBook): OnboardingRules {
  const countries = { ...rules.countries };
  for (const id of Object.keys(countries) as MarketId[]) {
    const doc = book.countries[id]?.document;
    if (!doc) continue;
    countries[id] = {
      ...countries[id],
      steps: countries[id].steps.map((step) => ({ ...step, ...(doc.steps.find((row) => row.id === step.id) ?? {}) })),
      reminders: doc.signUpReminders.on,
      remindEveryDays: doc.signUpReminders.everyDays,
      stuckAfterDays: doc.signUpReminders.stuckAfterDays,
      docWarnDays: [...doc.expiry.warnDays],
      blockAtExpiry: doc.expiry.blockAtExpiry,
    };
  }
  return { ...rules, countries };
}
