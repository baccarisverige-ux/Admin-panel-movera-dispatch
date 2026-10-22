import { useSlice, useTrips } from "../api/hooks";
import { useTripOffers } from "../dispatch/DriverBonusBox";
import { DISPATCH_KEY, emptyDispatchBook, liveRules, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { tr, trn } from "../i18n";
import { formatMoney, market } from "../markets/markets";
import { offerGetsPickupPay, pickupPayFor } from "../pricing/pickupPay";
import { emptyPricingStore, normalizeStore, zoneBook, SLICE_KEY as PRICING_KEY } from "../pricing/zonePricing";
import { categoryOf } from "../trips/present";
import { countryOf, moneySplit } from "../trips/file";
import { tripMoney } from "./tripMoney";

const SPEED_KMH = 26;

/**
 * The Money tab of the driver pop-up: one ride's split. Rider pays, driver gets (fare share, pickup pay,
 * added money; tips apart) and what Movera keeps, or covers in red. Same numbers as the Trip page.
 */
export function TripMoneyTab({ tripId, zoneId, pickupKm, hasFleet }: { tripId: string; zoneId: string; pickupKm: number | null; hasFleet: boolean }) {
  const trips = useTrips(null);
  const pricing = useSlice<unknown>(PRICING_KEY, emptyPricingStore());
  const dispatch = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook());
  const real = !tripId.startsWith("T-");
  const offers = useTripOffers(tripId, real);
  const trip = real ? (trips.data ?? []).find((row) => row.id === tripId) ?? null : null;
  if (!real || !trip) {
    return <p className="trip-none" data-testid="trip-money-unknown">{tr("No trip record for this ride yet, so the split is not known. The fare on the Trip tab is an estimate.")}</p>;
  }
  const country = countryOf(trip.zoneId || zoneId);
  const minor = market(country).minorUnits;
  const book = zoneBook(normalizeStore(pricing.value), trip.zoneId || zoneId);
  const split = moneySplit(trip, book, hasFleet, [], liveRules(normalizeDispatchBook(dispatch.value), trip.zoneId || zoneId).riderCancel.fees, offers.data?.bonusMinor ?? 0);
  const category = categoryOf(trip.id).id;
  const paid = pickupKm !== null && offerGetsPickupPay(book.pickupPay, "radar", category);
  const pickup = paid ? Math.round(pickupPayFor(book.pickupPay.rates[category], pickupKm, (pickupKm / SPEED_KMH) * 60).total * minor) : null;
  const money = tripMoney(split, pickup);
  const fmt = (value: number) => formatMoney(value, country);
  return (
    <div className="trip-money" data-testid="trip-money">
      <dl className="trip-money-lines">
        <div className="lead"><dt>{tr("Rider pays")}</dt><dd>{fmt(money.riderPays)}</dd></div>
        <div className="lead"><dt>{tr("Driver gets")}</dt><dd>{fmt(money.driverGets)}</dd></div>
        <div className="sub"><dt>{tr("Share of the fare")}</dt><dd>{fmt(money.fareShare)}</dd></div>
        <div className="sub"><dt>{tr("Pickup pay")}</dt><dd>{pickup === null ? "—" : fmt(money.pickupPay)}</dd></div>
        <div className="sub"><dt>{tr("Added money")}</dt><dd>{fmt(money.addedMoney)}</dd></div>
        {money.tip ? <div className="sub"><dt>{tr("Tip (apart)")}</dt><dd>{fmt(money.tip)}</dd></div> : null}
        {money.fleet ? <div className="sub"><dt>{tr("Fleet owner's share")}</dt><dd>{fmt(money.fleet)}</dd></div> : null}
        <div className={money.covers ? "lead covers" : "lead keeps"} data-testid="trip-money-movera">
          <dt>{money.covers ? tr("Movera covers") : tr("Movera keeps")}</dt>
          <dd>{fmt(Math.abs(money.moveraKeeps))}</dd>
        </div>
      </dl>
      <p className="fine-print">
        {money.estimate ? tr("Estimate until the ride ends.") : null}{" "}
        {pickup === null ? tr("Pickup pay is not known for this ride.") : trn("Pickup pay from about {0} km to the pickup, paid by Movera.", (pickupKm ?? 0).toFixed(1))}
      </p>
    </div>
  );
}
