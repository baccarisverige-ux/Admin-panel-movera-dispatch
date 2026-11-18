/** French dictionary, area c37-auto-offline-outage: S4 B1.16 Q-B13 (contract v0.18.120, contract.json#autoOffline.outage; owner W1 Q78 "Do not count it", Rules decisions/session-2026-11-06.md:960): the "Go offline automatically" help line says an offer that ran out while the server's live link was down does not count (dispatch/OfferSections.tsx). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
export const frC37AutoOfflineOutage = {
  "Offers that ran out while the server's live link was down do not count either.": "Les offres expirées pendant une coupure du lien direct du serveur ne comptent pas non plus.",
  // Owner 2026-11-16 "It's not when driver decline ! It count when driver ignore" + "And only exclusive / And it's about exclusive ride not radar" (contract v0.18.120 autoOffline.declined): only Exclusive offers the driver let run out count; a decline never counts.
  "Let {0} Exclusive offers run out in a row": "A laissé expirer {0} offres Exclusives d’affilée",
  "Let Exclusive offers run out in a row": "A laissé expirer des offres Exclusives d’affilée",
  "After Exclusive offers ignored in a row": "Après des offres Exclusives ignorées d’affilée",
  "A driver who lets Exclusive offers run out is set offline, so riders are not kept waiting. Declining an offer never counts.": "Un chauffeur qui laisse expirer des offres Exclusives est mis hors ligne, pour que les passagers n’attendent pas. Refuser une offre ne compte jamais.",
  "Exclusive offers the driver let run out in a row. Declined offers and Radar offers do not count.": "Offres Exclusives que le chauffeur a laissé expirer d’affilée. Les offres refusées et les offres Radar ne comptent pas.",
} as const;
