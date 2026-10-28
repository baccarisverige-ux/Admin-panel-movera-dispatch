import { isLiveData } from "../live/realData.ts";
import type { DemoRecord } from "../api/seed.ts";
import { MARKETS, marketOfZone, type MarketId } from "../markets/markets.ts";
import type { Moderation } from "./ops.ts";

/**
 * Reviews: ratings riders and drivers give each other, with tags and comments, averages per person,
 * rules for low ratings and words that are hidden by themselves. The review ids are the same as
 * the old moderation, so hiding and restoring keep working.
 */

export const REVIEW_OPS_KEY = "reviewOps";

export type Direction = "rider" | "driver";
export type Review = { id: string; tripId: string; zone: string; country: MarketId; from: Direction; byName: string; aboutId: string | null; aboutName: string; stars: number; tags: string[]; text: string; at: string };

export type ReviewRule = { on: boolean; below: number };
export type ReviewRules = { warn: ReviewRule; review: ReviewRule; block: ReviewRule; minReviews: number; badWords: { on: boolean; words: string[] }; riderTags: string[]; driverTags: string[] };
export type ReviewOps = { draftRev: number; rules: Record<MarketId, ReviewRules> };

function rules(country: MarketId): ReviewRules {
  const tags: Record<MarketId, { rider: string[]; driver: string[] }> = {
    SE: { driver: ["Clean car", "Friendly", "Safe driving", "Good music", "Knew the way"], rider: ["On time", "Polite", "Clear pickup"] },
    FR: { driver: ["Voiture propre", "Aimable", "Conduite sûre", "Bon trajet"], rider: ["À l'heure", "Poli"] },
    TN: { driver: ["Voiture propre", "Aimable", "Conduite sûre", "Climatisation"], rider: ["À l'heure", "Poli"] },
  };
  return { warn: { on: true, below: 4.5 }, review: { on: true, below: 4.2 }, block: { on: false, below: 3.6 }, minReviews: 3, badWords: { on: true, words: ["idiot", "stupid", "scam"] }, riderTags: tags[country].rider, driverTags: tags[country].driver };
}

export function emptyReviewOps(): ReviewOps {
  return { draftRev: 1, rules: { SE: rules("SE"), FR: rules("FR"), TN: rules("TN") } };
}

export function normalizeReviewOps(value: unknown): ReviewOps {
  const base = emptyReviewOps();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<ReviewOps>;
  const out = { ...base.rules };
  for (const item of MARKETS) {
    const saved = raw.rules?.[item.id];
    if (saved) out[item.id] = { ...base.rules[item.id], ...saved, badWords: { ...base.rules[item.id].badWords, ...saved.badWords } };
  }
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, rules: out };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

const GOOD = ["Very nice ride, thank you!", "Smooth and on time.", "Great driver, would ride again.", "All good."];
const MEH = ["The car smelled of smoke.", "Took a longer way than needed.", "Drove a bit too fast.", "Late to the pickup."];
const BAD = ["The driver was rude, what an idiot.", "This is a scam, charged too much.", "Never again."];
const RIDER_TEXT = ["Polite rider.", "Was waiting at the right place.", "Kept me waiting 8 minutes.", ""];

/** Two reviews per completed trip: the rider about the driver and the driver about the rider. Demo text and stars from the trip id. */
export function reviewsOf(trips: readonly DemoRecord[], drivers: readonly DemoRecord[], ops: ReviewOps, now: number): Review[] {
  // Live: reviews come from the server's ratings (GET /admin/ratings), never from the trip id.
  if (isLiveData()) return [];
  const names = new Map(drivers.map((row) => [row.id, row.name]));
  return trips.filter((trip) => trip.status === "completed").flatMap((trip) => {
    const country = marketOfZone(trip.zoneId)?.id ?? "SE";
    const settings = ops.rules[country];
    const seed = hash(trip.id);
    const riderStars = seed % 11 === 0 ? 2 : seed % 7 === 0 ? 3 : seed % 3 === 0 ? 4 : 5;
    const driverStars = seed % 13 === 0 ? 3 : seed % 4 === 0 ? 4 : 5;
    const text = riderStars <= 2 ? BAD[seed % BAD.length] : riderStars === 3 ? MEH[seed % MEH.length] : GOOD[seed % GOOD.length];
    const at = new Date(now - (seed % (30 * 24 * 60)) * 60_000).toISOString();
    const driverName = trip.driverId ? names.get(trip.driverId) ?? "Driver" : "Driver";
    return [
      { id: `${trip.id}-rider`, tripId: trip.id, zone: trip.zoneId, country, from: "rider" as const, byName: trip.name, aboutId: trip.driverId ?? null, aboutName: driverName, stars: riderStars, tags: riderStars >= 4 ? settings.driverTags.filter((_, index) => (seed >>> index) % 3 === 0).slice(0, 2) : [], text, at },
      { id: `${trip.id}-driver`, tripId: trip.id, zone: trip.zoneId, country, from: "driver" as const, byName: driverName, aboutId: null, aboutName: trip.name, stars: driverStars, tags: driverStars >= 4 ? settings.riderTags.filter((_, index) => (seed >>> (index + 3)) % 3 === 0).slice(0, 1) : [], text: RIDER_TEXT[seed % RIDER_TEXT.length], at },
    ];
  });
}

export function hasBadWord(text: string, settings: ReviewRules): boolean {
  if (!settings.badWords.on) return false;
  const lower = text.toLowerCase();
  return settings.badWords.words.some((word) => word.trim() && lower.includes(word.trim().toLowerCase()));
}

/** Hidden or shown: an admin's last decision wins; without one, bad words hide the comment by themselves. */
export function visibility(review: Review, moderation: Record<string, Moderation[]>, settings: ReviewRules): { hidden: boolean; auto: boolean; last: Moderation | null } {
  const last = moderation[review.id]?.at(-1) ?? null;
  if (last) return { hidden: last.hidden, auto: false, last };
  const auto = hasBadWord(review.text, settings);
  return { hidden: auto, auto, last: null };
}

export type Person = { key: string; id: string | null; name: string; who: "driver" | "rider"; count: number; average: number; low: number; action: "block" | "review" | "warn" | null };

/** Average rating per driver and per rider, and what the rules say to do. */
export function people(reviews: readonly Review[], settings: (country: MarketId) => ReviewRules): Person[] {
  const map = new Map<string, { id: string | null; name: string; who: "driver" | "rider"; stars: number[]; country: MarketId }>();
  for (const review of reviews) {
    const who = review.from === "rider" ? "driver" : "rider";
    const key = `${who}:${review.aboutId ?? review.aboutName}`;
    const row = map.get(key) ?? { id: review.aboutId, name: review.aboutName, who, stars: [], country: review.country };
    row.stars.push(review.stars);
    map.set(key, row);
  }
  return [...map.entries()].map(([key, row]) => {
    const average = Math.round((row.stars.reduce((sum, value) => sum + value, 0) / row.stars.length) * 100) / 100;
    const rule = settings(row.country);
    const enough = row.stars.length >= rule.minReviews;
    const action: Person["action"] = !enough ? null : rule.block.on && average < rule.block.below ? "block" : rule.review.on && average < rule.review.below ? "review" : rule.warn.on && average < rule.warn.below ? "warn" : null;
    return { key, id: row.id, name: row.name, who: row.who, count: row.stars.length, average, low: row.stars.filter((value) => value <= 2).length, action };
  }).sort((a, b) => a.average - b.average || b.count - a.count);
}

export function rulesError(value: ReviewRules): string | null {
  for (const [name, rule] of [["Warn", value.warn], ["Review", value.review], ["Block", value.block]] as const) if (rule.below < 1 || rule.below > 5) return `${name}: the rating must be 1 to 5.`;
  if (value.warn.on && value.review.on && value.review.below > value.warn.below) return "Review must be below the warning line.";
  if (value.review.on && value.block.on && value.block.below > value.review.below) return "Block must be below the review line.";
  if (value.minReviews < 1) return "Count people with at least 1 review.";
  return null;
}

/** Live: the server's ratings (GET /admin/ratings) as reviews; the hidden flag is the server's. */
export function liveReviewsOf(records: readonly DemoRecord[]): (Review & { hidden: boolean })[] {
  return records.flatMap((record) => {
    const r = record.liveRating;
    if (!r) return [];
    const country = marketOfZone(r.zoneId)?.id ?? "SE";
    const byName = (r.from === "rider" ? r.riderName : r.driverName) ?? "";
    const aboutName = (r.from === "rider" ? r.driverName : r.riderName) ?? "";
    return [{ id: record.id, tripId: r.tripId, zone: r.zoneId, country, from: r.from, byName, aboutId: r.from === "rider" ? r.driverId : r.riderId, aboutName, stars: r.stars, tags: r.tags, text: r.comment ?? "", at: r.at, hidden: r.hidden }];
  });
}
