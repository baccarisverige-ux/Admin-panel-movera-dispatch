/** French dictionary, area c57-app-update: P16c minimum app version (contract v0.18.154 contract.json#appUpdate, owner 2026-11-21 20:30 "Yes, build it now (Recommended)"): Settings › Minimum app version, per app, platform and scope. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC57AppUpdate } from "../en/c57-app-update.ts";

export const frC57AppUpdate: Record<keyof typeof enC57AppUpdate, string> = {
  "Minimum app version": "Version minimale de l'app",
  "A phone below the minimum sees one screen, “Update Movera to continue”, with a button to its store. A driver on a trip is never stopped mid-trip. Empty = off.": "Un téléphone en dessous de la version minimale voit un seul écran, « Mettez à jour Movera pour continuer », avec un bouton vers son store. Un chauffeur en course n'est jamais arrêté en pleine course. Vide = désactivé.",
  "Phones below this version must update before they can book or go online.": "Les téléphones en dessous de cette version doivent faire la mise à jour avant de pouvoir réserver ou se connecter.",
  "Could not read the minimum app version. Try again.": "Impossible de lire la version minimale de l'app. Réessayez.",
  "Saved. Phones get it with the next settings update.": "Enregistré. Les téléphones le reçoivent avec la prochaine mise à jour des réglages.",
  "Standard (every zone that has no own settings)": "Standard (toutes les zones sans réglages propres)",
  "This zone uses its country Standard now; saving here gives it its own value.": "Cette zone utilise le Standard du pays ; enregistrer ici lui donne sa propre valeur.",
  "Android minimum": "Android minimum",
  "iOS minimum": "iOS minimum",
  "Android store link": "Lien store Android",
  "iOS store link": "Lien store iOS",
  "The app's own link": "Le lien propre de l'app",
  "Write the version as x.y.z, for example 1.4.0.": "Écrivez la version sous la forme x.y.z, par exemple 1.4.0.",
  "Write a full https:// link.": "Écrivez un lien https:// complet.",
  "Save minimum app version": "Enregistrer la version minimale",
};
