import { tr } from "../i18n";

/** Pictures the rider app already ships, used as the promotion's thumbnail. */
export const CARD_IMAGES: { id: string; label: string; file: string | null }[] = [
  { id: "gradient", get label() { return tr("Movera colours"); }, file: null },
  { id: "comfort", get label() { return tr("Comfort ride"); }, file: "movera_comfort_ride.webp" },
  { id: "airport", get label() { return tr("Airport"); }, file: "movera_airport_premium.webp" },
  { id: "events", get label() { return tr("Events"); }, file: "movera_events_premium.webp" },
  { id: "business", get label() { return tr("Work"); }, file: "movera_business_premium.webp" },
  { id: "outings", get label() { return tr("Outings"); }, file: "movera_outings_premium.webp" },
];

export function imageUrl(id: string | undefined): string | null {
  const file = CARD_IMAGES.find((item) => item.id === id)?.file;
  return file ? `${import.meta.env.BASE_URL}rider-app/${file}` : null;
}
