/** French dictionary, area c2-job7-small-fixes: FIX JOB 7 (contract v0.18.32): Shortest ride setting, read-only Confirm value, Live tab counts. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC2Job7SmallFixes } from "../en/c2-job7-small-fixes.ts";

export const frC2Job7SmallFixes: Record<keyof typeof enC2Job7SmallFixes, string> = {
  "Searching {0} · Live {1}": "Recherche {0} · Live {1}",
  "Not used yet": "Pas encore utilisé",
  "Not used yet: the apps get the booking window from Dispatch › Reservations (Max days ahead).": "Pas encore utilisé : les applis prennent la fenêtre de réservation dans Dispatch › Réservations (jours maximum à l’avance).",
  "Shortest ride": "Course la plus courte",
  "Shortest ride (m)": "Course la plus courte (m)",
  "When pickup and drop-off are this close, the rider app warns the rider. The rider can still book. The server and the rider app read this.": "Quand la prise en charge et la dépose sont aussi proches, l’appli client prévient le client. Le client peut quand même réserver. Le serveur et l’appli client lisent ce réglage.",
  "0 means never warn. At most {0} m. Usual value {1} m.": "0 signifie ne jamais prévenir. Au plus {0} m. Valeur habituelle {1} m.",
  "Shortest ride: 0 to 1000 m, in whole metres.": "Course la plus courte : de 0 à 1000 m, en mètres entiers.",
};
