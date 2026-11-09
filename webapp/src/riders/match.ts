/**
 * U3 prep (START-HERE step 34, owner 2026-11-09): the admin panel joins a record to a rider by rider id. Phones will be
 * masked for some admin roles (steps 35–37), and two riders can share a first name, so phone and name only ever
 * decide when the record carries no id (demo data) AND they point at exactly one rider. This file is the one place
 * where that fallback lives.
 */

export type RiderKey = { riderId?: string | null; phone?: string | null; name?: string | null };
type RiderLike = { id: string; phone?: string; name?: string };

/** The rider a record is about: by id when the record has one, else by a unique phone, else by a unique name. */
export function matchRider<R extends RiderLike>(riders: readonly R[], key: RiderKey): R | undefined {
  if (key.riderId) return riders.find((rider) => rider.id === key.riderId);
  return unique(riders, (rider) => rider.phone, key.phone) ?? unique(riders, (rider) => rider.name, key.name);
}

/** Whether a record (ticket, incident, trip) is about this rider: id first, then a unique phone, then a unique name. */
export function belongsToRider<R extends RiderLike>(record: RiderKey, rider: R, riders: readonly R[]): boolean {
  return matchRider(riders, record)?.id === rider.id;
}

/** Two records about the same rider: ids when both have one, else the (non-empty) phone or name. */
export function sameRider(a: RiderKey, b: RiderKey): boolean {
  if (a.riderId && b.riderId) return a.riderId === b.riderId;
  return Boolean((a.phone && a.phone === b.phone) || (a.name && a.name === b.name));
}

function unique<R>(riders: readonly R[], read: (rider: R) => string | undefined, value: string | null | undefined): R | undefined {
  if (!value) return undefined;
  const found = riders.filter((rider) => read(rider) === value);
  return found.length === 1 ? found[0] : undefined;
}
