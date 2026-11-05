/** Swedish dictionary, area b3-live-map-pins: Section “Live map pins & ride check” in the old file. Merged in ../sv.ts in this order. */
import type { enB3LiveMapPins } from "../en/b3-live-map-pins.ts";

export const svB3LiveMapPins: Record<keyof typeof enB3LiveMapPins, string> = {
  // Live map pins & ride check
  "{0} Free {1} To pickup {2} On trip {3} Rider waiting {4} Driver offered": "{0} Ledig {1} Till upphämtning {2} På resa {3} Resenär väntar {4} Förare erbjuden",
  "Driver says: {0}": "Föraren säger: {0}",
  "Rider says: {0}": "Resenären säger: {0}",
  "Ride check for {0}": "Resekontroll för {0}",
  "Dismiss": "Dölj",
  "{0}Call driver": "{0}Ring föraren",
  "{0}Call rider": "{0}Ring resenären",
};
