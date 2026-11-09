/** Swedish dictionary, area c3-real-app-preview: Real app preview (contract v0.18.25 §47) (add new keys at the end of this file). Merged in ../sv.ts in this order. */
import type { enC3RealAppPreview } from "../en/c3-real-app-preview.ts";

export const svC3RealAppPreview: Record<keyof typeof enC3RealAppPreview, string> = {
  // B7 admin real app preview (contract v0.18.25 §47).
  "Show draft settings": "Visa utkastets inställningar",
  "Reload": "Ladda om",
  "The real app on the live server. Nothing is sent: Book, Accept and Pay show “Preview – not sent”.": "Den riktiga appen mot liveservern. Inget skickas: Boka, Acceptera och Betala visar ”Förhandsvisning – inte skickat”.",
  "Opening the app…": "Öppnar appen…",
  "Rider app preview": "Förhandsvisning av passagerarappen",
  "Sign in to the live server to see the real app.": "Logga in på liveservern för att se den riktiga appen.",
  "The real app could not open. Press Reload to try again.": "Den riktiga appen kunde inte öppnas. Tryck på Ladda om för att försöka igen.",
  // Step 24 (owner Q31, 2026-11-09): the app opens in a new tab, not in a frame.
  "The real app opens in a new tab, read-only for 15 minutes. Nothing is sent: Book, Accept and Pay show “Preview – not sent”.": "Den riktiga appen öppnas i en ny flik, skrivskyddad i 15 minuter. Inget skickas: Boka, Acceptera och Betala visar ”Förhandsvisning – inte skickat”.",
  "Open the real app in a new tab": "Öppna den riktiga appen i en ny flik",
  "Your browser blocked the new tab. Allow pop-ups for this site and try again.": "Webbläsaren blockerade den nya fliken. Tillåt popup-fönster för den här webbplatsen och försök igen.",
};
