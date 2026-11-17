/** Swedish dictionary, area c32-share-trip: BQ-S10 (contract v0.18.116): riders can share a live trip link, on/off per zone in Dispatch › Safety; Config › Features "Share trip" is read-only. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC32ShareTrip } from "../en/c32-share-trip.ts";

export const svC32ShareTrip: Record<keyof typeof enC32ShareTrip, string> = {
  "Share trip link": "Länk för att dela resan",
  "During a trip the rider can send a live link to someone they trust. The page shows the car, the plate and the arrival time. The car’s position shows only while the rider is in the car, and never near the pickup, a stop or the drop-off. The link stops at drop-off.": "Under en resa kan resenären skicka en livelänk till någon den litar på. Sidan visar bilen, registreringsnumret och ankomsttiden. Bilens position visas bara när resenären sitter i bilen, och aldrig nära upphämtningen, ett stopp eller avlämningen. Länken slutar fungera vid avlämningen.",
  "Riders can share a live trip link": "Resenärer kan dela en livelänk till resan",
  "Off: the rider app hides Share trip and every live link of this zone stops. Usual value: on.": "Av: resenärsappen döljer Dela resan och alla livelänkar i zonen slutar fungera. Vanligt värde: på.",
  "{0}: set per zone in Dispatch › Safety. {1}": "{0}: ställs in per zon i Trafikledning › Säkerhet. {1}",
  "Share trip could not be read from the server for this zone. Reload the page and try again.": "Dela resan kunde inte läsas från servern för den här zonen. Ladda om sidan och försök igen.",
};
