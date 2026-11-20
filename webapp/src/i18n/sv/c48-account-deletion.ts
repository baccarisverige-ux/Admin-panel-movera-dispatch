/** Swedish dictionary, area c48-account-deletion: Riders › Account deletion requests and the erase setting (contract v0.18.134 accountDeletion). Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC48AccountDeletion } from "../en/c48-account-deletion.ts";

export const svC48AccountDeletion: Record<keyof typeof enC48AccountDeletion, string> = {
  "Erased": "Raderat",
  "Waiting: erasing is off (count only)": "Väntar: radering är av (räknar bara)",
  "Waiting: open trip": "Väntar: pågående resa",
  "Waiting: open safety case": "Väntar: öppet säkerhetsärende",
  "Waiting: next run": "Väntar: nästa körning",
  "Erase after must be whole days from {0} to {1}.": "Radera efter måste vara hela dagar från {0} till {1}.",
  "Account deletion requests": "Begäranden om att radera konto",
  "A rider or driver who deletes the account is closed at once. A debt is kept as a record (name, number, amount) until it is paid or written off. Everything else is erased after the set days; money and trip records stay for the bookkeeping law.": "En resenär eller förare som raderar kontot stängs direkt. En skuld sparas som en post (namn, nummer, belopp) tills den är betald eller avskriven. Allt annat raderas efter valt antal dagar; pengar och resor sparas enligt bokföringslagen.",
  "No deletion requests.": "Inga begäranden om radering.",
  "Account": "Konto",
  "Erase from": "Raderas från",
  "Kept debt": "Sparad skuld",
  "Paid or written off": "Betald eller avskriven",
  "Due now: {0}": "Att radera nu: {0}",
  "Erase setting (country Standard)": "Raderingsinställning (landets standard)",
  "Erase after (days)": "Radera efter (dagar)",
  "Erase on (off = count only, nothing is erased)": "Radering på (av = räknar bara, inget raderas)",
  "Save the account erase setting": "Spara inställningen för kontoradering",
};
