/** Swedish dictionary, area c2-job7-small-fixes: FIX JOB 7 (contract v0.18.30): Shortest ride setting, read-only Confirm value, Live tab counts. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC2Job7SmallFixes } from "../en/c2-job7-small-fixes.ts";

export const svC2Job7SmallFixes: Record<keyof typeof enC2Job7SmallFixes, string> = {
  "Searching {0} · Live {1}": "Söker {0} · Live {1}",
  "Not used yet": "Används inte än",
  "Not used yet: the apps get the booking window from Dispatch › Reservations (Max days ahead).": "Används inte än: apparna får bokningsfönstret från Dispatch › Bokningar (Max dagar framåt).",
  "Shortest ride": "Kortaste resa",
  "Shortest ride (m)": "Kortaste resa (m)",
  "When pickup and drop-off are this close, the rider app warns the rider. The rider can still book. The server and the rider app read this.": "När upphämtning och avlämning ligger så här nära varnar kundappen kunden. Kunden kan ändå boka. Servern och kundappen läser detta.",
  "0 means never warn. At most {0} m. Usual value {1} m.": "0 betyder att aldrig varna. Högst {0} m. Vanligt värde {1} m.",
  "Shortest ride: 0 to 1000 m, in whole metres.": "Kortaste resa: 0 till 1000 m, i hela meter.",
};
