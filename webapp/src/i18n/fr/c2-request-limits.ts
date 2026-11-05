/** French dictionary, area c2-request-limits: Request limits per minute (contract v0.18.24, rate limit) (add new keys at the end of this file). Merged in ../fr.ts in this order. */
import type { enC2RequestLimits } from "../en/c2-request-limits.ts";

export const frC2RequestLimits: Record<keyof typeof enC2RequestLimits, string> = {
  "Request limits": "Limites de requêtes",
  "How many changes (book, cancel, send, save) one person may send per minute. Above it the apps say “wait a moment” and try again by themselves.": "Combien de modifications (réserver, annuler, envoyer, enregistrer) une personne peut envoyer par minute. Au-delà, les applis disent « patientez un instant » et réessaient d'elles-mêmes.",
  "Only on the live server.": "Uniquement sur le serveur en direct.",
  "Could not read the request limits. Try again.": "Impossible de lire les limites de requêtes. Réessayez.",
  "Saved. The server uses the new limits within a minute.": "Enregistré. Le serveur applique les nouvelles limites en moins d'une minute.",
  "Could not save. Try again.": "Impossible d'enregistrer. Réessayez.",
  "This country has no published Standard yet.": "Ce pays n'a pas encore de standard publié.",
  "Changes per signed-in user per minute": "Modifications par utilisateur connecté par minute",
  "Changes per internet address per minute (not signed in)": "Modifications par adresse internet par minute (non connecté)",
  "Enter a whole number.": "Saisissez un nombre entier.",
  "Between {0} and {1}.": "Entre {0} et {1}.",
  "Save request limits": "Enregistrer les limites de requêtes",
};
