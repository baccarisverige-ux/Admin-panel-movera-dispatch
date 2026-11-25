/** Swedish dictionary, area c64-live-traffic: live traffic for trip times (contract v0.18.163 contract.json#liveTraffic, owner 2026-11-25 "Google trafic réel"). Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC64LiveTraffic } from "../en/c64-live-traffic.ts";

export const svC64LiveTraffic: Record<keyof typeof enC64LiveTraffic, string> = {
  "Live traffic (Google)": "Trafik i realtid (Google)",
  "Trip times with today's traffic from Google, for prices, offers and the trip's ETA. Off: a straight-line estimate. Usual value: on in Sweden and France.": "Restider med dagens trafik från Google, för priser, erbjudanden och resans ankomsttid. Av: en uppskattning fågelvägen. Vanligt värde: på i Sverige och Frankrike.",
  "Ask Google again when the driver leaves the route": "Fråga Google igen när föraren lämnar rutten",
  "Ask Google again when the driver is late": "Fråga Google igen när föraren är sen",
  "Behind the planned arrival by more than": "Efter planerad ankomst med mer än",
  "About 2 Google calls per trip: the price, then the drive to the pickup. If Google does not answer, trip times are estimated and admins get an alert.": "Ungefär 2 anrop till Google per resa: priset, sedan körningen till upphämtningen. Om Google inte svarar uppskattas restiderna och admin får ett larm.",
  "Live traffic is not available: trip times are estimated (straight line)": "Trafik i realtid är inte tillgänglig: restiderna uppskattas fågelvägen",
  "Check that the Routes API is enabled for the server's Google Maps key, and its billing": "Kontrollera att Routes API är aktiverat för serverns Google Maps-nyckel, och faktureringen",
};
