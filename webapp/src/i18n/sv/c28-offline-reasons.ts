/** Swedish dictionary, area c28-offline-reasons: BQ-A07 (owner 2026-10-31 "Send the real reason", Rules decisions/driver-g3.md): the admin texts for every Driver.offlineReason (contract.json#driverHome.setOffline.offlineReasons, plus app_restart), shown on the Audit page and the driver page by live/offlineReason.ts. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
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
} as const;
