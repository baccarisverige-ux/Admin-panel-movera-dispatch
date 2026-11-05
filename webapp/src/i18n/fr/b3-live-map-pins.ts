/** French dictionary, area b3-live-map-pins: Section “Live map pins & ride check” in the old file. Merged in ../fr.ts in this order. */
import type { enB3LiveMapPins } from "../en/b3-live-map-pins.ts";

export const frB3LiveMapPins: Record<keyof typeof enB3LiveMapPins, string> = {
  // Live map pins & ride check
  "{0} Free {1} To pickup {2} On trip {3} Rider waiting {4} Driver offered": "{0} Libre {1} Vers la prise en charge {2} En course {3} Passager en attente {4} Chauffeur proposé",
  "Driver says: {0}": "Le chauffeur dit : {0}",
  "Rider says: {0}": "Le passager dit : {0}",
  "Ride check for {0}": "Contrôle de course pour {0}",
  "Dismiss": "Masquer",
  "{0}Call driver": "{0}Appeler le chauffeur",
  "{0}Call rider": "{0}Appeler le passager",
};
