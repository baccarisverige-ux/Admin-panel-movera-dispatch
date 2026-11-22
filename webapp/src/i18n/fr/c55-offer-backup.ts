/** French dictionary, area c55-offer-backup: L20 stream backup (contract v0.18.150, owner 2026-11-21 "Switch to old two (Rec.)"): Dispatch › Drivers, under "One live connection per driver phone", the two numbers "Backup after failed tries" (1-10, default 3) and "Try the one connection again after (minutes)" (1-60, default 10) with their help lines. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC55OfferBackup } from "../en/c55-offer-backup.ts";

export const frC55OfferBackup: Record<keyof typeof enC55OfferBackup, string> = {
  "Backup after failed tries": "Secours après des essais ratés",
  "When the one connection fails this many times in a row, the phone uses the two old connections so offers keep coming. Example: 3: driver Ali's phone fails the one connection 3 times in a row, then gets offers on the two old connections.": "Quand la connexion unique échoue autant de fois de suite, le téléphone utilise les deux anciennes connexions pour que les offres continuent d’arriver. Exemple : 3 : le téléphone du chauffeur Ali échoue 3 fois de suite sur la connexion unique, puis reçoit les offres par les deux anciennes connexions.",
  "Try the one connection again after (minutes)": "Réessayer la connexion unique après (minutes)",
  "How long the phone stays on the two old connections before it tries the one connection again. An app restart also tries it again. Example: 10: Ali's phone tries the one connection again 10 minutes later.": "Combien de temps le téléphone reste sur les deux anciennes connexions avant de réessayer la connexion unique. Un redémarrage de l’app la réessaie aussi. Exemple : 10 : le téléphone d’Ali réessaie la connexion unique 10 minutes plus tard.",
  "tries": "essais",
};
