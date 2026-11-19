/** French dictionary, area c42-payout-lines: S5 J14 payout lines + carry (contract v0.18.133 payoutLines; owner 2026-11-19 "driver payout 3 lines", "carry line only when needed"): Earned / Owed to Movera / Paid out, "Moves to next week", the run card's server count, the switch. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
export const frC42PayoutLines = {
  "Earned": "Gagné",
  "Paid out": "Versé",
  "Moves to next week": "Reporté à la semaine prochaine",
  "Showing {0} of {1} drivers; the count and total are the server's.": "{0} chauffeurs affichés sur {1} ; le nombre et le total sont ceux du serveur.",
  "With payout lines on: each payout shows Earned, Owed to Movera and Paid out. A week below zero pays 0 and the rest moves to the driver's next payout.": "Avec les lignes de versement activées : chaque versement affiche Gagné, Dû à Movera et Versé. Une semaine en dessous de zéro verse 0 et le reste passe au prochain versement du chauffeur.",
  "Payout lines and move a minus to next week": "Lignes de versement et report d'un solde négatif à la semaine suivante",
  "Payout lines on": "Lignes de versement activées",
  "Payout lines off": "Lignes de versement désactivées",
  "Moved from last week": "Reporté de la semaine dernière",
} as const;
