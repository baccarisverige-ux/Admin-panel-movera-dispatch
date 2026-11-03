/**
 * How much of each demo section reads the Movera server in a live build. "not" and "partly" pages show a small
 * "Not connected yet" marker; "partly" names, in its title, what already comes from the server.
 */
export type Connection = { state: "connected" | "partly" | "not"; what?: string };

const PARTLY: Record<string, string> = {
  reports: "Trips from the server; the rest is not connected yet.",
  trips: "Trips, trip page, offers, chat, ride check, flag, notes, cases, trip actions, refunds (full and part), driver pay changes and receipts come from the server.",
  live: "Drivers and trips from the server; positions are not connected yet.",
  pricing: "Prices, fees, surge settings, commission and pickup pay of each zone and each country's Standard, and Tips & limits, from the server; manual surges and undo are not connected yet.",
  settings: "Feature switches and app updates go to the apps at once; scheduled publish, expiry and overrides are not connected yet.",
  offers: "Trips and their offers from the server; sending offers is not connected yet.",
  incidents: "SOS and car-lost cases with Take, Solve and False alarm from the server; contact log, levels and calls are not connected yet.",
  alerts: "SOS and car-lost alerts from the server; the other alerts are not connected yet.",
  zones: "Zones, outlines, names and open or closed from the server; traffic on the map, rules and pickup points are not connected yet.",
};

/**
 * Pages that read and write the server for what they show (owner G2 R10, 2026-10-30: no "Not connected yet" badge
 * where the page is live): drivers, onboarding (documents reviewed live), fleet owners and vehicles; content (owner G2c:
 * slots, history and restore come from the server).
 */
// Owner G3-R5 (2026-10-30): the Dashboard shows only the server's data on live (no demo parts), so no badge either.
// Driver 03c (live test 2026-10-30): Dispatch is live too (trips, drivers, rules, Standard, controls, assign and radar
// group go to the server), so its header carries no badge either.
// G9 live 2026-11-02: the Chat page reads and writes the trip chats on the server, so no badge.
// Live clean-up 1 (owner 2026-11-02, audit bug 6): the live build hides every button the server does not handle
// (live/liveCommands.ts) and shows no demo book, so what is left on these pages is the server's: no header badge. A part
// that is really not connected carries its own small marker (live/NotConnected.tsx).
const CONNECTED = new Set([
  "drivers", "fleets", "vehicles", "onboarding", "content", "dashboard", "dispatch", "chat",
  "alerts", "trips", "incidents", "risk", "riders", "waitlist", "payments", "payouts", "zones", "pricing", "support",
  "reviews", "audit", "settings", "errors", "team",
  // v0.18.17 Book later: Reservations reads the server (live test LOW 14).
  "reservations",
]);

export function connectionOf(id: string): Connection {
  if (CONNECTED.has(id)) return { state: "connected" };
  const what = PARTLY[id];
  return what ? { state: "partly", what } : { state: "not" };
}
