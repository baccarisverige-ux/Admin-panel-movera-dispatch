/**
 * Q132 round 2 (SF-2): the options useRidersData passes to its five reads. `enabled: false` reads none of them (the
 * live alert bar needs no rider data); otherwise they read as before (the riders' trips every 30 s).
 */
export type RidersReadOptions = { enabled?: false; refetchMs?: number };

export function ridersReadOptions(options: { enabled?: boolean }): Record<"riders" | "trips" | "drivers" | "tickets" | "care", RidersReadOptions> {
  const off: { enabled?: false } = options.enabled === false ? { enabled: false } : {};
  return { riders: off, trips: { refetchMs: 30_000, ...off }, drivers: off, tickets: off, care: off };
}
