/** French dictionary, area c50-stripe-fees: contract v0.18.136 stripeFees (DRAFT), Tips & limits > Card payment of fees and the rider page card payments. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC50StripeFees } from "../en/c50-stripe-fees.ts";

export const frC50StripeFees: Record<keyof typeof enC50StripeFees, string> = {
  "Card payment of fees": "Paiement des frais par carte",
  "The rider can pay an owed fee by card or Apple Pay in the app. Off by default.": "Le passager peut payer des frais dus par carte ou Apple Pay dans l'appli. Désactivé par défaut.",
  "Card payment of fees: {0} → {1}": "Paiement des frais par carte : {0} → {1}",
  "{0} Card payments of fees": "{0} Paiements des frais par carte",
  "Paid twice": "Payé deux fois",
  "Paid twice: refund {0}.": "Payé deux fois : remboursez {0}.",
  "Amount differs: check in Stripe.": "Le montant diffère : vérifiez dans Stripe.",
  "Refund sent. The money goes back to the card.": "Remboursement envoyé. L'argent revient sur la carte.",
  "Processing": "En cours",
  "Refund pending": "Remboursement en attente",
};
