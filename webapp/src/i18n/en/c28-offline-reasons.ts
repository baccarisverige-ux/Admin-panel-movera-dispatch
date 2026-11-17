/** English dictionary, area c28-offline-reasons: BQ-A07 (owner 2026-10-31 "Send the real reason", Rules decisions/driver-g3.md): the admin texts for every Driver.offlineReason (contract.json#driverHome.setOffline.offlineReasons, plus app_restart), shown on the Audit page and the driver page by live/offlineReason.ts; and BQ-A09 (the same plan row 9), Content › Driver app texts in sv / fr / en; and BQ-A08 (row 8), the driven line on the trip page. Add new keys at the end of this file. Merged in ../en.ts in this order. */
export const enC28OfflineReasons = {
  "Missed or declined {0} offers in a row": "Missed or declined {0} offers in a row",
  "Missed or declined offers in a row": "Missed or declined offers in a row",
  "The driver app was restarted while online": "The driver app was restarted while online",
  "Car blocked or rejected by an admin: {0}": "Car blocked or rejected by an admin: {0}",
  "Car blocked or rejected by an admin": "Car blocked or rejected by an admin",
  "Removed from the fleet, or the fleet was blocked": "Removed from the fleet, or the fleet was blocked",
  "Account on hold, suspended or back to pending": "Account on hold, suspended or back to pending",
  "Set offline by Movera": "Set offline by Movera",
  "A required document has expired": "A required document has expired",
  "Went offline after their trip (asked during the trip)": "Went offline after their trip (asked during the trip)",
  "Set offline by the server ({0})": "Set offline by the server ({0})",
  "Offline reason": "Offline reason",
  "Set offline {0}": "Set offline {0}",
  // BQ-A09 (same plan row 9): Content › Driver app texts is sv / fr / en only, the Arabic tab is removed.
  "Island, offer and button texts in the driver app, in Swedish, French and English.": "Island, offer and button texts in the driver app, in Swedish, French and English.",
  // BQ-A08 (admin rows 8 + 9 ship in one admin PR): the trip page's driven line from GET /admin/trips/{tripId}/trace.
  "Driven route: {0} GPS positions · kept until {1}": "Driven route: {0} GPS positions · kept until {1}",
  "Driven route: {0} GPS positions": "Driven route: {0} GPS positions",
  "No driven route yet: the driver app has sent no position on this trip. The planned route is shown.": "No driven route yet: the driver app has sent no position on this trip. The planned route is shown.",
  "The driven route was deleted 30 days after the trip. The planned route is shown.": "The driven route was deleted 30 days after the trip. The planned route is shown.",
  "The driven route could not be loaded. The planned route is shown.": "The driven route could not be loaded. The planned route is shown.",
  "{0} Driven (GPS) {1} Planned": "{0} Driven (GPS) {1} Planned",
} as const;
