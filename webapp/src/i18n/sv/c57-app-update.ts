/** Swedish dictionary, area c57-app-update: P16c minimum app version (contract v0.18.154 contract.json#appUpdate, owner 2026-11-21 20:30 "Yes, build it now (Recommended)"): Settings › Minimum app version, per app, platform and scope. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC57AppUpdate } from "../en/c57-app-update.ts";

export const svC57AppUpdate: Record<keyof typeof enC57AppUpdate, string> = {
  "Minimum app version": "Lägsta appversion",
  "A phone below the minimum sees one screen, “Update Movera to continue”, with a button to its store. A driver on a trip is never stopped mid-trip. Empty = off.": "En telefon under lägsta versionen ser en enda skärm, ”Uppdatera Movera för att fortsätta”, med en knapp till sin butik. En förare på en resa stoppas aldrig mitt i resan. Tomt = av.",
  "Phones below this version must update before they can book or go online.": "Telefoner under den här versionen måste uppdatera innan de kan boka eller gå online.",
  "Could not read the minimum app version. Try again.": "Kunde inte läsa lägsta appversionen. Försök igen.",
  "Saved. Phones get it with the next settings update.": "Sparat. Telefonerna får det med nästa inställningsuppdatering.",
  "Standard (every zone that has no own settings)": "Standard (alla zoner utan egna inställningar)",
  "This zone uses its country Standard now; saving here gives it its own value.": "Zonen använder landets Standard nu; sparar du här får den ett eget värde.",
  "Android minimum": "Android lägsta",
  "iOS minimum": "iOS lägsta",
  "Android store link": "Android butikslänk",
  "iOS store link": "iOS butikslänk",
  "The app's own link": "Appens egen länk",
  "Write the version as x.y.z, for example 1.4.0.": "Skriv versionen som x.y.z, till exempel 1.4.0.",
  "Write a full https:// link.": "Skriv en hel https://-länk.",
  "Save minimum app version": "Spara lägsta appversion",
};
