/**
 * When Confirm of a CommandButton dialog may be pressed. Pure (node --test covers it) and small: it is in the first
 * download, with the dialog shell.
 *
 * Supervisor MF-R3-1 (Rules audits/impact/country-undo-supervisor.md, Round 3): the zone pick and its sentences
 * (live/WhereItLands.tsx) load on demand. Until they are in, the admin cannot see where the setting lands, so Confirm
 * stays off, also when the one place of the dialog is ticked at open; and it stays off when they could not be loaded.
 */
export type WhereLoad = "loading" | "ready" | "failed";
export type WhereShape = { zoneIds: readonly string[]; pick?: boolean };

/** One place: nothing to choose between, it is named and already ticked. More: each is ticked again by hand. */
export function initialTicks(where?: WhereShape): string[] {
  return where && where.zoneIds.length === 1 ? [...where.zoneIds] : [];
}

/** Every place is ticked again; with `pick` at least one (and only those are sent). */
export function placedOk(where: WhereShape | undefined, ticked: readonly string[]): boolean {
  if (!where) return true;
  return where.pick ? ticked.length > 0 : where.zoneIds.every((id) => ticked.includes(id));
}

export function canConfirm(input: { where?: WhereShape; ticked: readonly string[]; whereLoad: WhereLoad; typedOk: boolean; reasonOk: boolean; sureOk: boolean }): boolean {
  if (input.where && input.whereLoad !== "ready") return false;
  return input.typedOk && input.reasonOk && input.sureOk && placedOk(input.where, input.ticked);
}
