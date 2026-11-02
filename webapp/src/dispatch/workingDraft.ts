import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Live fix 2026-11-02 (audits/live-dispatch-2026-11-02.md 1e): the unpublished dispatch edits live outside the page,
 * so moving between sub-pages of the same section (Radar · Exclusive → Rules › Best driver) keeps them and one
 * publish covers all of a zone's Start & order settings. Kept per signed-in admin; another admin starts empty.
 */
export type WorkingDraft<Z, C> = { owner: string; zones: Record<string, Z>; countries: Record<string, C> };

type Store = WorkingDraft<unknown, unknown>;
let store: Store = { owner: "", zones: {}, countries: {} };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function readWorkingDraft<Z, C>(): WorkingDraft<Z, C> {
  return store as WorkingDraft<Z, C>;
}

export function updateWorkingDraft<Z, C>(patch: (current: WorkingDraft<Z, C>) => Partial<WorkingDraft<Z, C>>) {
  store = { ...store, ...(patch(store as WorkingDraft<Z, C>) as Partial<Store>) };
  emit();
}

export function clearWorkingDraft() {
  store = { owner: store.owner, zones: {}, countries: {} };
  emit();
}

/** True while any unpublished, unsaved edit is held (for the leave warnings). */
export function hasWorkingDraft(): boolean {
  return Object.keys(store.zones).length > 0 || Object.keys(store.countries).length > 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Updater<T> = Record<string, T> | ((current: Record<string, T>) => Record<string, T>);

export function useWorkingDraft<Z, C>(owner: string) {
  const snapshot = useSyncExternalStore(subscribe, () => store, () => store) as WorkingDraft<Z, C>;
  useEffect(() => {
    if (store.owner !== owner) {
      store = { owner, zones: {}, countries: {} };
      emit();
    }
  }, [owner]);
  const mine = snapshot.owner === owner ? snapshot : { owner, zones: {}, countries: {} };
  const setZones = useCallback((next: Updater<Z>) => updateWorkingDraft<Z, C>((current) => ({ zones: typeof next === "function" ? next(current.zones) : next })), []);
  const setCountries = useCallback((next: Updater<C>) => updateWorkingDraft<Z, C>((current) => ({ countries: typeof next === "function" ? next(current.countries) : next })), []);
  return { working: mine.zones, setWorking: setZones, workingCountry: mine.countries, setWorkingCountry: setCountries };
}
