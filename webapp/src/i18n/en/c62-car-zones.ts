/** English dictionary, area c62-car-zones: admin cars and fleets by zone and country (contract v0.18.161 contract.json#adminListFilters.carZones, owner 2026-11-25 "Yes, fix it"): a car with no country is an error (owner 2026-11-25 "Show as errors and must check what happen") and the car_no_country alert. Add new keys at the end of this file. Merged in ../en.ts in this order. */
export const enC62CarZones = {
  "Error: this car has no country. Check what happened.": "Error: this car has no country. Check what happened.",
  "Car {0}": "Car {0}",
  "Open the fleet": "Open the fleet",
  "Open the driver": "Open the driver",
  "No owner": "No owner",
  "Car with no country: {0}": "Car with no country: {0}",
  "Car with no country": "Car with no country",
  "A car whose country is unknown (no fleet, no driver or a driver with no country). Someone must check what happened. Solved when the car has a country.": "A car whose country is unknown (no fleet, no driver or a driver with no country). Someone must check what happened. Solved when the car has a country.",
} as const;
