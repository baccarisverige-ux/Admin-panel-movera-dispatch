/** French dictionary, area c62-car-zones: admin cars and fleets by zone and country (contract v0.18.161 contract.json#adminListFilters.carZones, owner 2026-11-25 "Yes, fix it"): a car whose country the server does not know. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC62CarZones } from "../en/c62-car-zones.ts";

export const frC62CarZones: Record<keyof typeof enC62CarZones, string> = {
  "Country unknown": "Pays inconnu",
};
