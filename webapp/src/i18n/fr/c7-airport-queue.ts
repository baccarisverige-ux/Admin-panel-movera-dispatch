/** French dictionary, area c7-airport-queue: fix job 9 airport queue (contract v0.18.39 §63) (add new keys at the end of this file). Merged in ../fr.ts in this order. */
import type { enC7AirportQueue } from "../en/c7-airport-queue.ts";

export const frC7AirportQueue: Record<keyof typeof enC7AirportQueue, string> = {
  "Airport queue area": "Zone de file d'attente de l'aéroport",
  "Drivers inside this area wait in line. The first in line gets the airport trips first.": "Les chauffeurs dans cette zone attendent en file. Le premier de la file reçoit d'abord les courses de l'aéroport.",
  "Could not load the queue area.": "Impossible de charger la zone de file.",
  "Airport queue on": "File de l'aéroport activée",
  "Off until the area is drawn and saved.": "Désactivée jusqu'à ce que la zone soit dessinée et enregistrée.",
  "Queue area": "Zone de file",
  "Queue area: {0} points": "Zone de file : {0} points",
  "No queue area drawn yet.": "Aucune zone de file dessinée.",
  "Use the airport outline": "Utiliser le contour de l'aéroport",
  "Leave the queue after (outside the area)": "Quitte la file après (hors de la zone)",
  "Time to answer a queue offer": "Temps pour répondre à une offre de file",
  "Queue offers before the nearest driver": "Offres de file avant le chauffeur le plus proche",
  "A driver who declines keeps his place": "Un chauffeur qui refuse garde sa place",
  "Off: he goes to the back of the queue.": "Désactivé : il passe en fin de file.",
  "Save queue area": "Enregistrer la zone de file",
};
