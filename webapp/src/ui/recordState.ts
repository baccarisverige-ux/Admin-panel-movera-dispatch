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

type Read = { isLoading: boolean; isError: boolean; isSuccess?: boolean; data?: unknown };

/** The payout / incident page (pages/RecordPage.tsx): a retrying read stays "Loading"; only a failed read is "not found". */
export function recordPageState(found: boolean, records: Read): RecordState {
  return recordState({ found, waiting: records.isLoading, missing: records.isError });
}

/**
 * The trip page (pages/TripPage.tsx). A failed read by id is "not found" at once; "no such trip" from the read by id
 * counts only once the list is loaded too (the list may still hold it). Driver and car lists are waited for only when
 * the trip is there.
 */
export function tripPageState(input: { found: boolean; listed: boolean; trips: Read; single: Read; others: boolean }): RecordState {
  const { found, listed, trips, single } = input;
  const missing = !listed && (single.isError || (Boolean(single.isSuccess) && !single.data && !trips.isLoading));
  const state = recordState({ found, waiting: trips.isLoading || (!listed && single.isLoading), missing });
  return state === "found" && input.others ? "loading" : state;
}
