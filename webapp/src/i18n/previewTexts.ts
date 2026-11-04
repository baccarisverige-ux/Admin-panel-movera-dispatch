import { currentLanguage } from "./core.ts";

/**
 * B7 admin real app preview texts (sv / fr / en). Kept in their own file while the panel's main dictionaries are being
 * changed by open PRs; move them into en.ts / fr.ts / sv.ts after those land.
 */
const TEXTS = {
  realApp: { en: "Real app", sv: "Riktig app", fr: "Vraie appli" },
  sample: { en: "Sample", sv: "Exempel", fr: "Exemple" },
  zone: { en: "Zone", sv: "Zon", fr: "Zone" },
  draft: { en: "Show draft settings", sv: "Visa utkastets inställningar", fr: "Afficher les réglages en brouillon" },
  reload: { en: "Reload", sv: "Ladda om", fr: "Recharger" },
  note: {
    en: "The real app on the live server. Nothing is sent: Book, Accept and Pay show “Preview – not sent”.",
    sv: "Den riktiga appen mot liveservern. Inget skickas: Boka, Acceptera och Betala visar ”Förhandsvisning – inte skickat”.",
    fr: "La vraie appli sur le serveur en ligne. Rien n’est envoyé : Réserver, Accepter et Payer affichent « Aperçu – non envoyé ».",
  },
  opening: { en: "Opening the app…", sv: "Öppnar appen…", fr: "Ouverture de l’appli…" },
  failed: { en: "The real app could not open. Showing the sample.", sv: "Den riktiga appen kunde inte öppnas. Exemplet visas.", fr: "La vraie appli n’a pas pu s’ouvrir. L’exemple est affiché." },
  riderTitle: { en: "Rider app preview", sv: "Förhandsvisning av passagerarappen", fr: "Aperçu de l’appli passager" },
  driverTitle: { en: "Driver app preview", sv: "Förhandsvisning av förarappen", fr: "Aperçu de l’appli chauffeur" },
} as const;

export type PreviewTextKey = keyof typeof TEXTS;

export function previewText(key: PreviewTextKey): string {
  const language = currentLanguage();
  return TEXTS[key][language === "sv" || language === "fr" ? language : "en"];
}

export const PREVIEW_TEXT_KEYS = Object.keys(TEXTS) as PreviewTextKey[];
