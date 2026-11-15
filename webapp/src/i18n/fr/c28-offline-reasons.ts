/** French dictionary, area c28-offline-reasons: BQ-A07 (owner 2026-10-31 "Send the real reason", Rules decisions/driver-g3.md): the admin texts for every Driver.offlineReason (contract.json#driverHome.setOffline.offlineReasons, plus app_restart), shown on the Audit page and the driver page by live/offlineReason.ts. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
export const frC28OfflineReasons = {
  "Missed or declined {0} offers in a row": "{0} offres manquées ou refusées d’affilée",
  "Missed or declined offers in a row": "Offres manquées ou refusées d’affilée",
  "The driver app was restarted while online": "L’application chauffeur a redémarré pendant qu’il était en ligne",
  "Car blocked or rejected by an admin: {0}": "Voiture bloquée ou refusée par un admin : {0}",
  "Car blocked or rejected by an admin": "Voiture bloquée ou refusée par un admin",
  "Removed from the fleet, or the fleet was blocked": "Retiré de la flotte, ou la flotte a été bloquée",
  "Account on hold, suspended or back to pending": "Compte en pause, suspendu ou remis en attente",
  "Set offline by Movera": "Mis hors ligne par Movera",
  "A required document has expired": "Un document obligatoire a expiré",
  "Went offline after his trip (asked during the trip)": "Passé hors ligne après sa course (demandé pendant la course)",
  "Set offline by the server ({0})": "Mis hors ligne par le serveur ({0})",
  "Offline reason": "Raison de la mise hors ligne",
  "Set offline {0}": "Mis hors ligne {0}",
} as const;
