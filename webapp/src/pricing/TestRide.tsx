import { useState } from "react";
import { Calculator, X } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { SurgeSlider } from "./SurgeSlider";
import { useEscape } from "../ui/useEscape";
import { money, quoteRide, type CategoryDef, type QuoteInput, type ZoneBook } from "./zonePricing";

type Props = {
  zoneName: string;
  currency: MarketId;
  categories: CategoryDef[];
  book: ZoneBook;
  liveSurge: number;
  draft: boolean;
  onClose: () => void;
};

/** Price preview with the current draft, so changes can be checked before they go live. */
export function TestRide({ zoneName, currency, categories, book, liveSurge, draft, onClose }: Props) {
  const enabled = categories.filter((category) => book.prices[category.id]?.enabled);
  const [input, setInput] = useState<QuoteInput>({
    categoryId: enabled[0]?.id ?? "economy", km: 8, minutes: 18, waitMin: 0, stops: 0, stopWaitMin: 0, babySeats: 0, childSeats: 0,
    airportPickup: false, airportDropoff: false, reservation: false, surge: liveSurge, fixedRouteId: null,
  });
  useEscape(onClose);
  const set = (patch: Partial<QuoteInput>) => setInput((current) => ({ ...current, ...patch }));
  const quote = quoteRide(book, input);
  const routes = book.routes.filter((route) => route.categoryId === input.categoryId);
  return (
    <aside className="test-ride" role="dialog" aria-label="Test a ride" data-testid="quote-preview">
      <div className="test-ride-head">
        <span className="test-ride-icon"><Calculator size={18} aria-hidden="true" /></span>
        <div>
          <strong>Test a ride</strong>
          <small>{zoneName} · {draft ? "with your unpublished changes" : "published prices"}</small>
        </div>
        <button data-command="admin.pricing.testRide" type="button" className="icon-ghost" aria-label="Close test a ride" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="test-ride-body">
        <label className="field">
          Category
          <select aria-label="Quote category" value={input.categoryId} onChange={(event) => set({ categoryId: event.target.value, fixedRouteId: null })}>
            {categories.map((category) => <option key={category.id} value={category.id} disabled={!book.prices[category.id]?.enabled}>{category.label}{book.prices[category.id]?.enabled ? "" : " (off)"}</option>)}
          </select>
        </label>
        {routes.length ? (
          <label className="field">
            Fixed route
            <select aria-label="Quote fixed route" value={input.fixedRouteId ?? ""} onChange={(event) => set({ fixedRouteId: event.target.value || null })}>
              <option value="">By km and min</option>
              {routes.map((route) => <option key={route.id} value={route.id}>{route.from} → {route.to}</option>)}
            </select>
          </label>
        ) : null}
        <div className="test-ride-grid">
          <label className="field">Distance<NumberField label="Quote km" value={input.km} unit="km" onChange={(km) => set({ km })} /></label>
          <label className="field">Time<NumberField label="Quote minutes" value={input.minutes} unit="min" onChange={(minutes) => set({ minutes })} /></label>
          <label className="field">Waiting at pickup<NumberField label="Quote waiting minutes" value={input.waitMin} unit="min" onChange={(waitMin) => set({ waitMin })} /></label>
          <label className="field">Extra stops<NumberField label="Quote stops" value={input.stops} max={5} onChange={(stops) => set({ stops: Math.round(stops) })} /></label>
          <label className="field">Waiting at stops<NumberField label="Quote stop waiting" value={input.stopWaitMin} unit="min" onChange={(stopWaitMin) => set({ stopWaitMin })} /></label>
          <label className="field">Baby seats<NumberField label="Quote baby seats" value={input.babySeats} max={3} onChange={(babySeats) => set({ babySeats: Math.round(babySeats) })} /></label>
          <label className="field">Child seats<NumberField label="Quote child seats" value={input.childSeats} max={3} onChange={(childSeats) => set({ childSeats: Math.round(childSeats) })} /></label>
        </div>
        <div className="check-chips">
          {([["airportPickup", "Airport pickup"], ["airportDropoff", "Airport drop-off"], ["reservation", "Reservation"]] as const).map(([key, label]) => (
            <label key={key} className={input[key] ? "check-chip on" : "check-chip"}>
              <input type="checkbox" aria-label={`Quote ${label}`} checked={input[key]} onChange={(event) => set({ [key]: event.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <SurgeSlider compact label="Quote surge" value={input.surge} onChange={(surge) => set({ surge })} />
      </div>
      {quote.error ? <p className="state-line">{quote.error}</p> : (
        <div className="receipt">
          <ul data-testid="quote-lines">
            {quote.lines.map((line, index) => (
              <li key={`${line.label}-${index}`} className={`r-${line.kind}`}>
                <span>{line.label}</span>
                <b>{money(line.amount, currency)}</b>
              </li>
            ))}
          </ul>
          <div className="receipt-total">
            <span>Rider pays</span>
            <strong data-testid="quote-total">{money(quote.total, currency)}</strong>
          </div>
          <div className="receipt-split">
            <span><i className="driver" />Driver {money(quote.driverGets, currency)}</span>
            <span><i className="movera" />Movera {money(quote.moveraGets, currency)}</span>
          </div>
          <small>VAT included. Tips are not part of the price.</small>
        </div>
      )}
    </aside>
  );
}
