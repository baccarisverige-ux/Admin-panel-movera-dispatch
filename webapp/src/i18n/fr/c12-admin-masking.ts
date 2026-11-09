/** French dictionary, area c12-admin-masking: contract v0.18.54 §76 (contract.json#adminMasking; owner 2026-11-09 Q40 yes, Q41 yes): the server masks phone / e-mail / date of birth for admins without viewSensitive; Reveal with a reason dialog; one SOS reveal of both phones on an open case. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC12AdminMasking } from "../en/c12-admin-masking.ts";

export const frC12AdminMasking: Record<keyof typeof enC12AdminMasking, string> = {
  "{0} Reveal": "{0} Révéler",
  "Reveal the full value": "Révéler la valeur complète",
  "The server shows the full phone, e-mail and date of birth once, for this page only, and saves who asked and why.": "Le serveur affiche le téléphone, l'e-mail et la date de naissance complets une fois, pour cette page seulement, et enregistre qui a demandé et pourquoi.",
  "Why do you need the full value?": "Pourquoi avez-vous besoin de la valeur complète ?",
  "At least 3 characters": "Au moins 3 caractères",
  "Masked by the server for your role. Press Reveal to see the full value.": "Masqué par le serveur pour votre rôle. Appuyez sur Révéler pour voir la valeur complète.",
  "no account on this case": "aucun compte sur ce cas",
  "no phone number on the record": "aucun numéro de téléphone sur la fiche",
  "Phones of the people on this case": "Téléphones des personnes de ce cas",
  "Your role cannot reveal the phones.": "Votre rôle ne peut pas révéler les téléphones.",
  "One click shows both numbers while the case is open. It is saved in the audit as an SOS reveal.": "Un clic affiche les deux numéros tant que le cas est ouvert. C'est enregistré dans l'audit comme une révélation SOS.",
  "{0} Reveal both phones (SOS)": "{0} Révéler les deux téléphones (SOS)",
  "Reveal a rider's full phone and e-mail (reason, audited)": "Révéler le téléphone et l'e-mail complets d'un passager (motif, audité)",
  "Reveal a driver's full phone, e-mail and date of birth (reason, audited)": "Révéler le téléphone, l'e-mail et la date de naissance complets d'un chauffeur (motif, audité)",
  "Reveal a fleet's full owner e-mail (reason, audited)": "Révéler l'e-mail complet du propriétaire d'une flotte (motif, audité)",
  "Reveal both phones of an open safety case (SOS, audited)": "Révéler les deux téléphones d'un cas de sécurité ouvert (SOS, audité)",
};
