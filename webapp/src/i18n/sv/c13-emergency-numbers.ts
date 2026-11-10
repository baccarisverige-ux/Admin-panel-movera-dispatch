/** Swedish dictionary, area c13-emergency-numbers: contract v0.18.57 §79, Tips & limits › Emergency numbers and the safety case page. Add new keys at the end of this file. Merged in ../sv.ts in this order. */
import type { enC13EmergencyNumbers } from "../en/c13-emergency-numbers.ts";

export const svC13EmergencyNumbers: Record<keyof typeof enC13EmergencyNumbers, string> = {
  "{0} Emergency numbers": "{0} Nödnummer",
  "The call buttons on the safety screens of the rider and driver apps, and on the safety case page. The first number is the main one: SOS dials it.": "Ringknapparna på säkerhetsskärmarna i resenärs- och förarappen och på säkerhetsärendet. Det första numret är huvudnumret: SOS ringer det.",
  "Emergency numbers are set for the whole country, on the Standard.": "Nödnummer ställs in för hela landet, på Standard.",
  "Emergency number {0} kind": "Nödnummer {0} typ",
  "Emergency number {0}": "Nödnummer {0}",
  "Emergency number {0}: {1}": "Nödnummer {0}: {1}",
  "Move emergency number {0} up": "Flytta nödnummer {0} upp",
  "Move emergency number {0} down": "Flytta nödnummer {0} ned",
  "Remove emergency number {0}": "Ta bort nödnummer {0}",
  "Add an emergency number": "Lägg till ett nödnummer",
  "Ambulance": "Ambulans",
  "General": "Allmänt",
  "{0}: keep at least one emergency number.": "{0}: behåll minst ett nödnummer.",
  "{0}: at most 6 emergency numbers.": "{0}: högst 6 nödnummer.",
  "{0}: emergency number {1} must be 2 to 15 digits (a + first is allowed).": "{0}: nödnummer {1} måste vara 2 till 15 siffror (+ först är tillåtet).",
  "{0}: emergency number {1} needs a name in Swedish, French and English (1 to 40 characters).": "{0}: nödnummer {1} behöver ett namn på svenska, franska och engelska (1 till 40 tecken).",
  "Emergency numbers: {0} → {1}": "Nödnummer: {0} → {1}",
};
