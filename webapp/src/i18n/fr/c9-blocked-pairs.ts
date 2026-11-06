/** French dictionary, area c9-blocked-pairs: fix job 10 (contract v0.18.40 §64): Block this pair, Blocked pairs with Undo, Tips & limits › Don't match again. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC9BlockedPairs } from "../en/c9-blocked-pairs.ts";

export const frC9BlockedPairs: Record<keyof typeof enC9BlockedPairs, string> = {
  "Block this pair": "Bloquer ce duo",
  "Never match this rider and driver again": "Ne plus jamais associer ce passager et ce chauffeur",
  "Neither side is ever told. Only Support can undo a block.": "Aucun des deux n'est prévenu. Seul le Support peut annuler un blocage.",
  "Pair blocked. Neither side is told.": "Duo bloqué. Aucun des deux n'est prévenu.",
  "Blocked pairs": "Duos bloqués",
  "No blocked pairs.": "Aucun duo bloqué.",
  "Block removed.": "Blocage retiré.",
  "Blocked by the rider (1-star rating)": "Bloqué par le passager (note 1 étoile)",
  "Blocked by the driver (1-star rating)": "Bloqué par le chauffeur (note 1 étoile)",
  "Blocked by Support": "Bloqué par le Support",
  "Don't match again": "Ne plus associer",
  "Offer the tick at": "Proposer la case à",
  "1 star or fewer": "1 étoile ou moins",
  "{0} stars or fewer": "{0} étoiles ou moins",
  "Don't match again: {0} → {1}": "Ne plus associer : {0} → {1}",
  "Don't match again offered at: {0} → {1}": "Ne plus associer proposé à : {0} → {1}",
  "{0}: \"Don't match again\" can be offered at 1 or 2 stars.": "{0} : « Ne plus associer » peut être proposé à 1 ou 2 étoiles.",
  "On a low rating the rider and the driver can tick \"Don't match me again\". They are never matched again. Neither side is ever told. Only Support can undo a block.": "Avec une note basse, le passager et le chauffeur peuvent cocher « Ne plus me proposer ». Ils ne sont plus jamais associés. Aucun des deux n'est prévenu. Seul le Support peut annuler un blocage.",
};
