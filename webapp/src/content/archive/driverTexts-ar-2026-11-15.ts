/**
 * ARCHIVE (Rule 21: nothing is deleted without archiving). BQ-A09, 2026-11-15.
 *
 * Owner 2026-11-02, Q7 "Make it real, sv/fr/en (Recommended)" => "Arabic tab removed" (Rules decisions/driver-g14.md:15,
 * plan/NEXT-NONMONEY-2026-11-15.md row 9). Content › Driver app texts had a fourth language tab, Arabic (right to left),
 * in content/driverTexts.ts (TextLang "ar", TEXT_LANGS row, emptyTexts ar: {}) and content/DriverTexts.tsx
 * (rtl = lang === "ar"); ContentPage.tsx said "… in English, Swedish, French and Arabic.".
 * This file keeps what was removed, so it can come back. It is not imported by the panel.
 *
 * The code held NO Arabic driver texts: every Arabic slot was empty (the app's English default). Arabic texts an admin
 * may have saved in the stored book are not lost either: normalizeDriverTextBook keeps them in book.archivedAr (kept on
 * every save, never sent to the driver app).
 */

/** The removed tab row of TEXT_LANGS (the editor wrote it right to left). */
export const ARCHIVED_ARABIC_TAB = { id: "ar", label: "Arabic", rtl: true } as const;

/** How many keys had an Arabic slot (DRIVER_TEXT_KEYS on 2026-11-15). */
export const ARCHIVED_ARABIC_KEYS = 67;

/** The Arabic texts in the code on 2026-11-15: none (emptyTexts().ar was {}). */
export const ARCHIVED_ARABIC_TEXTS: Record<string, string> = {};

/** The removed Content page line (i18n key kept in area c1-contract-v072-part1, unused now). */
export const ARCHIVED_CONTENT_LINE = "Island, offer and button texts in the driver app, in English, Swedish, French and Arabic.";
