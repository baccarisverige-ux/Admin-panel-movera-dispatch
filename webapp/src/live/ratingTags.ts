/**
 * contract v0.9.0 contract.json#ratings.tags (owner real-data decision, part 3): one fixed list of tag codes, the
 * same in every country. aboutDriver: what a rider may say about the driver; aboutRider: what a driver may say about
 * the rider. The words are the panel's own (sv/fr/en through the dictionary).
 */
import { tr } from "../i18n/core.ts";

export const RATING_TAGS = {
  aboutDriver: ["clean_car", "friendly", "safe_driving", "good_music", "knew_the_way"],
  aboutRider: ["on_time", "polite", "clear_pickup"],
} as const;

const LABEL = {
  clean_car: "Clean car",
  friendly: "Friendly",
  safe_driving: "Safe driving",
  good_music: "Good music",
  knew_the_way: "Knew the way",
  on_time: "On time",
  polite: "Polite",
  clear_pickup: "Clear pickup",
} as const;

export function ratingTagLabel(code: string): string {
  const label = (LABEL as Record<string, (typeof LABEL)[keyof typeof LABEL]>)[code];
  return label ? tr(label) : code;
}
