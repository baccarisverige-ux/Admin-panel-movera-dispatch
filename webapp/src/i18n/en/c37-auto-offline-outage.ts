/** English dictionary, area c37-auto-offline-outage: S4 B1.16 Q-B13 (contract v0.18.120, contract.json#autoOffline.outage; owner W1 Q78 "Do not count it", Rules decisions/session-2026-11-06.md:960): the "Go offline automatically" help line says an offer that ran out while the server's live link was down does not count (dispatch/OfferSections.tsx). Add new keys at the end of this file. Merged in ../en.ts in this order. */
export const enC37AutoOfflineOutage = {
  "Offers that ran out while the server's live link was down do not count either.": "Offers that ran out while the server's live link was down do not count either.",
  // Owner 2026-11-16 "It's not when driver decline ! It count when driver ignore" + "And only exclusive / And it's about exclusive ride not radar" (contract v0.18.120 autoOffline.declined): only Exclusive offers the driver let run out count; a decline never counts.
  "Let {0} Exclusive offers run out in a row": "Let {0} Exclusive offers run out in a row",
  "Let Exclusive offers run out in a row": "Let Exclusive offers run out in a row",
  "After Exclusive offers ignored in a row": "After Exclusive offers ignored in a row",
  "A driver who lets Exclusive offers run out is set offline, so riders are not kept waiting. Declining an offer never counts.": "A driver who lets Exclusive offers run out is set offline, so riders are not kept waiting. Declining an offer never counts.",
  "Exclusive offers the driver let run out in a row. Declined offers and Radar offers do not count.": "Exclusive offers the driver let run out in a row. Declined offers and Radar offers do not count.",
} as const;
