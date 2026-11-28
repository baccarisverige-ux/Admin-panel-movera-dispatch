/** French dictionary, area c69-google-road-lines: Google road lines (contract v0.18.171 contract.json#googleRoadLines; owner 2026-11-27 "Google on key screens"): the Live traffic card rows, Settings › Google budget and the server's system_health:google_routes_budget alert. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC69GoogleRoadLines } from "../en/c69-google-road-lines.ts";

export const frC69GoogleRoadLines: Record<keyof typeof enC69GoogleRoadLines, string> = {
  "Google road lines": "Tracés routiers Google",
  "Max Google calls per trip": "Appels Google max par course",
  "The price counts as 1 of these calls. 4 is the most; you can only lower it.": "Le prix compte pour 1 de ces appels. 4 est le maximum ; vous pouvez seulement le baisser.",
  "Google budget": "Budget Google",
  "One daily budget for all countries: prices (quotes) first, road lines get the rest. Over it, prices and lines use the estimate until tomorrow (Los Angeles midnight).": "Un budget quotidien pour tous les pays : les prix (devis) d'abord, les tracés routiers reçoivent le reste. Au-delà, prix et tracés utilisent l'estimation jusqu'à demain (minuit à Los Angeles).",
  "Keep this at or below your Google Cloud daily quota.": "Gardez cette valeur égale ou inférieure à votre quota quotidien Google Cloud.",
  "Could not read the Google budget. Try again.": "Impossible de lire le budget Google. Réessayez.",
  "Daily limit (Google calls)": "Limite quotidienne (appels Google)",
  "Quotes per day": "Devis par jour",
  "Road lines per day": "Tracés routiers par jour",
  "Today {0}: {1} quotes, {2} road lines ({3} of {4} Google calls used).": "Aujourd'hui {0} : {1} devis, {2} tracés routiers ({3} sur {4} appels Google utilisés).",
  "Only an admin who covers every country can change the Google budget.": "Seul un admin qui couvre tous les pays peut modifier le budget Google.",
  "Save Google budget": "Enregistrer le budget Google",
  "Saved. The server uses it at once.": "Enregistré. Le serveur l'utilise tout de suite.",
  "Daily limit: a whole number from 100 to 100000.": "Limite quotidienne : un nombre entier de 100 à 100000.",
  "Quotes per day: a whole number from 0.": "Devis par jour : un nombre entier à partir de 0.",
  "Quotes per day cannot be above the daily limit.": "Les devis par jour ne peuvent pas dépasser la limite quotidienne.",
  "Only an admin who covers every country can change the Google budget (403 not_all_countries).": "Seul un admin qui couvre tous les pays peut modifier le budget Google (403 not_all_countries).",
  "The server refused these numbers: quotes per day cannot be above the daily limit (400 invalid_budget).": "Le serveur a refusé ces valeurs : les devis par jour ne peuvent pas dépasser la limite quotidienne (400 invalid_budget).",
  "Google Routes daily limit reached ({0} calls): prices and road lines are estimated until midnight Pacific time": "Limite quotidienne Google Routes atteinte ({0} appels) : les prix et les tracés routiers sont estimés jusqu'à minuit, heure du Pacifique",
  "Google road lines used their daily share ({0} calls): driver lines are estimated until midnight Pacific time": "Les tracés routiers Google ont utilisé leur part du jour ({0} appels) : les tracés du chauffeur sont estimés jusqu'à minuit, heure du Pacifique",
  "Today {0}: {1} price calls, {2} road-line calls (all countries)": "Aujourd'hui {0} : {1} appels pour les prix, {2} appels pour les tracés routiers (tous les pays)",
};
