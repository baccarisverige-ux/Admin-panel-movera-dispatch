/** Swedish dictionary, area c50-live-location: contract v0.18.144 (contract.json#liveLocation): Dispatch › Safety switch "Live location" (default off) and the adjust-pickup banner distance. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC50LiveLocation } from "../en/c50-live-location.ts";

export const svC50LiveLocation: Record<keyof typeof enC50LiveLocation, string> = {
  "Live location": "Liveposition",
  "During a ride the rider and the driver can each turn on Share my location, so they see each other on the map until pickup. Positions are passed on live and never saved. Off by default until the load test passes.": "Under en resa kan resenären och föraren var för sig slå på Dela min plats, så att de ser varandra på kartan fram till upphämtningen. Positioner skickas vidare direkt och sparas aldrig. Av som standard tills belastningstestet är godkänt.",
  "Riders and drivers can share their live location": "Resenärer och förare kan dela sin liveposition",
  "Off: the apps hide Share my location in this zone. Usual value: off until the load test passes.": "Av: apparna döljer Dela min plats i zonen. Vanligt värde: av tills belastningstestet är godkänt.",
  "Adjust-pickup banner from": "Banner för att justera upphämtning från",
  "10 to 500 m. The rider app offers to move the pickup to the rider's GPS when the rider is farther than this from the pickup.": "10 till 500 m. Resenärsappen erbjuder att flytta upphämtningen till resenärens GPS när resenären är längre bort än så från upphämtningen.",
};
