/** Swedish dictionary, area c9-blocked-pairs: fix job 10 (contract v0.18.43 §64): Block this pair, Blocked pairs with Undo, Tips & limits › Don't match again. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC9BlockedPairs } from "../en/c9-blocked-pairs.ts";

export const svC9BlockedPairs: Record<keyof typeof enC9BlockedPairs, string> = {
  "Block this pair": "Blockera paret",
  "Never match this rider and driver again": "Matcha aldrig den här resenären och föraren igen",
  "Neither side is ever told. Only Support can undo a block.": "Ingen av dem får veta det. Bara Support kan ta bort en blockering.",
  "Pair blocked. Neither side is told.": "Paret är blockerat. Ingen av dem får veta det.",
  "Blocked pairs": "Blockerade par",
  "No blocked pairs.": "Inga blockerade par.",
  "Block removed.": "Blockeringen är borttagen.",
  "Blocked by the rider (1-star rating)": "Blockerad av resenären (betyg 1 stjärna)",
  "Blocked by the driver (1-star rating)": "Blockerad av föraren (betyg 1 stjärna)",
  "Blocked by Support": "Blockerad av Support",
  "Don't match again": "Matcha inte igen",
  "Offer the tick at": "Visa rutan vid",
  "1 star or fewer": "1 stjärna eller färre",
  "{0} stars or fewer": "{0} stjärnor eller färre",
  "Don't match again: {0} → {1}": "Matcha inte igen: {0} → {1}",
  "Don't match again offered at: {0} → {1}": "Matcha inte igen visas vid: {0} → {1}",
  "{0}: \"Don't match again\" can be offered at 1 or 2 stars.": "{0}: ”Matcha inte igen” kan visas vid 1 eller 2 stjärnor.",
  "On a low rating the rider and the driver can tick \"Don't match me again\". They are never matched again. Neither side is ever told. Only Support can undo a block.": "Vid ett lågt betyg kan resenären och föraren kryssa i ”Matcha mig inte igen”. De matchas aldrig igen. Ingen av dem får veta det. Bara Support kan ta bort en blockering.",
};
