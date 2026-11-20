/** French dictionary, area c51-live-location: contract v0.18.144 (contract.json#liveLocation): Dispatch › Safety switch "Live location" (default off) and the adjust-pickup banner distance. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC51LiveLocation } from "../en/c51-live-location.ts";

export const frC51LiveLocation: Record<keyof typeof enC51LiveLocation, string> = {
  "Live location": "Position en direct",
  "During a ride the rider and the driver can each turn on Share my location, so they see each other on the map until pickup. Positions are passed on live and never saved. Off by default until the load test passes.": "Pendant une course, le passager et le chauffeur peuvent chacun activer Partager ma position pour se voir sur la carte jusqu'à la prise en charge. Les positions sont transmises en direct et jamais enregistrées. Désactivé par défaut jusqu'à la réussite du test de charge.",
  "Riders and drivers can share their live location": "Les passagers et les chauffeurs peuvent partager leur position en direct",
  "Off: the apps hide Share my location in this zone. Usual value: off until the load test passes.": "Désactivé : les applis masquent Partager ma position dans cette zone. Valeur habituelle : désactivé jusqu'à la réussite du test de charge.",
  "Adjust-pickup banner from": "Bandeau d'ajustement de la prise en charge à partir de",
  "10 to 500 m. The rider app offers to move the pickup to the rider's GPS when the rider is farther than this from the pickup.": "10 à 500 m. L'appli passager propose de déplacer la prise en charge à la position GPS du passager quand il est plus loin que cela.",
};
