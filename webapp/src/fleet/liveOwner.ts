import type { DemoRecord } from "../api/seed.ts";
import { REQUIRED_DOCUMENTS } from "../live/onboardingContract.ts";
import { mainDocuments } from "../live/format.ts";
import { docHealth, type HealthCount } from "./documents.ts";

/**
 * Owner G2 R3 (2026-10-30, "Real numbers only (Recommended)"): the live Fleet owners list, owner page and Fleets tab
 * show only the server's facts. A value the server does not send is null and the page writes "—"; nothing is seeded.
 */

const STATUS: Record<string, "approved" | "in_review" | "rejected" | "expired" | "needed"> = { approved: "approved", in_review: "in_review", rejected: "rejected", expired: "expired", missing: "needed" };

/** The owner's company documents: the country's fleet list (requiredFleetDocuments, else the contract's), counted from the server's documents. */
export function liveCompanyDocs(facts: DemoRecord["liveAccount"] | undefined, country: string | undefined, nowMs: number, warnDays: number): { counts: HealthCount; total: number } {
  const required = facts?.requiredFleetDocuments ?? REQUIRED_DOCUMENTS[country ?? facts?.country ?? ""]?.fleet ?? [];
  const counts: HealthCount = { valid: 0, expiring: 0, invalid: 0, review: 0 };
  for (const type of required) {
    const doc = [...mainDocuments(facts?.documents)].reverse().find((item) => item.type === type);
    const health = docHealth({ status: STATUS[doc?.status ?? "missing"] ?? "needed", expiresAt: doc?.expiresAt?.slice(0, 10) ?? "" }, nowMs, warnDays).health;
    counts[health] += 1;
  }
  return { counts, total: required.length };
}

/** The driver's own documents (requiredDocuments), for the Fleets tab's crew rows. */
export function liveDriverDocs(facts: DemoRecord["liveAccount"] | undefined, nowMs: number, warnDays: number): { counts: HealthCount; total: number } | null {
  if (!facts) return null;
  const required = facts.requiredDocuments ?? REQUIRED_DOCUMENTS[facts.country ?? ""]?.driver ?? [];
  const counts: HealthCount = { valid: 0, expiring: 0, invalid: 0, review: 0 };
  for (const type of required) {
    const doc = [...mainDocuments(facts.documents)].reverse().find((item) => item.type === type);
    counts[docHealth({ status: STATUS[doc?.status ?? "missing"] ?? "needed", expiresAt: doc?.expiresAt?.slice(0, 10) ?? "" }, nowMs, warnDays).health] += 1;
  }
  return { counts, total: required.length };
}

/** The average of the server's driver ratings, null when none has one. */
export function liveAverageRating(crew: readonly DemoRecord[]): number | null {
  const ratings = crew.map((driver) => driver.liveDriver?.rating).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return ratings.length ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 100) / 100 : null;
}

/** The fleet's Movera code from the server (Fleet.code), "—" when it has none yet. */
export function liveFleetCode(owner: Pick<DemoRecord, "liveFleetCode">): string {
  return owner.liveFleetCode || "—";
}
