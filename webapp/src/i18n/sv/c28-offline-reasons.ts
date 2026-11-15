/** Swedish dictionary, area c28-offline-reasons: BQ-A07 (owner 2026-10-31 "Send the real reason", Rules decisions/driver-g3.md): the admin texts for every Driver.offlineReason (contract.json#driverHome.setOffline.offlineReasons, plus app_restart), shown on the Audit page and the driver page by live/offlineReason.ts; and BQ-A09 (the same plan row 9), Content › Driver app texts in sv / fr / en; and BQ-A08 (row 8), the driven line on the trip page. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
export const svC28OfflineReasons = {
  "Missed or declined {0} offers in a row": "Missade eller nekade {0} erbjudanden i rad",
  "Missed or declined offers in a row": "Missade eller nekade erbjudanden i rad",
  "The driver app was restarted while online": "Förarappen startades om medan föraren var online",
  "Car blocked or rejected by an admin: {0}": "Bilen spärrad eller nekad av en admin: {0}",
  "Car blocked or rejected by an admin": "Bilen spärrad eller nekad av en admin",
  "Removed from the fleet, or the fleet was blocked": "Borttagen från åkeriet, eller åkeriet spärrades",
  "Account on hold, suspended or back to pending": "Kontot pausat, avstängt eller tillbaka till väntande",
  "Set offline by Movera": "Satt offline av Movera",
  "A required document has expired": "Ett obligatoriskt dokument har gått ut",
  "Went offline after his trip (asked during the trip)": "Gick offline efter resan (bad om det under resan)",
  "Set offline by the server ({0})": "Satt offline av servern ({0})",
  "Offline reason": "Orsak till offline",
  "Set offline {0}": "Satt offline {0}",
  // BQ-A09 (same plan row 9): Content › Driver app texts is sv / fr / en only, the Arabic tab is removed.
  "Island, offer and button texts in the driver app, in Swedish, French and English.": "Ö-, erbjudande- och knapptexter i förarappen, på svenska, franska och engelska.",
  // BQ-A08 (admin rows 8 + 9 ship in one admin PR): the trip page's driven line from GET /admin/trips/{tripId}/trace.
  "Driven route: {0} GPS positions · kept until {1}": "Körd väg: {0} GPS-positioner · sparas till {1}",
  "Driven route: {0} GPS positions": "Körd väg: {0} GPS-positioner",
  "No driven route yet: the driver app has sent no position on this trip. The planned route is shown.": "Ingen körd väg ännu: förarappen har inte skickat någon position på den här resan. Den planerade vägen visas.",
  "The driven route was deleted 30 days after the trip. The planned route is shown.": "Den körda vägen raderades 30 dagar efter resan. Den planerade vägen visas.",
  "The driven route could not be loaded. The planned route is shown.": "Den körda vägen kunde inte hämtas. Den planerade vägen visas.",
  "{0} Driven (GPS) {1} Planned": "{0} Körd (GPS) {1} Planerad",
} as const;
