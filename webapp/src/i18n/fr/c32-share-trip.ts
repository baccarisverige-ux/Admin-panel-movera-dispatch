/** French dictionary, area c32-share-trip: BQ-S10 (contract v0.18.116): riders can share a live trip link, on/off per zone in Dispatch › Safety; Config › Features "Share trip" is read-only. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC32ShareTrip } from "../en/c32-share-trip.ts";

export const frC32ShareTrip: Record<keyof typeof enC32ShareTrip, string> = {
  "Share trip link": "Lien de partage du trajet",
  "During a trip the rider can send a live link to someone they trust. The page shows the car, the plate and the arrival time. The car’s position shows only while the rider is in the car, and never near the pickup, a stop or the drop-off. The link stops at drop-off.": "Pendant un trajet, le passager peut envoyer un lien en direct à une personne de confiance. La page montre la voiture, la plaque et l’heure d’arrivée. La position de la voiture n’apparaît que lorsque le passager est à bord, et jamais près de la prise en charge, d’un arrêt ou de la destination. Le lien cesse de fonctionner à l’arrivée.",
  "Riders can share a live trip link": "Les passagers peuvent partager un lien de trajet en direct",
  "Off: the rider app hides Share trip and every live link of this zone stops. Usual value: on.": "Désactivé : l’appli passager masque Partager le trajet et tous les liens en direct de la zone s’arrêtent. Valeur habituelle : activé.",
  "{0}: set per zone in Dispatch › Safety. {1}": "{0} : réglé par zone dans Répartition › Sécurité. {1}",
  "Share trip could not be read from the server for this zone. Reload the page and try again.": "Le partage du trajet n’a pas pu être lu sur le serveur pour cette zone. Rechargez la page et réessayez.",
};
