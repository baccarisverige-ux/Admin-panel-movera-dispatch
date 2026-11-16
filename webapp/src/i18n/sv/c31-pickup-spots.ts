/** Swedish dictionary, area c31-pickup-spots: BQ-V21 (contract v0.18.115): the rider's approximate pickup entrance chips, on/off per zone in Dispatch › Rides. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC31PickupSpots } from "../en/c31-pickup-spots.ts";

export const svC31PickupSpots: Record<keyof typeof enC31PickupSpots, string> = {
  "Pickup entrance chips": "Ingångsval vid upphämtning",
  "When the rider sets the pickup, the rider app suggests Main entrance, Side entrance and Parking around the pin, marked as approximate. Previously used and Near Home always stay. The rider app reads this.": "När kunden väljer upphämtning föreslår kundappen Huvudentré, Sidoentré och Parkering runt nålen, märkta som ungefärliga. Använd tidigare och Nära hemmet finns alltid kvar. Kundappen läser detta.",
  "Pickup entrance chips (approximate)": "Ingångsval vid upphämtning (ungefärliga)",
  "Off: no entrance chips; the pickup is the address only. Usual value: on.": "Av: inga ingångsval; upphämtningen är bara adressen. Vanligt värde: på.",
};
