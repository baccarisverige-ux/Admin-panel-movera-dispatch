/** Swedish dictionary, area c42-payout-lines: S5 J14 payout lines + carry (contract v0.18.133 payoutLines; owner 2026-11-19 "driver payout 3 lines", "carry line only when needed"): Earned / Owed to Movera / Paid out, "Moves to next week", the run card's server count, the switch. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
export const svC42PayoutLines = {
  "Earned": "Intjänat",
  "Paid out": "Utbetalt",
  "Moves to next week": "Flyttas till nästa vecka",
  "Showing {0} of {1} drivers; the count and total are the server's.": "Visar {0} av {1} förare; antal och summa är serverns.",
  "With payout lines on: each payout shows Earned, Owed to Movera and Paid out. A week below zero pays 0 and the rest moves to the driver's next payout.": "Med utbetalningsrader på: varje utbetalning visar Intjänat, Skuld till Movera och Utbetalt. En vecka under noll betalar 0 och resten flyttas till förarens nästa utbetalning.",
  "Payout lines and move a minus to next week": "Utbetalningsrader och flytta minus till nästa vecka",
  "Payout lines on": "Utbetalningsrader på",
  "Payout lines off": "Utbetalningsrader av",
  "Moved from last week": "Flyttat från förra veckan",
} as const;
