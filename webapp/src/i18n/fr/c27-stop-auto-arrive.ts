/** French dictionary, area c27-stop-auto-arrive: job C9b (contract v0.18.108 autoArrive.stops, owner 2026-11-02 "At the pickup AND at stops"): the pickup-waiting distances also apply at stops; the trip page stop rows and the live trip card show the server's stop facts. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
export const frC27StopAutoArrive = {
  "At the pickup and at stops: the server marks the driver arrived when they are this close; they can still tap Arrived. While they are farther than the second distance before the rider is in the car (pickup) or before the stop is done, the waiting time stops (nothing charged; at the pickup no free minutes used and no no-show) and goes on when they are back.": "À la prise en charge et aux arrêts : le serveur marque le chauffeur comme arrivé quand il est aussi près ; il peut toujours appuyer sur Arrivé. Tant qu’il est plus loin que la deuxième distance avant que le passager soit à bord (prise en charge) ou avant que l’arrêt soit terminé, le temps d’attente s’arrête (rien n’est facturé ; à la prise en charge aucune minute gratuite utilisée et pas d’absence du passager) et reprend à son retour.",
  "Arrived and waiting away at stops": "Arrivée et attente quand le chauffeur s’éloigne aux arrêts",
  "The same distances as Waiting at pickup: the server marks the stop arrived within {0} m, and the waiting at the stop stops while the driver is more than {1} m away.": "Les mêmes distances que l’attente à la prise en charge : le serveur marque l’arrêt comme atteint à moins de {0} m, et l’attente à l’arrêt s’arrête tant que le chauffeur est à plus de {1} m.",
  "Arrived {0}": "Arrivé à {0}",
  "Left {0}": "Parti à {0}",
  "Waiting stopped: driver away since {0}": "Attente arrêtée : chauffeur éloigné depuis {0}",
  "Stopped in all: {0} min ({1} times)": "Arrêtée au total : {0} min ({1} fois)",
  "At stop {0} since {1}": "À l’arrêt {0} depuis {1}",
} as const;
