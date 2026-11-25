/** French dictionary, area c62-car-zones: admin cars and fleets by zone and country (contract v0.18.161 contract.json#adminListFilters.carZones, owner 2026-11-25 "Yes, fix it"): a car with no country is an error (owner 2026-11-25 "Show as errors and must check what happen") and the car_no_country alert. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC62CarZones } from "../en/c62-car-zones.ts";

export const frC62CarZones: Record<keyof typeof enC62CarZones, string> = {
  "Error: this car has no country. Check what happened.": "Erreur : cette voiture n'a pas de pays. Vérifiez ce qui s'est passé.",
  "Car {0}": "Voiture {0}",
  "Open the fleet": "Ouvrir la flotte",
  "Open the driver": "Ouvrir le chauffeur",
  "No owner": "Aucun propriétaire",
  "Car with no country: {0}": "Voiture sans pays : {0}",
  "Car with no country": "Voiture sans pays",
  "A car whose country is unknown (no fleet, no driver or a driver with no country). Someone must check what happened. Solved when the car has a country.": "Une voiture dont le pays est inconnu (pas de flotte, pas de chauffeur ou un chauffeur sans pays). Quelqu'un doit vérifier ce qui s'est passé. Résolu quand la voiture a un pays.",
};
