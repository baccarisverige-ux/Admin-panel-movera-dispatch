/**
 * "All features" in Dispatch (Q40): every setting and feature of the admin as a short phrase, with where it
 * is. One list: add a row here when a new setting is added, and it shows up in the list and its search.
 *
 * A row in Dispatch names its view or rules tab (`tab` needs a zone, so the first zone opens when none is
 * picked) and, when there is one, the card to scroll to (`card`, the card's title). A row elsewhere has a path.
 */
export type FeatureEntry = {
  id: string;
  /** The short phrase shown in the list. */
  phrase: string;
  /** The section it lives in, shown next to the phrase and searched too. */
  section: string;
  /** Extra words people may search for. */
  keywords?: string;
} & ({ dispatch: { view?: string; tab?: string; card?: string } } | { path: string });

const rules = (tab: string, card?: string) => ({ dispatch: { tab, card } });
const view = (name: string) => ({ dispatch: { view: name } });

export const FEATURE_INDEX: readonly FeatureEntry[] = [
  // Dispatch › Rules › Modes
  { id: "radar", phrase: "Radar: one request to several drivers", section: "Dispatch › Modes", keywords: "offer timer drivers", ...rules("modes", "Radar") },
  { id: "exclusive", phrase: "Exclusive: one driver at a time", section: "Dispatch › Modes", keywords: "offer seconds", ...rules("modes", "Exclusive") },
  { id: "radar-app", phrase: "Radar offers one driver sees at once", section: "Dispatch › Modes", ...rules("modes", "Radar in the driver app") },
  { id: "mode-runs", phrase: "Which mode runs, by time or how busy", section: "Dispatch › Modes", ...rules("modes", "Which mode runs") },
  { id: "offer-card", phrase: "What the driver's offer card shows", section: "Dispatch › Modes", ...rules("modes", "Offer card") },
  { id: "exclusive-reasons", phrase: "Exclusive reasons on the offer", section: "Dispatch › Modes", ...rules("modes", "Exclusive reasons") },
  { id: "whose-rules", phrase: "Whose rules across zone borders", section: "Dispatch › Modes", ...rules("modes", "Whose rules") },
  // Reservations
  { id: "reservations", phrase: "Scheduled rides (reservations) on or off", section: "Dispatch › Reservations", keywords: "book later scheduled rides reservations row", ...rules("reservations", "Reservations") },
  { id: "smart-gap", phrase: "Smart gap between reservations", section: "Dispatch › Reservations", ...rules("reservations", "Smart gap") },
  { id: "resv-running-late", phrase: "Running late to a reservation pickup", section: "Dispatch › Reservations", keywords: "eta arrival late reassign offline backup leave now", ...rules("reservations", "Running late") },
  { id: "resv-cancels", phrase: "Reservation cancels and late cancels", section: "Dispatch › Reservations", ...rules("reservations", "Cancels") },
  { id: "resv-no-driver", phrase: "No driver near pickup for a reservation", section: "Dispatch › Reservations", ...rules("reservations", "No driver near pickup") },
  { id: "resv-assign", phrase: "Movera gives a reservation to a driver", section: "Dispatch › Reservations", keywords: "assign raise fare", ...rules("reservations", "Movera gives a ride to a driver") },
  // Best driver
  { id: "best-driver", phrase: "What makes the best driver", section: "Dispatch › Best driver", keywords: "rating acceptance eta weight", ...rules("best", "What makes the best driver") },
  { id: "search-distance", phrase: "Search distance, step by step", section: "Dispatch › Best driver", keywords: "radius km", ...rules("best", "Search distance") },
  { id: "smart-waiting", phrase: "Smart waiting: match requests together", section: "Dispatch › Best driver", keywords: "batching", ...rules("best", "Smart waiting") },
  { id: "finishing", phrase: "Drivers finishing a ride get the next one", section: "Dispatch › Best driver", ...rules("best", "Drivers finishing a ride") },
  { id: "favourite", phrase: "Favourite drivers first", section: "Dispatch › Best driver", ...rules("best", "Favourite drivers") },
  // Rider waiting
  { id: "rider-waiting", phrase: "What the rider sees while waiting", section: "Dispatch › Rider waiting", ...rules("waiting", "What the rider sees while waiting") },

  // Rides & stops
  { id: "pickup-wait", phrase: "Waiting at pickup, wait fee and no-show", section: "Dispatch › Rides & stops", keywords: "free wait no show fee", ...rules("rides", "Waiting at pickup") },
  { id: "no-show-share", phrase: "Driver's share of the no-show fee, per country", section: "Dispatch › Rides & stops", keywords: "no show fee split percent 80 driver share country", ...rules("rides", "Waiting at pickup") },
  { id: "special-requests", phrase: "Special requests (pets, child seat…)", section: "Dispatch › Rides & stops", ...rules("rides", "Special requests") },
  { id: "stops", phrase: "Stops and max stops", section: "Dispatch › Rides & stops", keywords: "max stops fee per stop", ...rules("rides", "Stops") },
  { id: "pickup-move", phrase: "Pickup move after accept (metres)", section: "Dispatch › Rides & stops", keywords: "move pickup 500 m meters rebook", ...rules("rides", "Pickup move after accept") },
  { id: "driver-cancel", phrase: "Driver cancels after accepting", section: "Dispatch › Rides & stops", ...rules("rides", "Driver cancels after accepting") },
  { id: "rider-cancel-check", phrase: "Rider cancels: smart check", section: "Dispatch › Rides & stops", ...rules("rides", "Rider cancels: smart check") },
  { id: "cancel-fees", phrase: "Rider cancel fees per car type", section: "Dispatch › Rides & stops", keywords: "free cancel fee", ...rules("rides", "Rider cancel fees") },
  { id: "airport-queue", phrase: "Airport queue", section: "Dispatch › Rides & stops", ...rules("rides", "Airport queue") },
  // Drivers
  { id: "going-home", phrase: "Going home: rides towards home", section: "Dispatch › Drivers", ...rules("drivers", "Going home") },
  { id: "fairness", phrase: "Fairness between drivers", section: "Dispatch › Drivers", ...rules("drivers", "Fairness") },
  { id: "saying-no", phrase: "Saying no: declined or missed offers", section: "Dispatch › Drivers", keywords: "decline acceptance pause", ...rules("drivers", "Saying no") },
  { id: "auto-offline", phrase: "Go offline after N missed exclusive offers", section: "Dispatch › Drivers", keywords: "auto offline missed declined exclusive offers in a row", ...rules("drivers", "Go offline automatically") },
  { id: "rest", phrase: "Rest after long work", section: "Dispatch › Drivers", keywords: "driving hours", ...rules("drivers") },
  { id: "cancel-rate", phrase: "Driver cancel rate to stay under", section: "Dispatch › Drivers", ...rules("drivers") },
  // Destination & next trips
  { id: "destination", phrase: "Destination mode", section: "Dispatch › Destination & next trips", ...rules("destination", "Destination mode") },
  { id: "next-trips", phrase: "Next trips during a trip", section: "Dispatch › Destination & next trips", ...rules("destination", "Next trips during a trip") },
  // Safety and alerts
  { id: "checks", phrase: "Checks before a driver gets a request", section: "Dispatch › Safety", ...rules("safety", "Checks before a driver gets a request") },
  { id: "ride-check", phrase: "Ride check: long stop, wrong way", section: "Dispatch › Safety", ...rules("safety", "Ride check") },
  { id: "dispatch-alerts", phrase: "When the admin gets an alert", section: "Dispatch › Alerts", ...rules("alerts", "When the admin gets an alert") },
  // Dispatch views
  { id: "live", phrase: "Live: requests, drivers and assigning", section: "Dispatch › Live", ...view("live") },
  // Round 3 assign tool (Q13–Q18): opened from a waiting rider on the live map, the Trips list or a Trip page.
  { id: "assign-tool", phrase: "Assign tool: nearby drivers and direct assign", section: "Dispatch › Live", keywords: "assign rider exclusive offer nearby active drivers radius 5 7 10 km custom whole zone neighbours lock accepted", ...view("live") },
  { id: "radar-groups", phrase: "Radar groups of up to 10 drivers", section: "Dispatch › Live", keywords: "send to radar group countdown repeat again zone timer", ...view("live") },
  { id: "radar-group-timer", phrase: "Radar group timer (the zone's radar time)", section: "Dispatch › Modes", keywords: "countdown seconds radar group assign", ...rules("modes", "Radar") },
  { id: "add-money-driver", phrase: "Add money for driver (Movera pays)", section: "Dispatch › Live", keywords: "driver bonus extra money priority badge commission trip limit", ...view("live") },
  { id: "test", phrase: "Test a ride before publishing", section: "Dispatch › Test a ride", ...view("test") },
  { id: "events", phrase: "Events and driver groups", section: "Dispatch › Events & groups", ...view("events") },
  { id: "cancel-checks", phrase: "Cancel checks: decide disputed cancels", section: "Dispatch › Cancel checks", ...view("cancels") },
  { id: "cancel-reasons", phrase: "Cancel reasons for riders, drivers and admins", section: "Dispatch › Cancel reasons", ...view("reasons") },
  { id: "history", phrase: "Dispatch history, undo and approvals", section: "Dispatch › History", ...view("history") },
  { id: "my-activity", phrase: "My activity: everything I did", section: "Dispatch › My activity", keywords: "audit log done failed", ...view("activity") },
  // Elsewhere
  { id: "prices", phrase: "Prices per car type and zone", section: "Pricing", keywords: "base fare per km per min", path: "/pricing?tab=prices" },
  { id: "fees", phrase: "Zone fees: airport, reservation, cleaning", section: "Pricing", path: "/pricing?tab=fees" },
  { id: "surge", phrase: "Surge, smart surge and surge caps", section: "Pricing", path: "/pricing?tab=surge" },
  { id: "commission", phrase: "Commission per car type", section: "Pricing", path: "/pricing?tab=commission" },
  { id: "pickup-pay", phrase: "Driver pickup pay", section: "Pricing", path: "/pricing?tab=pickup" },
  { id: "waiting-per-category", phrase: "Waiting per car type: free wait and per minute", section: "Pricing", keywords: "free wait no-show wait waiting fee per min category", path: "/pricing?tab=prices" },
  { id: "tips", phrase: "Tips per country", section: "Pricing › Tips & limits", keywords: "tip amounts add deactivate", path: "/pricing?tab=extras&section=tips" },
  { id: "raise-steps", phrase: "Raise-offer quick steps per country", section: "Pricing › Tips & limits", keywords: "raise fare plus steps searching", path: "/pricing?tab=extras&section=raise-steps" },
  { id: "promo-cap", phrase: "Promo cap per country", section: "Pricing › Tips & limits", keywords: "promotion discount maximum", path: "/pricing?tab=extras&section=promo-cap" },
  { id: "driver-bonus-limit", phrase: "Driver bonus limit per country", section: "Pricing › Tips & limits", keywords: "add money to trip hard max extra", path: "/pricing?tab=extras&section=driver-bonus" },
  { id: "pricing-history", phrase: "Pricing history, undo and restore", section: "Pricing", path: "/pricing?tab=history" },
  { id: "refund-second-admin", phrase: "Refunds: when a second admin is needed", section: "Settings", keywords: "approval limit 500", path: "/settings#refunds" },
  { id: "app-features", phrase: "App features, versions and updates", section: "Settings", keywords: "wallet pin share trip", path: "/settings" },
  { id: "payment-methods", phrase: "Payment methods per country", section: "Settings", keywords: "cash card apple pay google pay wallet", path: "/settings#country-apps" },
  { id: "languages", phrase: "Default app languages per country", section: "Settings", keywords: "language english french swedish en fr sv rider driver admin", path: "/settings#country-apps" },
  { id: "payment-rules", phrase: "Payment retries, owing riders, refund limit per role", section: "Payments › Rules", path: "/payments?tab=rules" },
  { id: "payout-schedule", phrase: "Payout schedule and approval", section: "Payouts", path: "/payouts" },
  { id: "zones", phrase: "Zones, airports and zone rules", section: "Zones", path: "/zones" },
  { id: "alert-settings", phrase: "Alert settings and levels", section: "Alerts › Settings", path: "/alerts?view=settings" },
  { id: "team-limits", phrase: "Team: roles, limits and sign-in safety", section: "Team", path: "/team?tab=limits" },
  { id: "support-settings", phrase: "Support topics, answer times, ready-made replies", section: "Support › Settings", path: "/support?view=settings" },
  { id: "driver-texts", phrase: "Driver app texts", section: "Content", path: "/content" },
];

/** Rows matching every word of the search, in the phrase, the section or the keywords. */
export function searchFeatures(query: string, list: readonly FeatureEntry[] = FEATURE_INDEX): FeatureEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((entry) => {
    const text = `${entry.phrase} ${entry.section} ${entry.keywords ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Where a row goes: a Dispatch search string, or a path elsewhere. */
export function featureTarget(entry: FeatureEntry, zoneId: string): string {
  if ("path" in entry) return entry.path;
  const params = new URLSearchParams();
  if (entry.dispatch.view) params.set("view", entry.dispatch.view);
  if (entry.dispatch.tab) {
    if (entry.dispatch.tab !== "modes") params.set("tab", entry.dispatch.tab);
    if (zoneId) params.set("zone", zoneId);
  }
  if (entry.dispatch.card) params.set("card", entry.dispatch.card);
  const search = params.toString();
  return `/dispatch${search ? `?${search}` : ""}`;
}
