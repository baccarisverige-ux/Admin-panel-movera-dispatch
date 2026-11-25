/** Swedish dictionary, area c62-car-zones: admin cars and fleets by zone and country (contract v0.18.161 contract.json#adminListFilters.carZones, owner 2026-11-25 "Yes, fix it"): a car with no country is an error (owner 2026-11-25 "Show as errors and must check what happen") and the car_no_country alert. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC62CarZones } from "../en/c62-car-zones.ts";

export const svC62CarZones: Record<keyof typeof enC62CarZones, string> = {
  "Error: this car has no country. Check what happened.": "Fel: bilen har inget land. Kontrollera vad som hänt.",
  "Car {0}": "Bil {0}",
  "Open the fleet": "Öppna åkeriet",
  "Open the driver": "Öppna föraren",
  "No owner": "Ingen ägare",
  "Car with no country: {0}": "Bil utan land: {0}",
  "Car with no country": "Bil utan land",
  "A car whose country is unknown (no fleet, no driver or a driver with no country). Someone must check what happened. Solved when the car has a country.": "En bil vars land är okänt (inget åkeri, ingen förare eller en förare utan land). Någon måste kontrollera vad som hänt. Löst när bilen har ett land.",
};
