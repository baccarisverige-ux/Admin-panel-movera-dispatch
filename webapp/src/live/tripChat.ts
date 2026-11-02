import type { Page } from "./types.ts";
import { tr } from "../i18n/index.ts";
import { shortId } from "./format.ts";
import type { TripMessage } from "./LiveChat.tsx";

/** At most this many pages of 200 messages are read for one trip (a trip chat is short; 90 days kept). */
const MAX_PAGES = 5;

/** The trip's messages, oldest first, every page (GET /trips/{tripId}/messages, support.reply). */
export async function readTripMessages(read: (path: string) => Promise<Page<TripMessage>>, tripId: string): Promise<TripMessage[]> {
  const items: TripMessage[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer: Page<TripMessage> = await read(`/trips/${encodeURIComponent(tripId)}/messages?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    items.push(...answer.items);
    cursor = answer.nextCursor;
    if (!cursor) break;
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * G9 live 2026-11-02: how a trip chat is named on the Chat page — the rider's and the driver's first names
 * ("Anna – Omar"), with a short trip reference for support; never the raw trip id as the title.
 */
export function chatTripLabel(trip: { tripId: string; rider?: { firstName?: string }; driver?: { firstName?: string } | null }): { title: string; ref: string } {
  const rider = trip.rider?.firstName?.trim() || tr("Rider");
  const driver = trip.driver?.firstName?.trim() || tr("Driver");
  return { title: `${rider} – ${driver}`, ref: shortId(trip.tripId) };
}
