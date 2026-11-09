/** Swedish dictionary, area c12-admin-masking: contract v0.18.54 §76 (contract.json#adminMasking; owner 2026-11-09 Q40 yes, Q41 yes): the server masks phone / e-mail / date of birth for admins without viewSensitive; Reveal with a reason dialog; one SOS reveal of both phones on an open case. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC12AdminMasking } from "../en/c12-admin-masking.ts";

export const svC12AdminMasking: Record<keyof typeof enC12AdminMasking, string> = {
  "{0} Reveal": "{0} Visa",
  "Reveal the full value": "Visa det fullständiga värdet",
  "The server shows the full phone, e-mail and date of birth once, for this page only, and saves who asked and why.": "Servern visar fullständigt telefonnummer, e-post och födelsedatum en gång, bara på den här sidan, och sparar vem som frågade och varför.",
  "Why do you need the full value?": "Varför behöver du det fullständiga värdet?",
  "At least 3 characters": "Minst 3 tecken",
  "Masked by the server for your role. Press Reveal to see the full value.": "Maskerat av servern för din roll. Tryck på Visa för att se det fullständiga värdet.",
  "no account on this case": "inget konto på det här ärendet",
  "no phone number on the record": "inget telefonnummer på posten",
  "Phones of the people on this case": "Telefonnummer till personerna i ärendet",
  "Your role cannot reveal the phones.": "Din roll kan inte visa telefonnumren.",
  "One click shows both numbers while the case is open. It is saved in the audit as an SOS reveal.": "Ett klick visar båda numren medan ärendet är öppet. Det sparas i loggen som en SOS-visning.",
  "{0} Reveal both phones (SOS)": "{0} Visa båda telefonnumren (SOS)",
  "Reveal a rider's full phone and e-mail (reason, audited)": "Visa en resenärs fullständiga telefon och e-post (skäl, loggas)",
  "Reveal a driver's full phone, e-mail and date of birth (reason, audited)": "Visa en förares fullständiga telefon, e-post och födelsedatum (skäl, loggas)",
  "Reveal a fleet's full owner e-mail (reason, audited)": "Visa en flottas fullständiga ägar-e-post (skäl, loggas)",
  "Reveal both phones of an open safety case (SOS, audited)": "Visa båda telefonnumren i ett öppet säkerhetsärende (SOS, loggas)",
};
