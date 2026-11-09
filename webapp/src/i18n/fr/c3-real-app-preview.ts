/** French dictionary, area c3-real-app-preview: Real app preview (contract v0.18.25 §47) (add new keys at the end of this file). Merged in ../fr.ts in this order. */
import type { enC3RealAppPreview } from "../en/c3-real-app-preview.ts";

export const frC3RealAppPreview: Record<keyof typeof enC3RealAppPreview, string> = {
  // B7 admin real app preview (contract v0.18.25 §47).
  "Show draft settings": "Afficher les réglages en brouillon",
  "Reload": "Recharger",
  "The real app on the live server. Nothing is sent: Book, Accept and Pay show “Preview – not sent”.": "La vraie appli sur le serveur en ligne. Rien n’est envoyé : Réserver, Accepter et Payer affichent « Aperçu – non envoyé ».",
  "Opening the app…": "Ouverture de l’appli…",
  "Rider app preview": "Aperçu de l’appli passager",
  "Sign in to the live server to see the real app.": "Connectez-vous au serveur en ligne pour voir la vraie appli.",
  "The real app could not open. Press Reload to try again.": "La vraie appli n’a pas pu s’ouvrir. Appuyez sur Recharger pour réessayer.",
  // Step 24 (owner Q31, 2026-11-09): the app opens in a new tab, not in a frame.
  "The real app opens in a new tab, read-only for 15 minutes. Nothing is sent: Book, Accept and Pay show “Preview – not sent”.": "La vraie appli s’ouvre dans un nouvel onglet, en lecture seule pendant 15 minutes. Rien n’est envoyé : Réserver, Accepter et Payer affichent « Aperçu – non envoyé ».",
  "Open the real app in a new tab": "Ouvrir la vraie appli dans un nouvel onglet",
  "Your browser blocked the new tab. Allow pop-ups for this site and try again.": "Votre navigateur a bloqué le nouvel onglet. Autorisez les fenêtres pop-up pour ce site et réessayez.",
};
