/**
 * Admin Véhicules grouped by fleet + Flotte filter (owner 2026-11-25 "Groupes par flotte (Recommandé)" + mockup "Ok",
 * Rules plan/inspiration-ride-change-2026-11-20/PROPOSAL-vehicles-by-fleet-2026-11-25.html). Admin-only: the
 * contract already has Vehicle.fleetId and the server ?fleetId= filter.
 * Each fleet is one group, biggest first (then A→Z); cars with no fleet ("own car") come last.
 */
export const OWN_CAR = "own_car";

export type FleetCarRow = { fleetId: string | null | undefined; driverId: string | null | undefined };
export type FleetGroup = { key: string; fleetId: string | null; name: string; ownerId: string | null; cars: number; drivers: number };
export type FleetInfo = { id: string; name?: string | null; ownerId?: string | null };

export const fleetKeyOf = (row: FleetCarRow): string => (row.fleetId ? row.fleetId : OWN_CAR);

/** The groups of the given cars, in display order. */
export function fleetGroups(rows: readonly FleetCarRow[], fleets: readonly FleetInfo[]): FleetGroup[] {
  const byKey = new Map<string, { cars: number; drivers: Set<string> }>();
  for (const row of rows) {
    const key = fleetKeyOf(row);
    const item = byKey.get(key) ?? { cars: 0, drivers: new Set<string>() };
    item.cars += 1;
    if (row.driverId) item.drivers.add(row.driverId);
    byKey.set(key, item);
  }
  const groups = [...byKey.entries()].map(([key, item]): FleetGroup => {
    const fleet = key === OWN_CAR ? undefined : fleets.find((f) => f.id === key);
    return { key, fleetId: key === OWN_CAR ? null : key, name: key === OWN_CAR ? "" : fleet?.name || key, ownerId: fleet?.ownerId ?? null, cars: item.cars, drivers: item.drivers.size };
  });
  return groups.sort((a, b) => {
    if ((a.key === OWN_CAR) !== (b.key === OWN_CAR)) return a.key === OWN_CAR ? 1 : -1;
    return b.cars - a.cars || a.name.localeCompare(b.name);
  });
}

/** The Flotte filter: "" = all fleets, OWN_CAR = cars without a fleet, else one fleet id. */
export const inFleet = (row: FleetCarRow, filter: string): boolean => !filter || fleetKeyOf(row) === filter;
