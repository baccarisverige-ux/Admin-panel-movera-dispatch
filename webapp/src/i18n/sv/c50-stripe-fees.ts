/** Swedish dictionary, area c50-stripe-fees: contract v0.18.136 stripeFees (DRAFT), Tips & limits > Card payment of fees and the rider page card payments. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC50StripeFees } from "../en/c50-stripe-fees.ts";

export const svC50StripeFees: Record<keyof typeof enC50StripeFees, string> = {
  "Card payment of fees": "Kortbetalning av avgifter",
  "The rider can pay an owed fee by card or Apple Pay in the app. Off by default.": "Resenären kan betala en skyldig avgift med kort eller Apple Pay i appen. Av som standard.",
  "Card payment of fees: {0} → {1}": "Kortbetalning av avgifter: {0} → {1}",
  "{0} Card payments of fees": "{0} Kortbetalningar av avgifter",
  "Paid twice": "Betald två gånger",
  "Paid twice: refund {0}.": "Betald två gånger: återbetala {0}.",
  "Amount differs: check in Stripe.": "Beloppet skiljer sig: kontrollera i Stripe.",
  "Refund sent. The money goes back to the card.": "Återbetalning skickad. Pengarna går tillbaka till kortet.",
  "Processing": "Behandlas",
  "Refund pending": "Återbetalning väntar",
  "Refund a card payment of a fee": "Återbetala en kortbetalning av en avgift",
};
