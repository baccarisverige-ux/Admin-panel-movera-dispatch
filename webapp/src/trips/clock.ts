import { liveCreatedAt } from "../live/realData.ts";

/** When a demo trip started, from its id. Kept apart so the demo seed can use it without the rest of the trip code. */

export function tripIndex(id: string): number {
  const value = Number(id.replace(/\D/g, ""));
  return Number.isFinite(value) ? Math.max(0, value - 1) : 0;
}

export function startedAt(id: string): string {
  // Live build: when the server created the trip.
  const live = liveCreatedAt(id);
  if (live) return live;
  const index = tripIndex(id);
  const day = index % 14;
  const date = new Date(Date.UTC(2026, 9, 5, 6 + (index % 12), index % 60, 0));
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString();
}

/** Each step of a trip's timeline comes this long after the one before. */
export const STEP_MS = 90_000;
