/** English dictionary, area c55-offer-backup: L20 stream backup (contract v0.18.150, owner 2026-11-21 "Switch to old two (Rec.)"): Dispatch › Drivers, under "One live connection per driver phone", the two numbers "Backup after failed tries" (1-10, default 3) and "Try the one connection again after (minutes)" (1-60, default 10) with their help lines. Add new keys at the end of this file. Merged in ../en.ts in this order. */
export const enC55OfferBackup = {
  "Backup after failed tries": "Backup after failed tries",
  "When the one connection fails this many times in a row, the phone uses the two old connections so offers keep coming. Example: 3: driver Ali's phone fails the one connection 3 times in a row, then gets offers on the two old connections.": "When the one connection fails this many times in a row, the phone uses the two old connections so offers keep coming. Example: 3: driver Ali's phone fails the one connection 3 times in a row, then gets offers on the two old connections.",
  "Try the one connection again after (minutes)": "Try the one connection again after (minutes)",
  "How long the phone stays on the two old connections before it tries the one connection again. An app restart also tries it again. Example: 10: Ali's phone tries the one connection again 10 minutes later.": "How long the phone stays on the two old connections before it tries the one connection again. An app restart also tries it again. Example: 10: Ali's phone tries the one connection again 10 minutes later.",
  "tries": "tries",
} as const;
