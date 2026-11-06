/** Swedish dictionary, area c9-same-address: same-address fix (contract v0.18.44 §67): Pricing › zone fees › Shortest trip (minTripMeters). Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC9SameAddress } from "../en/c9-same-address.ts";

export const svC9SameAddress: Record<keyof typeof enC9SameAddress, string> = {
  "Shortest trip": "Kortaste resa",
  "A drop-off closer than this to the pickup is refused: the rider sees \"Drop-off is too close to pickup\". 0 = off.": "En avlämning närmare upphämtningen än så här nekas: resenären ser ”Avlämningen är för nära upphämtningen”. 0 = av.",
  "Shortest trip must be whole metres from 0 to 5000.": "Kortaste resa måste vara hela meter från 0 till 5000.",
};
