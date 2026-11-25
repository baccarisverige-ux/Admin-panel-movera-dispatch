/** French dictionary, area c64-live-traffic: live traffic for trip times (contract v0.18.163 contract.json#liveTraffic, owner 2026-11-25 "Google trafic réel"). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC64LiveTraffic } from "../en/c64-live-traffic.ts";

export const frC64LiveTraffic: Record<keyof typeof enC64LiveTraffic, string> = {
  "Live traffic (Google)": "Trafic en temps réel (Google)",
  "Trip times with today's traffic from Google, for prices, offers and the trip's ETA. Off: a straight-line estimate. Usual value: on in Sweden and France.": "Durées de trajet avec le trafic du moment de Google, pour les prix, les offres et l'heure d'arrivée de la course. Désactivé : une estimation à vol d'oiseau. Valeur habituelle : activé en Suède et en France.",
  "Ask Google again when the driver leaves the route": "Redemander à Google quand le chauffeur quitte l'itinéraire",
  "Off the route from": "Hors de l'itinéraire à partir de",
  "for more than": "pendant plus de",
  "Ask Google again when the driver is late": "Redemander à Google quand le chauffeur est en retard",
  "Behind the planned arrival by more than": "En retard sur l'arrivée prévue de plus de",
  "About 2 Google calls per trip: the price, then the drive to the pickup. If Google does not answer, trip times are estimated and admins get an alert.": "Environ 2 appels à Google par course : le prix, puis le trajet jusqu'à la prise en charge. Si Google ne répond pas, les durées sont estimées et les admins reçoivent une alerte.",
  "Live traffic is not available: trip times use roads without traffic": "Le trafic en temps réel n'est pas disponible : les durées utilisent les routes sans trafic",
  "Check that the Routes API is enabled for the server's Google Maps key, and its billing": "Vérifiez que l'API Routes est activée pour la clé Google Maps du serveur, ainsi que la facturation",
};
