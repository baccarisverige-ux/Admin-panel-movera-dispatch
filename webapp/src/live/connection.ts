/**
 * How much of each demo section reads the Movera server in a live build. "not" and "partly" pages show a small
 * "Not connected yet" marker; "partly" names, in its title, what already comes from the server.
 */
export type Connection = { state: "connected" | "partly" | "not"; what?: string };

const PARTLY: Record<string, string> = {
  dashboard: "Drivers and trips from the server; the rest is not connected yet.",
  reports: "Trips from the server; the rest is not connected yet.",
  trips: "Trips, trip page, offers and full refund from the server; chat, ride check and other actions are not connected yet.",
  live: "Drivers and trips from the server; positions are not connected yet.",
  dispatch: "Trips and drivers from the server; dispatch actions are not connected yet.",
  offers: "Trips and their offers from the server; sending offers is not connected yet.",
  drivers: "Drivers and their account status from the server; documents, notes and bonuses are not connected yet.",
  fleets: "Fleet companies and owners from the server; owner documents and notes are not connected yet.",
  vehicles: "Vehicles and their review from the server; photos and rules are not connected yet.",
  onboarding: "Drivers and their account status from the server; document review is not connected yet.",
};

export function connectionOf(id: string): Connection {
  const what = PARTLY[id];
  return what ? { state: "partly", what } : { state: "not" };
}
