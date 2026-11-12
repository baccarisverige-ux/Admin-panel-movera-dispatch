/**
 * B1.26b fix (supervisor NO-GO on b2dd1a3): `/incidents?case=<id>` must open THAT case. Live, the Incidents page
 * holds only the open cases and the history pages loaded so far, so an old closed case is read by id
 * (GET /admin/incidents/{id}); a case that is nowhere says "not found" instead of opening the first case.
 */

type Row = { readonly id: string };

/** The case to read by id: live, the address names a case that neither the open cases nor the loaded history hold. */
export function caseToRead(caseId: string | null, live: boolean, open: readonly Row[] | undefined, history: readonly Row[] | undefined): string | null {
  if (!live || !caseId || !open || !history) return null;
  return open.some((row) => row.id === caseId) || history.some((row) => row.id === caseId) ? null : caseId;
}

/**
 * The case on screen. With a case in the address: that case (even when the Show filter hides it), nothing while it
 * is still being read, else `missing` (never another case). Without one: the case on screen before (the list
 * reorders after Take), else the first.
 */
export function pickCase<T extends Row>(shown: readonly T[], all: readonly T[], selectedId: string | null, lastShownId: string | null, loading: boolean): { item: T | null; missing: string | null } {
  if (selectedId) {
    const found = shown.find((row) => row.id === selectedId) ?? all.find((row) => row.id === selectedId) ?? null;
    return { item: found, missing: found || loading ? null : selectedId };
  }
  return { item: shown.find((row) => row.id === lastShownId) ?? shown[0] ?? null, missing: null };
}
