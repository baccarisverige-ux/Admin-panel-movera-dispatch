// Admin lazy-load job (2026-11-16): two small driver helpers, kept apart from the live client (liveAdminApi.ts
// re-exports them) so realOnly.ts and useDriverPerformance.ts do not pull the whole live client into their chunk.
import type { LiveDriverFacts } from "../api/seed.ts";
import { mainDocuments } from "./format.ts";
import type { DocumentSummary, DriverPerformance } from "./types.ts";

/** The demo's one-word document state of a person or car. */
export function docState(all: readonly DocumentSummary[] = [], required: readonly string[] = []): string {
  // v0.18.5 (G2-D1): a renewal waiting or refused does not change the state of the approved document.
  const documents = mainDocuments(all);
  if (documents.some((doc) => doc.status === "rejected")) return "rejected";
  if (documents.some((doc) => doc.status === "expired")) return "expired";
  const have = new Set(documents.filter((doc) => doc.status !== "missing").map((doc) => doc.type));
  if (required.some((type) => !have.has(type))) return "needed";
  if (documents.some((doc) => doc.status === "in_review")) return "in_review";
  return "approved";
}

/** G3-D2: the three numbers the panel shows from Driver.performance (null stays null → "—"). */
export function performanceFacts(performance: DriverPerformance): NonNullable<LiveDriverFacts["performance"]> {
  return { acceptancePct: performance.acceptancePct ?? null, cancellationPct: performance.cancellationPct ?? null, rating: performance.rating ?? null };
}
