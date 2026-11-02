import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Live fix 2026-11-02 (audits/live-dispatch-2026-11-02.md 1e): the unpublished dispatch edits live outside the page,
 * so moving between sub-pages of the same section (Radar · Exclusive → Rules › Best driver) keeps them and one
 * publish covers all of a zone's Start & order settings. Kept per signed-in admin; another admin starts empty.
 *
 * Checker fix (PR #200): only the CHANGED fields are kept (a patch) together with the draft revision they were made
 * against. When another admin publishes meanwhile, the patch is re-applied on the new book: untouched fields take the
 * other admin's values, and a field both admins changed becomes a conflict the admin resolves (keep mine / take theirs).
 * Nothing is ever silently overwritten.
 */
export type FieldPath = string;
export type Conflict = { mine: unknown; theirs: unknown };
export type Patch = {
  /** draftRev of the book the changes are based on. */
  baseRev: number;
  /** path → the value in the book at baseRev (before my edit). */
  base: Record<FieldPath, unknown>;
  /** path → my value. */
  changes: Record<FieldPath, unknown>;
  /** paths another admin also changed since; publish waits until each is resolved. */
  conflicts: Record<FieldPath, Conflict>;
};
export type WorkingDraft = { owner: string; zones: Record<string, Patch>; countries: Record<string, Patch> };

let store: WorkingDraft = { owner: "", zones: {}, countries: {} };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const SEP = "\u0001";

/** Leaf paths (arrays are one leaf) whose value differs between a and b. */
export function diffPaths(a: unknown, b: unknown, prefix: FieldPath[] = []): FieldPath[] {
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((key) => diffPaths(a[key], b[key], [...prefix, key]));
  }
  return same(a, b) ? [] : [prefix.join(SEP)];
}

export function getPath(value: unknown, path: FieldPath): unknown {
  if (path === "") return value;
  let node = value;
  for (const key of path.split(SEP)) {
    if (!isObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

function setPath<T>(value: T, path: FieldPath, leaf: unknown): T {
  if (path === "") return leaf as T;
  const [key, ...rest] = path.split(SEP);
  const node: Record<string, unknown> = isObject(value) ? value : {};
  const next = { ...node } as Record<string, unknown>;
  if (leaf === undefined && !rest.length) delete next[key];
  else next[key] = setPath(node[key], rest.join(SEP), leaf);
  return next as T;
}

/** The book's value with my changes on top. */
export function applyPatch<T>(value: T, patch: Patch | undefined): T {
  if (!patch) return value;
  return Object.entries(patch.changes).reduce((acc, [path, leaf]) => setPath(acc, path, leaf), value);
}

/** A patch from the book's value (at rev) to my edited value; conflicts I have not resolved stay. */
export function makePatch(bookValue: unknown, edited: unknown, rev: number, previous?: Patch): Patch | undefined {
  const paths = diffPaths(bookValue, edited);
  if (!paths.length) return undefined;
  const conflicts = Object.fromEntries(Object.entries(previous?.conflicts ?? {}).filter(([path]) => paths.includes(path)).map(([path, c]) => [path, { ...c, mine: getPath(edited, path) }]));
  return {
    baseRev: rev,
    base: Object.fromEntries(paths.map((path) => [path, getPath(bookValue, path)])),
    changes: Object.fromEntries(paths.map((path) => [path, getPath(edited, path)])),
    conflicts,
  };
}

/**
 * Re-applies my patch on a newer book. A field the other admin left alone keeps my value; a field the other admin set to
 * my value is dropped from the patch; a field both of us changed differently becomes a conflict (mine is kept until the
 * admin chooses). Returns undefined when nothing of mine is left.
 */
export function rebasePatch(patch: Patch, newValue: unknown, newRev: number): Patch | undefined {
  if (patch.baseRev === newRev) return patch;
  const base: Record<FieldPath, unknown> = {};
  const changes: Record<FieldPath, unknown> = {};
  const conflicts: Record<FieldPath, Conflict> = {};
  for (const [path, mine] of Object.entries(patch.changes)) {
    const theirs = getPath(newValue, path);
    if (same(theirs, mine)) continue;
    base[path] = theirs;
    changes[path] = mine;
    if (!same(theirs, patch.base[path]) || patch.conflicts[path]) conflicts[path] = { mine, theirs };
  }
  if (!Object.keys(changes).length) return undefined;
  return { baseRev: newRev, base, changes, conflicts };
}

/** Resolves one conflict: "mine" keeps my value, "theirs" takes the other admin's (drops the field from my patch). */
export function resolveConflict(patch: Patch, path: FieldPath, choice: "mine" | "theirs"): Patch | undefined {
  const conflicts = { ...patch.conflicts };
  delete conflicts[path];
  if (choice === "mine") return { ...patch, conflicts };
  const changes = { ...patch.changes };
  const base = { ...patch.base };
  delete changes[path];
  delete base[path];
  return Object.keys(changes).length ? { ...patch, base, changes, conflicts } : undefined;
}

export function readWorkingDraft(): WorkingDraft {
  return store;
}

export function updateWorkingDraft(patch: (current: WorkingDraft) => Partial<WorkingDraft>) {
  store = { ...store, ...patch(store) };
  emit();
}

/** Throws away every unpublished edit; signOut also forgets whose they were. */
export function clearWorkingDraft(options: { signOut?: boolean } = {}) {
  store = { owner: options.signOut ? "" : store.owner, zones: {}, countries: {} };
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

/** Zones (and countries) with unpublished edits, for the reminder outside Dispatch. */
export function useWorkingDraftSummary(): { zones: string[]; countries: string[] } {
  const snapshot = useSyncExternalStore(subscribe, () => store, () => store);
  return { zones: Object.keys(snapshot.zones), countries: Object.keys(snapshot.countries) };
}

type Updater = Record<string, Patch> | ((current: Record<string, Patch>) => Record<string, Patch>);

export function useWorkingDraft(owner: string) {
  const snapshot = useSyncExternalStore(subscribe, () => store, () => store);
  useEffect(() => {
    if (store.owner !== owner) {
      store = { owner, zones: {}, countries: {} };
      emit();
    }
  }, [owner]);
  const mine = snapshot.owner === owner ? snapshot : { owner, zones: {}, countries: {} };
  const setZones = useCallback((next: Updater) => updateWorkingDraft((current) => ({ zones: typeof next === "function" ? next(current.zones) : next })), []);
  const setCountries = useCallback((next: Updater) => updateWorkingDraft((current) => ({ countries: typeof next === "function" ? next(current.countries) : next })), []);
  return { patches: mine.zones, setPatches: setZones, countryPatches: mine.countries, setCountryPatches: setCountries };
}

/** Sets one entry (undefined removes it). */
export function withEntry(map: Record<string, Patch>, id: string, patch: Patch | undefined): Record<string, Patch> {
  const next = { ...map };
  if (patch) next[id] = patch;
  else delete next[id];
  return next;
}
