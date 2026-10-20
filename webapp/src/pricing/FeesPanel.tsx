import { Plus, Route, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { countrySettingsOf } from "../config/countrySettings";
import { useCountrySettings } from "../config/useCountrySettings";
import type { MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { currencySymbol, feeMax, inputStep, money, roundingOptions, routeMax, type CategoryDef, type FixedRoute, type Problem, type ZoneBook, type ZoneFees } from "./zonePricing";

type FeesProps = {
  zoneName: string;
  airport: boolean;
  currency: MarketId;
  book: ZoneBook;
  published: ZoneBook;
  problems: Problem[];
  canEdit: boolean;
  onChange: (patch: Partial<ZoneFees>) => void;
};

const FEE_ROWS: { key: "airportPickup" | "airportDropoff" | "reservationFee" | "cleaningFee"; label: string; hint: string }[] = [
  { key: "airportPickup", label: "Airport pickup fee", hint: "Added when the ride starts at an airport" },
  { key: "airportDropoff", label: "Airport drop-off fee", hint: "Added when the ride ends at an airport" },
  { key: "reservationFee", label: "Reservation fee", hint: "Added to rides booked ahead" },
  { key: "cleaningFee", label: "Cleaning or damage fee", hint: "Added by an admin after a ride, with a reason" },
];

/** Zone fees that apply to every category. */
export function FeesPanel({ zoneName, airport, currency, book, published, problems, canEdit, onChange }: FeesProps) {
  const symbol = currencySymbol(currency);
  const bad = new Set(problems.map((problem) => problem.path));
  // Q5/Q6: tips are one list per country (Pricing › Tips & limits); the zone's old tip presets are no longer used.
  const tips = countrySettingsOf(useCountrySettings().book, currency).tips;
  return (
    <div className="fee-grid">
      {FEE_ROWS.map((row) => (
        <div key={row.key} className="fee-card">
          <div>
            <strong>{row.label}</strong>
            <small>{row.hint}</small>
          </div>
          <NumberField label={row.label} value={book.fees[row.key]} unit={symbol} step={inputStep(currency)} max={feeMax(row.key, currency)} disabled={!canEdit} changed={book.fees[row.key] !== published.fees[row.key]} invalid={bad.has(`fees.${row.key}`)} onChange={(value) => onChange({ [row.key]: value })} />
          {row.key.startsWith("airport") && !airport && book.fees[row.key] > 0 ? <small className="fee-note">{zoneName} is not an airport zone, so this only applies to rides to or from an airport.</small> : null}
        </div>
      ))}
      <div className="fee-card">
        <div>
          <strong>Tolls and congestion tax</strong>
          <small>Passed on to the rider at cost, shown on the receipt</small>
        </div>
        <label className="mini-switch big">
          <input type="checkbox" aria-label="Add tolls to the fare" checked={book.fees.tollsPassThrough} disabled={!canEdit} onChange={(event) => onChange({ tollsPassThrough: event.target.checked })} />
          <span aria-hidden="true"><i /></span>
          {book.fees.tollsPassThrough ? "Added to fare" : "Not added"}
        </label>
      </div>
      <div className="fee-card" data-testid="fees-tips-moved">
        <div>
          <strong>Tips</strong>
          <small>One list for all of the country, in Tips &amp; limits</small>
        </div>
        <div className="tip-preview">{tips.filter((tip) => tip.enabled).map((tip) => <span key={tip.id}>{money(tip.amount, currency)}</span>)}</div>
        <Link className="link-action" to={`/pricing?tab=extras&section=tips&zone=${encodeURIComponent(book.zoneId)}`}>Edit in Tips &amp; limits</Link>
      </div>
      <div className="fee-card">
        <div>
          <strong>Rounding</strong>
          <small>Final price is rounded to this step</small>
        </div>
        <select aria-label="Rounding" value={book.fees.rounding} disabled={!canEdit} onChange={(event) => onChange({ rounding: Number(event.target.value) })}>
          {roundingOptions(currency).map((step) => <option key={step} value={step}>{step < 0.05 ? "No rounding" : `Nearest ${money(step, currency)}`}</option>)}
        </select>
      </div>
    </div>
  );
}

type RoutesProps = {
  currency: MarketId;
  categories: CategoryDef[];
  routes: FixedRoute[];
  problems: Problem[];
  canEdit: boolean;
  zoneId: string;
  onChange: (routes: FixedRoute[]) => void;
};

/** Flat prices for a known trip, like the airport to the city centre. */
export function FixedRoutes({ currency, categories, routes, problems, canEdit, zoneId, onChange }: RoutesProps) {
  const bad = new Set(problems.map((problem) => problem.path));
  const patch = (id: string, change: Partial<FixedRoute>) => onChange(routes.map((route) => (route.id === id ? { ...route, ...change } : route)));
  return (
    <div className="routes">
      {routes.length === 0 ? <p className="state-line">No fixed-price route in this zone. Riders pay by km and min.</p> : (
        <ul className="route-list">
          {routes.map((route) => (
            <li key={route.id} className={bad.has(`routes.${route.id}`) ? "invalid" : undefined}>
              <Route size={16} aria-hidden="true" />
              <input aria-label="Route from" placeholder="From, e.g. Arlanda" value={route.from} disabled={!canEdit} onChange={(event) => patch(route.id, { from: event.target.value })} />
              <span aria-hidden="true">→</span>
              <input aria-label="Route to" placeholder="To, e.g. City" value={route.to} disabled={!canEdit} onChange={(event) => patch(route.id, { to: event.target.value })} />
              <select aria-label="Route category" value={route.categoryId} disabled={!canEdit} onChange={(event) => patch(route.id, { categoryId: event.target.value })}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
              <NumberField label="Route price" value={route.price} unit={currencySymbol(currency)} step={inputStep(currency)} max={routeMax(currency)} disabled={!canEdit} onChange={(value) => patch(route.id, { price: value })} />
              <button data-command="admin.pricing.edit" type="button" className="icon-ghost" aria-label={`Remove route ${route.from} to ${route.to}`} disabled={!canEdit} onClick={() => onChange(routes.filter((item) => item.id !== route.id))}><Trash2 size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => onChange([...routes, { id: `${zoneId}-route-${routes.length + 1}-${Date.now() % 100000}`, from: "", to: "", categoryId: categories[0]?.id ?? "economy", price: 0 }])}>
        <Plus size={14} aria-hidden="true" /> Add fixed route
      </button>
    </div>
  );
}
