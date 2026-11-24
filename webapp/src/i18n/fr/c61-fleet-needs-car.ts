/** French dictionary, area c61-fleet-needs-car: v0.18.159 fleet needs a car (contract.json#fleetNeedsCar, owner 2026-11-24 "No but in sheet must see that it's missing to add car"): the fleet review sheet Cars line, Approve locked, the 409 fleet_has_no_car text and the Drivers › Onboarding setting. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC61FleetNeedsCar } from "../en/c61-fleet-needs-car.ts";

export const frC61FleetNeedsCar: Record<keyof typeof enC61FleetNeedsCar, string> = {
  "✕ Car missing: no car added": "✕ Voiture manquante : aucune voiture ajoutée",
  "Approve is locked until the owner adds at least 1 car.": "L’approbation est bloquée tant que le propriétaire n’a pas ajouté au moins 1 voiture.",
  "✓ {0} car": "✓ {0} voiture",
  "✓ {0} cars": "✓ {0} voitures",
  "Fleet approval": "Approbation de la flotte",
  "Fleet needs at least 1 car before approval": "La flotte doit avoir au moins 1 voiture avant l’approbation",
  "On: Movera cannot approve a fleet until its owner has added at least one car.": "Activé : Movera ne peut pas approuver une flotte tant que son propriétaire n’a pas ajouté au moins une voiture.",
};
