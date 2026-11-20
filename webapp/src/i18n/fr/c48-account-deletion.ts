/** French dictionary, area c48-account-deletion: Riders › Account deletion requests and the erase setting (contract v0.18.140 accountDeletion). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC48AccountDeletion } from "../en/c48-account-deletion.ts";

export const frC48AccountDeletion: Record<keyof typeof enC48AccountDeletion, string> = {
  "Erased": "Effacé",
  "Requested": "Demandé",
  "Waiting: erasing is off (count only)": "En attente : effacement désactivé (comptage seulement)",
  "Waiting: open trip": "En attente : course en cours",
  "Waiting: open safety case": "En attente : dossier de sécurité ouvert",
  "Waiting: next run": "En attente : prochain passage",
  "Erase after must be whole days from {0} to {1}.": "Effacer après doit être un nombre entier de jours de {0} à {1}.",
  "Account deletion requests": "Demandes de suppression de compte",
  "A rider or driver who deletes the account is closed at once. A debt is kept as a record (name, number, amount) until it is paid or written off. Everything else is erased after the set days; money and trip records stay for the bookkeeping law.": "Un passager ou un chauffeur qui supprime son compte est fermé tout de suite. Une dette est gardée comme fiche (nom, numéro, montant) jusqu’à ce qu’elle soit payée ou annulée. Tout le reste est effacé après le nombre de jours choisi ; l’argent et les courses restent pour la loi comptable.",
  "No deletion requests.": "Aucune demande de suppression.",
  "Account": "Compte",
  "Asked": "Demandé",
  "Erase from": "Effacé à partir du",
  "Kept debt": "Dette gardée",
  "Paid or written off": "Payée ou annulée",
  "Due now: {0}": "À effacer maintenant : {0}",
  "Erase setting (country Standard)": "Réglage d’effacement (standard du pays)",
  "Erase after (days)": "Effacer après (jours)",
  "Erase on (off = count only, nothing is erased)": "Effacement activé (désactivé = comptage seulement, rien n’est effacé)",
};
