/**
 * U3 prep (START-HERE step 34, owner 2026-11-09): the admin panel joins a record to a rider by rider id. Phones will be
 * masked for some admin roles (steps 35–37), and two riders can share a first name, so phone and name only ever
 * decide when the record carries no id (demo data) AND they point at exactly one rider. This file is the one place
 * where that fallback lives. Step 34b: the same rule for drivers (tickets and incidents carry driverId).
 */

export type RiderKey = { riderId?: string | null; phone?: string | null; name?: string | null };
export type DriverKey = { driverId?: string | null; phone?: string | null; name?: string | null };
type PersonLike = { id: string; phone?: string; name?: string };

/** The person (rider or driver) a record is about: by id when the record has one, else by a unique phone, else by a unique name. */
function matchPerson<P extends PersonLike>(people: readonly P[], id: string | null | undefined, phone: string | null | undefined, name: string | null | undefined): P | undefined {
  if (id) return people.find((person) => person.id === id);
  return unique(people, (person) => person.phone, phone) ?? unique(people, (person) => person.name, name);
}

/** The rider a record is about: by id when the record has one, else by a unique phone, else by a unique name. */
export function matchRider<R extends PersonLike>(riders: readonly R[], key: RiderKey): R | undefined {
  return matchPerson(riders, key.riderId, key.phone, key.name);
}

/** Step 34b: the driver a record (ticket, incident) is about, by the same rule: driverId first, else a unique phone, else a unique name. */
export function matchDriver<D extends PersonLike>(drivers: readonly D[], key: DriverKey): D | undefined {
  return matchPerson(drivers, key.driverId, key.phone, key.name);
}

/** Whether a record is about this driver: id first, then a unique phone, then a unique name; ambiguous → nobody. */
export function belongsToDriver<D extends PersonLike>(record: DriverKey, driver: D, drivers: readonly D[]): boolean {
  return matchDriver(drivers, record)?.id === driver.id;
}

/** Whether a record (ticket, incident, trip) is about this rider: id first, then a unique phone, then a unique name. */
export function belongsToRider<R extends PersonLike>(record: RiderKey, rider: R, riders: readonly R[]): boolean {
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
