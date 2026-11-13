/**
 * S5 J4a (contract v0.18.82, contract.json#moneyBase.versionGuard; owner Sitting 3 item 106 "refuse a second click"):
 * the admin's money buttons send the version the page shows and send one request at a time.
 */
type Money = { amountMinor: number; currency: string };

/** POST /admin/trips/{tripId}/driver-pay body: the trip version the admin last saw (a stale one gets 409). */
export function driverPayBody(trip: { version: number }, amountMinor: number, currency: string, reason: string): { expectedVersion: number; change: Money; reason: string } {
  return { expectedVersion: trip.version, change: { amountMinor, currency }, reason: reason.trim() };
}

/**
 * S5 J6a (contract v0.18.82, contract.json#moneyBase.adminFare; owner Q-M7 "If admin increase fare it's only for the
 * driver side !! The rider pay same amount when booked", Q-S5-8 "Admin types driver pay"): POST /admin/trips/{tripId}/adjust
 * with the driver's new pay (driverTotal without the tip). Never the old `fare`: the server refuses it (fare_is_driver_pay).
 */
export function driverPayAdjustBody(trip: { version: number; fare: { currency: string } }, driverPayMinor: number, reason: string): { expectedVersion: number; driverPay: Money; reason: string } {
  return { expectedVersion: trip.version, driverPay: { amountMinor: driverPayMinor, currency: trip.fare.currency }, reason: reason.trim() };
}

/**
 * One request at a time: while `work` runs, a second call does nothing (a double click before React re-renders the
 * disabled button sends no second request). `busy()` says whether one is running.
 */
export function singleFlight() {
  let running = false;
  const run = async (work: () => Promise<void>): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await work();
    } finally {
      running = false;
    }
  };
  run.busy = () => running;
  return run;
}
