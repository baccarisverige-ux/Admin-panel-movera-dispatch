/** Swedish dictionary, area c37-auto-offline-outage: S4 B1.16 Q-B13 (contract v0.18.120, contract.json#autoOffline.outage; owner W1 Q78 "Do not count it", Rules decisions/session-2026-11-06.md:960): the "Go offline automatically" help line says an offer that ran out while the server's live link was down does not count (dispatch/OfferSections.tsx). Add new keys at the end of this file. Merged in ../sv.ts in this order. */
export const svC37AutoOfflineOutage = {
  "Offers that ran out while the server's live link was down do not count either.": "Erbjudanden som gick ut medan serverns direktlänk låg nere räknas inte heller.",
  // Owner 2026-11-16 "It's not when driver decline ! It count when driver ignore" + "And only exclusive / And it's about exclusive ride not radar" (contract v0.18.120 autoOffline.declined): only Exclusive offers the driver let run out count; a decline never counts.
  "Let {0} Exclusive offers run out in a row": "Lät {0} Exklusiva erbjudanden gå ut i rad",
  "Let Exclusive offers run out in a row": "Lät Exklusiva erbjudanden gå ut i rad",
  "After Exclusive offers ignored in a row": "Efter ignorerade Exklusiva erbjudanden i rad",
  "A driver who lets Exclusive offers run out is set offline, so riders are not kept waiting. Declining an offer never counts.": "En förare som låter Exklusiva erbjudanden gå ut sätts offline, så att resenärer inte får vänta. Att neka ett erbjudande räknas aldrig.",
  "Exclusive offers the driver let run out in a row. Declined offers and Radar offers do not count.": "Exklusiva erbjudanden som föraren lät gå ut i rad. Nekade erbjudanden och Radar-erbjudanden räknas inte.",
} as const;
