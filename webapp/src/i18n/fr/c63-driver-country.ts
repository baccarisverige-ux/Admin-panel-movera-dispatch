/** French dictionary, area c63-driver-country: driver country first (contract v0.18.162 contract.json#driverCountryFirst, owner 2026-11-25 "Yes"): the Country field with Change on the driver page, the red "no country" error and the driver_no_country alert. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC63DriverCountry } from "../en/c63-driver-country.ts";

export const frC63DriverCountry: Record<keyof typeof enC63DriverCountry, string> = {
  "Error: this driver has no country. Check what happened.": "Erreur : ce chauffeur n'a pas de pays. Vérifiez ce qui s'est passé.",
  "Set country": "Définir le pays",
  "The driver is seen in the admin only under this country. Only this field changes it; the reason is kept in the audit.": "Le chauffeur n'apparaît dans l'admin que sous ce pays. Seul ce champ le modifie ; le motif est gardé dans le journal.",
  "New country": "Nouveau pays",
  "No country": "Aucun pays",
  "Change the country to {0}": "Changer le pays en {0}",
  "Country saved.": "Pays enregistré.",
  "Save country": "Enregistrer le pays",
  "Choose a country.": "Choisissez un pays.",
  "Driver with no country": "Chauffeur sans pays",
  "A driver with data but no country (not shown under any country). Set his country on the driver page. Solved when he has a country.": "Un chauffeur avec des données mais sans pays (il n'apparaît sous aucun pays). Définissez son pays sur sa page. Résolu quand il a un pays.",
  "Change driver country": "Changer le pays du chauffeur",
  "Driver has no country: {0}": "Chauffeur sans pays : {0}",
};
