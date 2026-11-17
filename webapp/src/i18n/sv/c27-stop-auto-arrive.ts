/** Swedish dictionary, area c27-stop-auto-arrive: job C9b (contract v0.18.108 autoArrive.stops, owner 2026-11-02 "At the pickup AND at stops"): the pickup-waiting distances also apply at stops; the trip page stop rows and the live trip card show the server's stop facts. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
export const svC27StopAutoArrive = {
  "At the pickup and at stops: the server marks the driver arrived when they are this close; they can still tap Arrived. While they are farther than the second distance before the rider is in the car (pickup) or before the stop is done, the waiting time stops (nothing charged; at the pickup no free minutes used and no no-show) and goes on when they are back.": "Vid upphämtningen och vid stopp: servern markerar föraren som framme när hen är så här nära; hen kan fortfarande trycka på Framme. Medan hen är längre bort än det andra avståndet innan resenären har klivit in (upphämtning) eller innan stoppet är klart står väntetiden still (inget debiteras; vid upphämtningen används inga gratisminuter och ingen utebliven resenär) och fortsätter när hen är tillbaka.",
  "Arrived and waiting away at stops": "Framme och väntan när föraren åker iväg vid stopp",
  "The same distances as Waiting at pickup: the server marks the stop arrived within {0} m, and the waiting at the stop stops while the driver is more than {1} m away.": "Samma avstånd som Väntan vid upphämtning: servern markerar stoppet som framme inom {0} m, och väntan vid stoppet står still medan föraren är mer än {1} m bort.",
  "Arrived {0}": "Framme {0}",
  "Left {0}": "Lämnade {0}",
  "Waiting stopped: driver away since {0}": "Väntan stannad: föraren borta sedan {0}",
  "Stopped in all: {0} min ({1} times)": "Stannad totalt: {0} min ({1} gånger)",
  "At stop {0} since {1}": "Vid stopp {0} sedan {1}",
} as const;
