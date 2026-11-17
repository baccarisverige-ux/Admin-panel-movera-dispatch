/** French dictionary, area c31-pickup-spots: BQ-V21 (contract v0.18.115): the rider's approximate pickup entrance chips, on/off per zone in Dispatch › Rides. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC31PickupSpots } from "../en/c31-pickup-spots.ts";

export const frC31PickupSpots: Record<keyof typeof enC31PickupSpots, string> = {
  "Pickup entrance chips": "Points d’accès de prise en charge",
  "When the rider sets the pickup, the rider app suggests Main entrance, Side entrance and Parking around the pin, marked as approximate. Previously used and Near Home always stay. The rider app reads this.": "Quand le client choisit le lieu de prise en charge, l’appli client propose Entrée principale, Entrée latérale et Parking autour de l’épingle, marqués comme approximatifs. Déjà utilisé et Près du domicile restent toujours. L’appli client lit ce réglage.",
  "Pickup entrance chips (approximate)": "Points d’accès de prise en charge (approximatifs)",
  "Off: no entrance chips; the pickup is the address only. Usual value: on.": "Désactivé : aucun point d’accès ; la prise en charge est seulement l’adresse. Valeur habituelle : activé.",
  "Pickup entrance chips could not be read from the server for this zone. Reload the page and try again.": "Les points d’accès de prise en charge n’ont pas pu être lus sur le serveur pour cette zone. Rechargez la page et réessayez.",
};
