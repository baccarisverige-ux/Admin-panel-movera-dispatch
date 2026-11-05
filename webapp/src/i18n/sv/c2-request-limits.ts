/** Swedish dictionary, area c2-request-limits: Request limits per minute (contract v0.18.24, rate limit) (add new keys at the end of this file). Merged in ../sv.ts in this order. */
import type { enC2RequestLimits } from "../en/c2-request-limits.ts";

export const svC2RequestLimits: Record<keyof typeof enC2RequestLimits, string> = {
  "Request limits": "Begäransgränser",
  "How many changes (book, cancel, send, save) one person may send per minute. Above it the apps say “wait a moment” and try again by themselves.": "Hur många ändringar (boka, avboka, skicka, spara) en person får skicka per minut. Över gränsen säger apparna ”vänta en stund” och försöker igen själva.",
  "Only on the live server.": "Bara på liveservern.",
  "Could not read the request limits. Try again.": "Kunde inte läsa begäransgränserna. Försök igen.",
  "Saved. The server uses the new limits within a minute.": "Sparat. Servern använder de nya gränserna inom en minut.",
  "Could not save. Try again.": "Kunde inte spara. Försök igen.",
  "This country has no published Standard yet.": "Det här landet har ingen publicerad standard ännu.",
  "Changes per signed-in user per minute": "Ändringar per inloggad användare per minut",
  "Changes per internet address per minute (not signed in)": "Ändringar per internetadress per minut (ej inloggad)",
  "Enter a whole number.": "Ange ett heltal.",
  "Between {0} and {1}.": "Mellan {0} och {1}.",
  "Save request limits": "Spara begäransgränser",
};
