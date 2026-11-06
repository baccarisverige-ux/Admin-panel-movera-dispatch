import { tr } from "../i18n/core.ts";

/**
 * v0.18.40 §64 (fix job 10, contract.json#blockedPairs; owner "Never told", "No, only Support"): a rider and a driver
 * who are never matched again. Admin › Trips › trip page: Block this pair (POST /admin/trips/{tripId}/block-pair,
 * riders.block). Admin › Rider and Driver pages: Blocked pairs (GET /admin/blocked-pairs, riders.read) with Undo
 * (DELETE /admin/blocked-pairs/{pairId}, riders.block) — the only undo; the apps have none.
 */
export type BlockedPair = { pairId: string; riderId: string; driverId: string; by: "admin" | "rider" | "driver"; reason?: string; tripId?: string; at: string; adminId?: string };
export type PairPerson = { riderId: string } | { driverId: string };

export function blockedPairsPath(person: PairPerson): string {
  return "riderId" in person ? `/admin/blocked-pairs?riderId=${encodeURIComponent(person.riderId)}` : `/admin/blocked-pairs?driverId=${encodeURIComponent(person.driverId)}`;
}
export async function readBlockedPairs(read: (path: string) => Promise<{ items: BlockedPair[] }>, person: PairPerson): Promise<BlockedPair[]> {
  return (await read(blockedPairsPath(person))).items;
}
export function blockPairCall(tripId: string, reason: string): { path: string; body: { reason?: string } } {
  const text = reason.trim().slice(0, 300);
  return { path: `/admin/trips/${encodeURIComponent(tripId)}/block-pair`, body: text ? { reason: text } : {} };
}
export const unblockPath = (pairId: string) => `/admin/blocked-pairs/${encodeURIComponent(pairId)}`;
export function pairByText(by: BlockedPair["by"]): string {
  return by === "rider" ? tr("Blocked by the rider (1-star rating)") : by === "driver" ? tr("Blocked by the driver (1-star rating)") : tr("Blocked by Support");
}
export const blockedPairsKey = (person: PairPerson) => ["live", "blocked-pairs", "riderId" in person ? `r:${person.riderId}` : `d:${person.driverId}`] as const;
