/**
 * Launch fix 2026-11-20 (audit admin-every-control: /trips/trp_bogus and /payouts/pyt_none stayed on "Loading" for 15 s
 * or more). What a record page (a trip, a payout) shows: the record once found; "not found" as soon as the read by id
 * says it does not exist or the read failed, even while a list read is still retrying; "Loading" only while waiting.
 */
export type RecordState = "found" | "loading" | "not-found";

export function recordState(input: { found: boolean; waiting: boolean; missing: boolean }): RecordState {
  if (input.found) return "found";
  if (input.missing) return "not-found";
  return input.waiting ? "loading" : "not-found";
}
