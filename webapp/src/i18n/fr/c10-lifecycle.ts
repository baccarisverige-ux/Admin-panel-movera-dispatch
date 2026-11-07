/** French dictionary, area c10-lifecycle: contract v0.18.50 §72 (L6): Reassign on a held booked ride = Unassign (back to the Scheduled rides list; the driver may take it again). Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC10Lifecycle } from "../en/c10-lifecycle.ts";

export const frC10Lifecycle: Record<keyof typeof enC10Lifecycle, string> = {
  "Reassign takes this booked ride off its driver and puts it back in the Scheduled rides list; the driver may take it again.": "Réattribuer retire cette course programmée à son chauffeur et la remet dans la liste Courses programmées ; le chauffeur peut la reprendre.",
  "The booked ride is back in the Scheduled rides list; the driver may take it again.": "La course programmée est de retour dans la liste Courses programmées ; le chauffeur peut la reprendre.",
};
