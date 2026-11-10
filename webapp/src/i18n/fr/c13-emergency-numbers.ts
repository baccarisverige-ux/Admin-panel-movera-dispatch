/** French dictionary, area c13-emergency-numbers: contract v0.18.57 §79, Tips & limits › Emergency numbers and the safety case page. Add new keys at the end of this file. Merged in ../fr.ts in this order. */
import type { enC13EmergencyNumbers } from "../en/c13-emergency-numbers.ts";

export const frC13EmergencyNumbers: Record<keyof typeof enC13EmergencyNumbers, string> = {
  "{0} Emergency numbers": "{0} Numéros d’urgence",
  "The call buttons on the safety screens of the rider and driver apps, and on the safety case page. The first number is the main one: SOS dials it.": "Les boutons d’appel des écrans de sécurité des apps passager et chauffeur, et de la page du dossier de sécurité. Le premier numéro est le principal : le SOS l’appelle.",
  "Emergency numbers are set for the whole country, on the Standard.": "Les numéros d’urgence se règlent pour tout le pays, sur le Standard.",
  "Emergency number {0} kind": "Numéro d’urgence {0} type",
  "Emergency number {0}": "Numéro d’urgence {0}",
  "Emergency number {0}: {1}": "Numéro d’urgence {0} : {1}",
  "Move emergency number {0} up": "Monter le numéro d’urgence {0}",
  "Move emergency number {0} down": "Descendre le numéro d’urgence {0}",
  "Remove emergency number {0}": "Supprimer le numéro d’urgence {0}",
  "Add an emergency number": "Ajouter un numéro d’urgence",
  "Ambulance": "Ambulance",
  "General": "Général",
  "{0}: keep at least one emergency number.": "{0} : gardez au moins un numéro d’urgence.",
  "{0}: at most 6 emergency numbers.": "{0} : 6 numéros d’urgence au plus.",
  "{0}: emergency number {1} must be 2 to 15 digits (a + first is allowed).": "{0} : le numéro d’urgence {1} doit avoir 2 à 15 chiffres (un + au début est permis).",
  "{0}: emergency number {1} needs a name in Swedish, French and English (1 to 40 characters).": "{0} : le numéro d’urgence {1} doit avoir un nom en suédois, français et anglais (1 à 40 caractères).",
  "Emergency numbers: {0} → {1}": "Numéros d’urgence : {0} → {1}",
};
