/** Swedish dictionary, area c10-lifecycle: contract v0.18.50 §72 (L6): Reassign on a held booked ride = Unassign (back to the Scheduled rides list; the driver may take it again). Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC10Lifecycle } from "../en/c10-lifecycle.ts";

export const svC10Lifecycle: Record<keyof typeof enC10Lifecycle, string> = {
  "Reassign takes this booked ride off its driver and puts it back in the Scheduled rides list; the driver may take it again.": "Tilldela om tar den här bokade resan från föraren och lägger tillbaka den i listan Bokade resor; föraren kan ta den igen.",
  "The booked ride is back in the Scheduled rides list; the driver may take it again.": "Den bokade resan är tillbaka i listan Bokade resor; föraren kan ta den igen.",
};
