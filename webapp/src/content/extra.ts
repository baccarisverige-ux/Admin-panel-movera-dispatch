import type { MarketId } from "../markets/markets.ts";
import type { StudioText } from "./studio.ts";

/** More for Content: an image with how it is cut, where it shows (countries and zones), and forcing an app update. */

export const CONTENT_OPS_KEY = "contentOps";

export type Fit = "fill" | "fit";
export type SlotExtra = { image: { name: string; dataUrl: string; fit: Fit } | null; countries: MarketId[]; zones: string[]; forceUpdate: { ios: boolean; android: boolean } };
export type ContentOps = { draftRev: number; slots: Record<string, SlotExtra> };

export function emptyContentOps(): ContentOps {
  return { draftRev: 1, slots: {} };
}

export function normalizeContentOps(value: unknown): ContentOps {
  if (!value || typeof value !== "object") return emptyContentOps();
  const raw = value as Partial<ContentOps>;
  return { draftRev: typeof raw.draftRev === "number" ? raw.draftRev : 1, slots: raw.slots ?? {} };
}

export function slotExtra(ops: ContentOps, id: string): SlotExtra {
  return ops.slots[id] ?? { image: null, countries: ["SE", "FR", "TN"], zones: [], forceUpdate: { ios: false, android: false } };
}

export function setExtra(ops: ContentOps, id: string, extra: SlotExtra): ContentOps {
  return { ...ops, draftRev: ops.draftRev + 1, slots: { ...ops.slots, [id]: extra } };
}

export const PHONES: { id: string; label: string; width: number; height: number }[] = [
  { id: "small", label: "Small phone", width: 160, height: 300 },
  { id: "large", label: "Large phone", width: 190, height: 380 },
  { id: "tablet", label: "Tablet", width: 260, height: 340 },
];

const FIELDS: { key: keyof StudioText; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "sv", label: "Swedish" },
  { key: "fr", label: "French" },
  { key: "en", label: "English" },
  { key: "image", label: "Image URL" },
  { key: "expiresAt", label: "Ends" },
  { key: "riderMin", label: "Rider app minimum version" },
  { key: "riderRecommended", label: "Rider app recommended version" },
  { key: "driverMin", label: "Driver app minimum version" },
  { key: "driverRecommended", label: "Driver app recommended version" },
  { key: "reaccept", label: "Re-accept" },
];

/** What changed between two versions, field by field. */
export function compare(before: StudioText, after: StudioText): { label: string; before: string; after: string }[] {
  return FIELDS.filter((field) => String(before[field.key] ?? "") !== String(after[field.key] ?? "")).map((field) => ({ label: field.label, before: String(before[field.key] ?? "") || "(empty)", after: String(after[field.key] ?? "") || "(empty)" }));
}

export function extraError(extra: SlotExtra): string | null {
  if (!extra.countries.length) return "Show the content in at least one country.";
  if (extra.image && extra.image.dataUrl.length > 1_500_000) return "The image is too big. Use one under 1 MB.";
  return null;
}
