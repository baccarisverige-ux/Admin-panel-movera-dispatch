/** French dictionary, area c53-sos-press-time: contract v0.18.148 (contract.json#sosPressTime): the SOS case shows the press time beside the received time, and the delay over a minute. Owner to confirm the words. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC53SosPressTime } from "../en/c53-sos-press-time.ts";

export const frC53SosPressTime: Record<keyof typeof enC53SosPressTime, string> = {
  "SOS pressed {0} · received by Movera {1}": "SOS appuyé {0} · reçu par Movera {1}",
  "Reached Movera {0} min after the press (the phone had no network).": "Arrivé chez Movera {0} min après l'appui (le téléphone n'avait pas de réseau).",
};
