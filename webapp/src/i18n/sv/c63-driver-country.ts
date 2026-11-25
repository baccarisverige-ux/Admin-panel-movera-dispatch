/** Swedish dictionary, area c63-driver-country: driver country first (contract v0.18.162 contract.json#driverCountryFirst, owner 2026-11-25 "Yes"): the Country field with Change on the driver page, the red "no country" error and the driver_no_country alert. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC63DriverCountry } from "../en/c63-driver-country.ts";

export const svC63DriverCountry: Record<keyof typeof enC63DriverCountry, string> = {
  "Error: this driver has no country. Check what happened.": "Fel: föraren har inget land. Kontrollera vad som hänt.",
  "Set country": "Ange land",
  "The driver is seen in the admin only under this country. Only this field changes it; the reason is kept in the audit.": "Föraren syns i admin bara under detta land. Bara detta fält ändrar det; orsaken sparas i loggen.",
  "New country": "Nytt land",
  "No country": "Inget land",
  "Change the country to {0}": "Ändra landet till {0}",
  "Country saved.": "Landet sparat.",
  "Save country": "Spara land",
  "Choose a country.": "Välj ett land.",
  "Driver with no country": "Förare utan land",
  "A driver with data but no country (not shown under any country). Set his country on the driver page. Solved when he has a country.": "En förare med uppgifter men utan land (syns inte under något land). Ange landet på förarsidan. Löst när föraren har ett land.",
  "Change driver country": "Ändra förarens land",
  "Driver has no country: {0}": "Förare utan land: {0}",
  "The driver is set offline. His cars that break the new country's car rules go back to review.": "Föraren sätts offline. Bilar som bryter mot det nya landets bilregler går tillbaka till granskning.",
};
