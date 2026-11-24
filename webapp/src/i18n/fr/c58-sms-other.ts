/** French dictionary, area c58-sms-other: SMS sign-in for numbers from other countries (contract v0.18.157 contract.json#smsSignIn.otherCountries, owner 2026-11-24). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC58SmsOther } from "../en/c58-sms-other.ts";

export const frC58SmsOther: Record<keyof typeof enC58SmsOther, string> = {
  "SMS sign-in for numbers from other countries": "Connexion par SMS pour les numéros d’autres pays",
  "{0} SMS sign-in for numbers from other countries": "{0} Connexion par SMS pour les numéros d’autres pays",
  "Send sign-in codes to rider numbers from all other countries": "Envoyer les codes de connexion aux numéros des passagers de tous les autres pays",
  "Daily limit (SMS per 24 hours, all other countries together)": "Limite par jour (SMS par 24 heures, tous les autres pays ensemble)",
  "For visitors with a foreign number (for example Tunisian, German or US). Each code is an international SMS and costs more than a Swedish one. Foreign numbers are the usual target of SMS fraud, so keep the limit low and raise it only when real visitors need it. At the limit, new codes for these numbers stop until the next day. Sweden keeps its own switch and limit.": "Pour les visiteurs avec un numéro étranger (par exemple tunisien, allemand ou américain). Chaque code est un SMS international et coûte plus cher qu’un SMS suédois. Les numéros étrangers sont la cible habituelle des fraudes au SMS : gardez une limite basse et augmentez-la seulement si de vrais visiteurs en ont besoin. À la limite, les nouveaux codes pour ces numéros s’arrêtent jusqu’au lendemain. La Suède garde son propre interrupteur et sa limite.",
  "Other countries sign-in SMS per day: a whole number from {0} to {1}.": "SMS de connexion par jour pour les autres pays : un nombre entier de {0} à {1}.",
  "SMS sign-in for other countries: {0} → {1}": "Connexion par SMS pour les autres pays : {0} → {1}",
  "Other countries sign-in SMS per day: {0} → {1}": "SMS de connexion par jour pour les autres pays : {0} → {1}",
  "Sign-in SMS to other countries: {0} of {1} sent in the last 24 hours": "SMS de connexion vers d’autres pays : {0} sur {1} envoyés ces dernières 24 heures",
  "Sign-in SMS limit for other countries reached: {0} of {1} in the last 24 hours. New sign-in codes for these numbers are stopped": "Limite de SMS de connexion pour les autres pays atteinte : {0} sur {1} ces dernières 24 heures. Les nouveaux codes pour ces numéros sont arrêtés",
  "Raise the daily limit for other countries in Tips & limits (Sweden) if these are real people": "Augmentez la limite par jour pour les autres pays dans Pourboires et limites (Suède) s’il s’agit de vraies personnes",
};
