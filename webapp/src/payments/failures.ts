import type { DemoRecord } from "../api/seed.ts";

/** Why a ride payment failed, and whether it is the rider's problem or Movera's. */
export type FailureCause = { kind: "rider" | "system"; reason: string };

const RIDER_REASONS = ["Card declined", "Not enough money", "Card expired", "Bank asked for verification", "Apple Pay payment rejected"];
const SYSTEM_REASONS = ["Payment provider timeout", "Payment provider unavailable", "Technical error"];

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function failureCause(payment: Pick<DemoRecord, "id">): FailureCause {
  const seed = hash(payment.id);
  return seed % 4 === 0
    ? { kind: "system", reason: SYSTEM_REASONS[(seed >>> 3) % SYSTEM_REASONS.length] }
    : { kind: "rider", reason: RIDER_REASONS[(seed >>> 3) % RIDER_REASONS.length] };
}

/** Demo: older failures were already followed up; roughly a third are still open. */
export function failureHandled(payment: Pick<DemoRecord, "id">): boolean {
  return (hash(`handled:${payment.id}`) >>> 5) % 3 !== 0;
}

export type FailureSummary = { count: number; rider: number; system: number; owedMinor: number };

export function openFailures(payments: readonly DemoRecord[]): FailureSummary {
  const open = payments.filter((payment) => payment.status === "failed" && !failureHandled(payment));
  return {
    count: open.length,
    rider: open.filter((payment) => failureCause(payment).kind === "rider").length,
    system: open.filter((payment) => failureCause(payment).kind === "system").length,
    owedMinor: open.reduce((sum, payment) => sum + (payment.fareOre ?? 0), 0),
  };
}
