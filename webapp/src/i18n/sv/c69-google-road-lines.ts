/** Swedish dictionary, area c69-google-road-lines: Google road lines (contract v0.18.171 contract.json#googleRoadLines; owner 2026-11-27 "Google on key screens"): the Live traffic card rows, Settings › Google budget and the server's system_health:google_routes_budget alert. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC69GoogleRoadLines } from "../en/c69-google-road-lines.ts";

export const svC69GoogleRoadLines: Record<keyof typeof enC69GoogleRoadLines, string> = {
  "Google road lines": "Vägar från Google",
  "Max Google calls per trip": "Max Google-anrop per resa",
  "The price counts as 1 of these calls. 4 is the most; you can only lower it.": "Priset räknas som 1 av dessa anrop. 4 är max; du kan bara sänka det.",
  "Google budget": "Google-budget",
  "One daily budget for all countries: prices (quotes) first, road lines get the rest. Over it, prices and lines use the estimate until tomorrow (Los Angeles midnight).": "En daglig budget för alla länder: priser (offerter) först, vägarna får resten. Över den används uppskattningen för priser och linjer till i morgon (midnatt i Los Angeles).",
  "Keep this at or below your Google Cloud daily quota.": "Håll detta på eller under din dagliga kvot i Google Cloud.",
  "Could not read the Google budget. Try again.": "Kunde inte läsa Google-budgeten. Försök igen.",
  "Daily limit (Google calls)": "Daglig gräns (Google-anrop)",
  "Quotes per day": "Offerter per dag",
  "Road lines per day": "Vägar per dag",
  "Today {0}: {1} quotes, {2} road lines ({3} of {4} Google calls used).": "Idag {0}: {1} offerter, {2} vägar ({3} av {4} Google-anrop använda).",
  "Only an admin who covers every country can change the Google budget.": "Endast en admin som täcker alla länder kan ändra Google-budgeten.",
  "Save Google budget": "Spara Google-budget",
  "Saved. The server uses it at once.": "Sparat. Servern använder det direkt.",
  "Daily limit: a whole number from 100 to 100000.": "Daglig gräns: ett heltal från 100 till 100000.",
  "Quotes per day: a whole number from 0.": "Offerter per dag: ett heltal från 0.",
  "Quotes per day cannot be above the daily limit.": "Offerter per dag kan inte vara över den dagliga gränsen.",
  "Only an admin who covers every country can change the Google budget (403 not_all_countries).": "Endast en admin som täcker alla länder kan ändra Google-budgeten (403 not_all_countries).",
  "The server refused these numbers: quotes per day cannot be above the daily limit (400 invalid_budget).": "Servern avvisade siffrorna: offerter per dag kan inte vara över den dagliga gränsen (400 invalid_budget).",
  "Google Routes daily limit reached ({0} calls): prices and road lines are estimated until midnight Pacific time": "Google Routes dagliga gräns nådd ({0} anrop): priser och vägar uppskattas till midnatt Stillahavstid",
  "Google road lines used their daily share ({0} calls): driver lines are estimated until midnight Pacific time": "Vägarna från Google har använt sin dagliga andel ({0} anrop): förarens linjer uppskattas till midnatt Stillahavstid",
  "Today {0}: {1} price calls, {2} road-line calls (all countries)": "Idag {0}: {1} prisanrop, {2} väganrop (alla länder)",
};
