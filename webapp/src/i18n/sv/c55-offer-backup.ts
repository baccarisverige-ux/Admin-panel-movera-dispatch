/** Swedish dictionary, area c55-offer-backup: L20 stream backup (contract v0.18.150, owner 2026-11-21 "Switch to old two (Rec.)"): Dispatch › Drivers, under "One live connection per driver phone", the two numbers "Backup after failed tries" (1-10, default 3) and "Try the one connection again after (minutes)" (1-60, default 10) with their help lines. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC55OfferBackup } from "../en/c55-offer-backup.ts";

export const svC55OfferBackup: Record<keyof typeof enC55OfferBackup, string> = {
  "Backup after failed tries": "Reserv efter misslyckade försök",
  "When the one connection fails this many times in a row, the phone uses the two old connections so offers keep coming. Example: 3: driver Ali's phone fails the one connection 3 times in a row, then gets offers on the two old connections.": "När den enda anslutningen misslyckas så här många gånger i rad använder telefonen de två gamla anslutningarna, så att erbjudandena fortsätter komma. Exempel: 3: förare Alis telefon misslyckas med den enda anslutningen 3 gånger i rad och får sedan erbjudanden via de två gamla anslutningarna.",
  "Try the one connection again after (minutes)": "Försök med den enda anslutningen igen efter (minuter)",
  "How long the phone stays on the two old connections before it tries the one connection again. An app restart also tries it again. Example: 10: Ali's phone tries the one connection again 10 minutes later.": "Hur länge telefonen stannar på de två gamla anslutningarna innan den försöker med den enda anslutningen igen. En omstart av appen försöker också igen. Exempel: 10: Alis telefon försöker med den enda anslutningen igen 10 minuter senare.",
  "tries": "försök",
};
