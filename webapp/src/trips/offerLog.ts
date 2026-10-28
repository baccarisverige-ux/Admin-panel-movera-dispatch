import type { DemoRecord } from "../api/seed.ts";
import { timelineOf } from "./present.ts";
import { isLiveData, liveTripOf } from "../live/realData.ts";
import { OFFER_STATUS_LABEL, type AdminOffer } from "../dispatch/assign.ts";

/**
 * The offer log of a trip (Round 3, Q28): one line per step, with times. Scheduled rides → Home popup →
 * Exclusive (to whom and the answer) → Radar (how many saw it), who tried to take it, who won and who got
 * "No longer available". Demo lines come from the trip id, so every trip always shows the same log.
 */

export type OfferStepKind = "list" | "home" | "exclusive" | "radar" | "tried" | "won" | "lost" | "none";
export type OfferStep = { at: string; kind: OfferStepKind; title: string; detail: string; driverIds: string[] };

export const OFFER_STEP_LABEL: Record<OfferStepKind, string> = {
  list: "Scheduled rides",
  home: "Home popup",
  exclusive: "Exclusive",
  radar: "Radar",
  tried: "Tried to take it",
  won: "Won",
  lost: "No longer available",
  none: "No driver",
};

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

const plus = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

/** A ride booked for later goes through Scheduled rides and the Home popup first. About one trip in four. */
export function isScheduledTrip(trip: Pick<DemoRecord, "id">): boolean {
  const live = liveTripOf(trip);
  if (live) return live.kind === "scheduled";
  if (isLiveData()) return false;
  return hash(`${trip.id}:scheduled`) % 4 === 0;
}

/** Live: one line per offer the server sent (GET /admin/trips/{id}/offers), at the time the offer ran out. */
export function offerLogFromServer(offers: readonly AdminOffer[]): OfferStep[] {
  return [...offers]
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
    .map((offer) => {
      const kind: OfferStepKind = offer.status === "claimed" ? "won" : offer.kind === "radar" ? "radar" : "exclusive";
      const who = offer.driverName || offer.driverId;
      return { at: offer.expiresAt, kind, title: OFFER_STEP_LABEL[kind], detail: `${who ? `${who} · ` : ""}${OFFER_STATUS_LABEL[offer.status] ?? offer.status}`, driverIds: offer.driverId ? [offer.driverId] : [] };
    });
}

export function offerLog(trip: DemoRecord, drivers: readonly { id: string; name: string; zoneId?: string }[], serverOffers?: readonly AdminOffer[]): OfferStep[] {
  if (liveTripOf(trip) || isLiveData()) return offerLogFromServer(serverOffers ?? []);
  const timeline = timelineOf(trip);
  const searched = timeline.find((item) => item.code === "searching")?.at ?? timeline.find((item) => item.code === "requested")?.at;
  if (!searched) return [];
  const accepted = timeline.find((item) => item.code === "accepted")?.at ?? null;
  const seed = hash(trip.id);
  const near = drivers.filter((row) => row.id !== trip.driverId && (!row.zoneId || row.zoneId === trip.zoneId));
  const pool = near.length >= 4 ? near : drivers.filter((row) => row.id !== trip.driverId);
  const pick = (step: number) => pool.length ? pool[(seed + step * 7) % pool.length] : null;
  const name = (id: string) => drivers.find((row) => row.id === id)?.name ?? id;
  const steps: OfferStep[] = [];
  const add = (at: string, kind: OfferStepKind, detail: string, driverIds: string[] = []) => steps.push({ at, kind, title: OFFER_STEP_LABEL[kind], detail, driverIds });

  if (isScheduledTrip(trip)) {
    const booked = plus(searched, -3 * 3600);
    const listed = 12 + (seed % 30);
    add(booked, "list", `Shown to ${listed} drivers in Scheduled rides. Nobody took it.`);
    const closer = pick(5);
    add(plus(booked, 600), "home", `Popped up on Home for ${8 + (seed % 12)} online drivers.${closer ? ` ${closer.name} closed it with ×.` : ""}`, closer ? [closer.id] : []);
  }

  // Exclusive, one driver at a time, 15 s each.
  let t = 0;
  const misses = seed % 3;
  const exclusiveWins = Boolean(trip.driverId && accepted && seed % 5 === 0);
  for (let step = 0; step < misses; step += 1) {
    const driver = pick(step);
    if (!driver) break;
    add(plus(searched, t), "exclusive", `To ${driver.name} · ${step % 2 === 0 ? "no answer in 15 s" : "said no"}`, [driver.id]);
    t += 15;
  }
  if (exclusiveWins && trip.driverId) {
    add(plus(searched, t), "exclusive", `To ${name(trip.driverId)} · accepted`, [trip.driverId]);
    add(accepted ?? plus(searched, t + 4), "won", `${name(trip.driverId)} accepted the Exclusive offer.`, [trip.driverId]);
    return steps;
  }

  // Then Radar: many see it at once, the first tap wins.
  const seen = 3 + (seed % 7);
  add(plus(searched, t + 1), "radar", `Seen by ${seen} drivers within ${3 + (seed % 3)} km.`);
  if (!trip.driverId || !accepted) {
    add(plus(searched, t + 60), "none", "Nobody took it yet.");
    return steps;
  }
  const rivals = [pick(3), pick(4)].filter((row): row is NonNullable<typeof row> => Boolean(row) && row!.id !== trip.driverId);
  const unique = rivals.filter((row, index) => rivals.findIndex((other) => other.id === row.id) === index).slice(0, 1 + (seed % 2));
  const wonAt = plus(accepted, -2);
  add(plus(wonAt, -1), "tried", [...unique.map((row) => row.name), name(trip.driverId)].join(", "), [...unique.map((row) => row.id), trip.driverId]);
  add(wonAt, "won", `${name(trip.driverId)} tapped first.`, [trip.driverId]);
  if (unique.length) add(plus(wonAt, 1), "lost", `${unique.map((row) => row.name).join(", ")} got “No longer available”.`, unique.map((row) => row.id));
  return steps;
}

/** The offer answers for the trip's timeline, from the same log: each Exclusive answer and who said yes. */
export type TimelineOffer = { at: string; driverId: string; answer: "accepted" | "declined" | "no answer" };

export function timelineOffers(steps: readonly OfferStep[]): TimelineOffer[] {
  return steps.flatMap((step): TimelineOffer[] => {
    if (step.kind === "won") return [{ at: step.at, driverId: step.driverIds[0] ?? "", answer: "accepted" }];
    if (step.kind === "radar") return [];
    if (step.kind === "exclusive" && !step.detail.endsWith("accepted")) return [{ at: step.at, driverId: step.driverIds[0] ?? "", answer: step.detail.endsWith("said no") || step.detail.endsWith(OFFER_STATUS_LABEL.declined) ? "declined" : "no answer" }];
    return [];
  });
}
