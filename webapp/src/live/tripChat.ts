import type { Page } from "./types.ts";
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
