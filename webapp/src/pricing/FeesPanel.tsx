import { Plus, Route, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { countrySettingsOf } from "../config/countrySettings";
import { useCountrySettings } from "../config/useCountrySettings";
import type { MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { currencySymbol, feeMax, inputStep, money, roundingOptions, routeMax, type CategoryDef, type FixedRoute, type Problem, type ZoneBook, type ZoneFees } from "./zonePricing";
import { tr, trn, trx } from "../i18n";

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
  { key: "airportPickup", get label() { return tr("Airport pickup fee"); }, get hint() { return tr("Added when the ride starts at an airport"); } },
  { key: "airportDropoff", get label() { return tr("Airport drop-off fee"); }, get hint() { return tr("Added when the ride ends at an airport"); } },
  { key: "reservationFee", get label() { return tr("Reservation fee"); }, get hint() { return tr("Added to rides booked ahead"); } },
  { key: "cleaningFee", get label() { return tr("Cleaning or damage fee"); }, get hint() { return tr("Added by an admin after a ride, with a reason"); } },
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
            <strong>{trx(row.label)}</strong>
            <small>{trx(row.hint)}</small>
          </div>
          <NumberField label={trx(row.label)} value={book.fees[row.key]} unit={symbol} step={inputStep(currency)} max={feeMax(row.key, currency)} disabled={!canEdit} changed={book.fees[row.key] !== published.fees[row.key]} invalid={bad.has(`fees.${row.key}`)} onChange={(value) => onChange({ [row.key]: value })} />
          {row.key.startsWith("airport") && !airport && book.fees[row.key] > 0 ? <small className="fee-note">{trn("{0} is not an airport zone, so this only applies to rides to or from an airport.", zoneName)}</small> : null}
        </div>
      ))}
      <div className="fee-card">
        <div>
          <strong>{tr("Tolls and congestion tax")}</strong>
          <small>{tr("Passed on to the rider at cost, shown on the receipt")}</small>
        </div>
        <label className="mini-switch big">
          <input type="checkbox" aria-label={tr("Add tolls to the fare")} checked={book.fees.tollsPassThrough} disabled={!canEdit} onChange={(event) => onChange({ tollsPassThrough: event.target.checked })} />
          <span aria-hidden="true"><i /></span>
          {book.fees.tollsPassThrough ? tr("Added to fare") : tr("Not added")}
        </label>
      </div>
      <div className="fee-card" data-testid="fees-tips-moved">
        <div>
          <strong>{tr("Tips")}</strong>
          <small>{tr("One list for all of the country, in Tips & limits")}</small>
        </div>
        <div className="tip-preview">{tips.filter((tip) => tip.enabled).map((tip) => <span key={tip.id}>{money(tip.amount, currency)}</span>)}</div>
        <Link className="link-action" to={`/pricing?tab=extras&section=tips&zone=${encodeURIComponent(book.zoneId)}`}>{tr("Edit in Tips & limits")}</Link>
      </div>
      <div className="fee-card">
        <div>
          <strong>{tr("Rounding")}</strong>
          <small>{tr("Final price is rounded to this step")}</small>
        </div>
        <select aria-label={tr("Rounding")} value={book.fees.rounding} disabled={!canEdit} onChange={(event) => onChange({ rounding: Number(event.target.value) })}>
          {roundingOptions(currency).map((step) => <option key={step} value={step}>{step < 0.05 ? tr("No rounding") : tr("Nearest {0}", [money(step, currency)])}</option>)}
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
      {routes.length === 0 ? <p className="state-line">{tr("No fixed-price route in this zone. Riders pay by km and min.")}</p> : (
        <ul className="route-list">
          {routes.map((route) => (
            <li key={route.id} className={bad.has(`routes.${route.id}`) ? "invalid" : undefined}>
              <Route size={16} aria-hidden="true" />
              <input aria-label={tr("Route from")} placeholder={tr("From, e.g. Arlanda")} value={route.from} disabled={!canEdit} onChange={(event) => patch(route.id, { from: event.target.value })} />
              <span aria-hidden="true">→</span>
              <input aria-label={tr("Route to")} placeholder={tr("To, e.g. City")} value={route.to} disabled={!canEdit} onChange={(event) => patch(route.id, { to: event.target.value })} />
              <select aria-label={tr("Route category")} value={route.categoryId} disabled={!canEdit} onChange={(event) => patch(route.id, { categoryId: event.target.value })}>
                {categories.map((category) => <option key={category.id} value={category.id}>{trx(category.label)}</option>)}
              </select>
              <NumberField label={tr("Route price")} value={route.price} unit={currencySymbol(currency)} step={inputStep(currency)} max={routeMax(currency)} disabled={!canEdit} onChange={(value) => patch(route.id, { price: value })} />
              <button data-command="admin.pricing.edit" type="button" className="icon-ghost" aria-label={tr("Remove route {0} to {1}", [route.from, route.to])} disabled={!canEdit} onClick={() => onChange(routes.filter((item) => item.id !== route.id))}><Trash2 size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => onChange([...routes, { id: `${zoneId}-route-${routes.length + 1}-${Date.now() % 100000}`, from: "", to: "", categoryId: categories[0]?.id ?? "economy", price: 0 }])}>{trn("{0} Add fixed route", <Plus size={14} aria-hidden="true" />)}</button>
    </div>
  );
}
