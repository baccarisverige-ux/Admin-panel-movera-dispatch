/** French dictionary, area c9-same-address: same-address fix (contract v0.18.42 §67): Pricing › zone fees › Shortest trip (minTripMeters). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC9SameAddress } from "../en/c9-same-address.ts";

export const frC9SameAddress: Record<keyof typeof enC9SameAddress, string> = {
  "Shortest trip": "Trajet le plus court",
  "A drop-off closer than this to the pickup is refused: the rider sees \"Drop-off is too close to pickup\". 0 = off.": "Un point de dépose plus proche que cela du point de prise en charge est refusé : le passager voit « Le point de dépose est trop proche du point de prise en charge ». 0 = désactivé.",
  "Shortest trip must be whole metres from 0 to 5000.": "Le trajet le plus court doit être en mètres entiers, de 0 à 5000.",
};
