import { useState } from "react";
import { Copy, Info, Layers, Plus, Route, Trash2, UserRound, Wallet } from "lucide-react";
import { market, type MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { PICKUP_OFFERS, addPickupRange, cheaperFartherRanges, maxReachedAtKm, pickupPayFor, pickupSplit, rangeLabel, removePickupRange, riderPickupFee, updatePickupRange, type PickupPay, type PickupRange, type PickupRate } from "./pickupPay";
import { currencySymbol, fromSek, inputStep, money, quoteRide, type CategoryDef, type Problem, type ZoneBook } from "./zonePricing";
import { tr, trn, trx } from "../i18n";

type Props = {
  zoneName: string;
  currency: MarketId;
  categories: CategoryDef[];
  book: ZoneBook;
  published: ZoneBook;
  problems: Problem[];
  canEdit: boolean;
  onChange: (pay: PickupPay) => void;
  onUseInAllZones: () => void;
  onCopy: () => void;
};

/** The sample ride the worked example uses for the rider's price and the driver's share. */
const SAMPLE_TRIP = { km: 8, minutes: 18 };

/** The maximum per ride a category starts with when its switch is turned on, in kronor. */
const DEFAULT_MAX_SEK = 100;

function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="mini-switch big">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true"><i /></span>
    </label>
  );
}

type RangesProps = {
  categoryLabel: string;
  rate: PickupRate;
  old: PickupRate | undefined;
  symbol: string;
  step: number;
  locked: boolean;
  bad: Set<string>;
  pathPrefix: string;
  onChange: (ranges: PickupRange[]) => void;
};

/**
 * A category's pickup-distance ranges: from (read-only, follows the range before), to or "and above", per km,
 * per minute. There is always at least one; 0 rates make a range free.
 */
function PickupRanges({ categoryLabel, rate, old, symbol, step, locked, bad, pathPrefix, onChange }: RangesProps) {
  const ranges = rate.ranges;
  const cheaper = new Set(cheaperFartherRanges(ranges));
  return (
    <div className="pp-ranges" role="group" aria-label={tr("{0} pickup ranges", [categoryLabel])}>
      <div className="pp-range head" aria-hidden="true">
        <span>{tr("From")}</span><span>{tr("To")}</span><span>{tr("Per km")}</span><span>{tr("Per minute")}</span><span />
      </div>
      {ranges.map((range, index) => {
        const was = old?.ranges?.[index];
        const last = index === ranges.length - 1;
        const at = `${pathPrefix}.ranges.${index}`;
        const name = `${categoryLabel} range ${index + 1}`;
        const free = range.krPerKm === 0 && range.krPerMinute === 0;
        return (
          <div key={index} className={cheaper.has(index) ? "pp-range cheaper" : "pp-range"} data-testid={`${pathPrefix}-range-${index}`}>
            <span className={bad.has(`${at}.fromKm`) ? "pp-range-from invalid" : "pp-range-from"} aria-label={tr("{0} from", [name])}>{trn("{0} km", range.fromKm > 0 ? `> ${range.fromKm}` : "0")}</span>
            <span className="pp-range-to">
              {range.toKm === null ? (
                <span className="pp-range-open">{tr("and above")}</span>
              ) : (
                <NumberField label={tr("{0} to km", [name])} value={range.toKm} unit="km" step={0.1} disabled={locked} changed={range.toKm !== was?.toKm} invalid={bad.has(`${at}.toKm`)} onChange={(toKm) => onChange(updatePickupRange(ranges, index, { toKm }))} />
              )}
              {last ? (
                <label className="pp-range-above">{trn("{0}and above", <input type="checkbox" aria-label={tr("{0} and above", [name])} checked={range.toKm === null} disabled={locked} onChange={(event) => onChange(updatePickupRange(ranges, index, { toKm: event.target.checked ? null : range.fromKm + 10 }))} />)}</label>
              ) : null}
            </span>
            <NumberField className="pp-unit" label={tr("{0} per km", [name])} value={range.krPerKm} unit={`${symbol}/km`} step={step} disabled={locked} changed={range.krPerKm !== was?.krPerKm} invalid={bad.has(`${at}.krPerKm`)} onChange={(krPerKm) => onChange(updatePickupRange(ranges, index, { krPerKm }))} />
            <NumberField className="pp-unit" label={tr("{0} per minute", [name])} value={range.krPerMinute} unit={`${symbol}/min`} step={step} disabled={locked} changed={range.krPerMinute !== was?.krPerMinute} invalid={bad.has(`${at}.krPerMinute`)} onChange={(krPerMinute) => onChange(updatePickupRange(ranges, index, { krPerMinute }))} />
            <span className="pp-range-end">
              {free ? <span className="pp-free-tag">{tr("Free")}</span> : null}
              <button data-command="admin.pricing.edit" type="button" className="icon-ghost danger" aria-label={tr("Delete {0} ({1})", [name, rangeLabel(range)])} disabled={locked || ranges.length <= 1} title={ranges.length <= 1 ? tr("A category keeps at least one range.") : undefined} onClick={() => onChange(removePickupRange(ranges, index))}><Trash2 size={14} aria-hidden="true" /></button>
            </span>
          </div>
        );
      })}
      <div className="pp-ranges-foot">
        <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" disabled={locked} onClick={() => onChange(addPickupRange(rate))}>{trn("{0} Add range", <Plus size={14} aria-hidden="true" />)}</button>
        {cheaper.size ? <small className="pp-cheaper-note">{trn("{0} A farther range pays less per km than the one before it. Allowed, but check it is what you want.", <Info size={13} aria-hidden="true" />)}</small> : null}
      </div>
    </div>
  );
}

/** Driver pickup pay (paid by Movera, tiered ranges and a maximum) and the rider's fixed pickup fee, for one zone. */
export function PickupPayPanel({ zoneName, currency, categories, book, published, problems, canEdit, onChange, onUseInAllZones, onCopy }: Props) {
  const pay = book.pickupPay;
  const before = published.pickupPay;
  const bad = new Set(problems.map((problem) => problem.path));
  const symbol = currencySymbol(currency);
  const step = inputStep(currency);
  const locale = market(currency).locale;
  const num = (value: number, digits = 2) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const short = (value: number) => String(Number(value.toFixed(2)));

  const firstOn = categories.find((category) => category.id === "comfort" && pay.rates.comfort?.enabled) ?? categories.find((category) => pay.rates[category.id]?.enabled) ?? categories[0];
  const [exampleId, setExampleId] = useState(firstOn?.id ?? "comfort");
  const [exampleKm, setExampleKm] = useState(4.2);
  const [exampleMin, setExampleMin] = useState(9);
  const [exampleReservation, setExampleReservation] = useState(false);

  const setRate = (categoryId: string, patch: Partial<PickupRate>) => onChange({ ...pay, rates: { ...pay.rates, [categoryId]: { ...pay.rates[categoryId], ...patch } } });
  const setFee = (categoryId: string, side: "live" | "reservation", patch: Partial<PickupRate["riderFee"]["live"]>) => {
    const own = pay.rates[categoryId];
    setRate(categoryId, { riderFee: { ...own.riderFee, [side]: { ...own.riderFee[side], ...patch } } });
  };

  const exampleCategory = categories.find((category) => category.id === exampleId) ?? firstOn;
  const rate = exampleCategory ? pay.rates[exampleCategory.id] : undefined;
  const pickup = pickupPayFor(rate, exampleKm, exampleMin);
  const maxFromKm = maxReachedAtKm(rate, exampleKm > 0 ? exampleMin / exampleKm : 0);
  const quote = exampleCategory ? quoteRide(book, { categoryId: exampleCategory.id, ...SAMPLE_TRIP, waitMin: 0, stops: 0, stopWaitMin: 0, babySeats: 0, childSeats: 0, airportPickup: false, airportDropoff: false, reservation: exampleReservation, surge: 1 }) : null;
  const exampleFee = exampleCategory ? riderPickupFee(pay, exampleCategory.id, exampleReservation) : 0;
  const split = quote && !quote.error ? pickupSplit(quote.total, quote.driverGets, pickup.total, exampleFee) : null;

  return (
    <div className="pp-layout">
      <div className="pp-main">
        <div className="pp-zone-tools">
          <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={onUseInAllZones}>{trn("{0} Use in all zones", <Layers size={14} aria-hidden="true" />)}</button>
          <button data-command="admin.pricing.copyZones" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={onCopy}>{trn("{0} Copy to…", <Copy size={14} aria-hidden="true" />)}</button>
        </div>

        <section className="dash-card pp-card" aria-labelledby="pickup-title">
          <header className="pp-head blue">
            <span className="pp-icon blue"><Route size={20} aria-hidden="true" /></span>
            <div>
              <h3 id="pickup-title">{tr("Pickup pay")}</h3>
              <p>{tr("Two separate sides. The driver gets pickup pay from Movera for the drive to the pickup, worked out from their live location each time an offer shows; the driver only sees the total. The rider pays a fixed pickup fee set here, the same whoever the driver is. Movera keeps the difference, and covers it when the driver came from far.")}</p>
            </div>
          </header>

          <div className="pp-section">
            <h4>{trn("Per category · {0}", zoneName)}</h4>
            <div className="pp-cats">
              {categories.map((category) => {
                const item = pay.rates[category.id];
                const old = before.rates[category.id];
                if (!item) return null;
                const label = trx(category.label);
                const off = !item.enabled;
                const locked = !canEdit || off;
                const maxOn = item.maxPerRide !== null;
                return (
                  <article key={category.id} className={off ? "pp-cat off" : "pp-cat"} aria-label={label} data-testid={`pickup-cat-${category.id}`}>
                    <div className="pp-cat-head">
                      <Switch label={tr("{0} pickup pay", [label])} checked={item.enabled} disabled={!canEdit} onChange={(enabled) => setRate(category.id, { enabled })} />
                      <h5>{label}</h5>
                      <span className={off ? "pp-cat-state" : "pp-cat-state on"}>{off ? tr("Off") : tr("Paid by Movera")}</span>
                      <div className="pp-max">
                        <Switch label={tr("{0} maximum per ride", [label])} checked={maxOn} disabled={locked} onChange={(on) => setRate(category.id, { maxPerRide: on ? fromSek(DEFAULT_MAX_SEK, currency) : null })} />
                        <span className="pp-max-label">{tr("Maximum per ride")}</span>
                        {maxOn ? (
                          <NumberField className="pp-unit" label={tr("{0} maximum pickup pay per ride", [label])} value={item.maxPerRide ?? 0} unit={symbol} step={step} disabled={locked} changed={item.maxPerRide !== old?.maxPerRide} invalid={bad.has(`pickup.${category.id}.maxPerRide`)} onChange={(maxPerRide) => setRate(category.id, { maxPerRide })} />
                        ) : <span className="pp-muted">{tr("No maximum")}</span>}
                      </div>
                    </div>
                    <PickupRanges categoryLabel={category.label} rate={item} old={old} symbol={symbol} step={step} locked={locked} bad={bad} pathPrefix={`pickup.${category.id}`} onChange={(ranges) => setRate(category.id, { ranges })} />
                    <div className="pp-rider" role="group" aria-label={tr("{0} rider pickup fee", [label])}>
                      <span className="pp-rider-title"><UserRound size={14} aria-hidden="true" /> {tr("Rider pays")}</span>
                      {([["live", tr("Live rides (Radar & Exclusive)")], ["reservation", tr("Reservations")]] as const).map(([side, sideLabel]) => {
                        const fee = item.riderFee[side];
                        const was = old?.riderFee?.[side];
                        return (
                          <span key={side} className="pp-rider-fee">
                            <Switch label={tr("{0} rider pickup fee for {1}", [label, sideLabel])} checked={fee.on} disabled={!canEdit} onChange={(on) => setFee(category.id, side, { on })} />
                            <span className={fee.on ? "pp-rider-label" : "pp-rider-label off"}>{sideLabel}</span>
                            <NumberField className="pp-unit" label={tr("{0} rider pickup fee amount for {1}", [label, sideLabel])} value={fee.amount} unit={symbol} step={step} disabled={!canEdit || !fee.on} changed={fee.amount !== was?.amount || fee.on !== was?.on} invalid={bad.has(`pickup.${category.id}.riderFee.${side}`)} onChange={(amount) => setFee(category.id, side, { amount })} />
                          </span>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="fine-print">{tr("Driver side: every km is paid at the rate of the range it falls in, and the minutes are split across the ranges in proportion to the km in each. Set a range to 0 to make it free. Ranges go up with no gaps; only the last can be \"and above\". The maximum per ride caps what all the ranges add up to.")}</p>
            <p className="fine-print">{tr("Rider side: a fixed amount in the price, with no ranges. One for live rides (Radar and Exclusive) and one for reservations; when it is off the rider pays nothing for the pickup.")}</p>
          </div>

          <div className="pp-section">
            <h4>{tr("Which offers get pickup pay")}</h4>
            <ul className="pp-offers">
              {PICKUP_OFFERS.map((item) => (
                <li key={item.kind} className={pay.offers[item.kind] !== before.offers[item.kind] ? "changed" : undefined}>
                  <div>
                    <strong>{trx(item.label)}</strong>
                    <small>{trx(item.hint)}</small>
                  </div>
                  <Switch label={tr("Pickup pay for {0}", [trx(item.label)])} checked={pay.offers[item.kind]} disabled={!canEdit} onChange={(value) => onChange({ ...pay, offers: { ...pay.offers, [item.kind]: value } })} />
                </li>
              ))}
              <li className="pp-never" aria-disabled="true">
                <div>
                  <strong>{tr("Normal reservations taken from Scheduled rides")}</strong>
                  <small>{tr("Never paid. This cannot be changed.")}</small>
                </div>
                <Switch label={tr("Pickup pay for normal reservations from Scheduled rides")} checked={false} disabled onChange={() => undefined} />
              </li>
            </ul>
            <p className="pp-note">{trn("{0} Reservations taken from the Scheduled rides list never get driver pickup pay. The rider's reservation pickup fee, when on, is paid either way.", <Info size={15} aria-hidden="true" />)}</p>
          </div>
        </section>
      </div>

      <div className="pp-side">
        <section className="dash-card pp-card" aria-labelledby="pickup-example-title" data-testid="pickup-example">
          <header className="pp-head green">
            <span className="pp-icon green"><Wallet size={20} aria-hidden="true" /></span>
            <div>
              <h3 id="pickup-example-title">{trn("Example · {0}", trx(exampleCategory?.label))}</h3>
              <p>{trn("Driver {0} km / {1} min from the pickup when the offer shows. Ride {2} km, {3} min.", short(exampleKm), short(exampleMin), SAMPLE_TRIP.km, SAMPLE_TRIP.minutes)}</p>
            </div>
          </header>
          <div className="pp-section">
            <div className="pp-example-inputs">
              <label className="field">{trn("Category{0}", <select aria-label={tr("Example category")} value={exampleCategory?.id ?? ""} onChange={(event) => setExampleId(event.target.value)}>
                  {categories.map((category) => <option key={category.id} value={category.id}>{trx(category.label)}{pay.rates[category.id]?.enabled ? "" : tr(" (pickup pay off)")}</option>)}
                </select>)}</label>
              <label className="field">{trn("To pickup{0}", <NumberField label={tr("Example pickup km")} value={exampleKm} unit="km" step={0.1} onChange={setExampleKm} />)}</label>
              <label className="field">{trn("Time{0}", <NumberField label={tr("Example pickup minutes")} value={exampleMin} unit="min" onChange={setExampleMin} />)}</label>
            </div>
            <div className="segmented pp-segmented" role="radiogroup" aria-label={tr("Example ride kind")}>
              <button data-command="admin.pricing.edit" type="button" role="radio" aria-checked={!exampleReservation} className={!exampleReservation ? "active" : undefined} onClick={() => setExampleReservation(false)}>{tr("Live ride")}</button>
              <button data-command="admin.pricing.edit" type="button" role="radio" aria-checked={exampleReservation} className={exampleReservation ? "active" : undefined} onClick={() => setExampleReservation(true)}>{tr("Reservation")}</button>
            </div>
            <div className="pp-receipt">
              <span className="pp-receipt-title">{tr("Driver pickup pay · paid by Movera")}</span>
              {rate?.enabled ? (
                <dl className="pp-lines">
                  {pickup.parts.map((part) => {
                    const range = rate.ranges[part.rangeIndex];
                    return (
                      <div key={part.rangeIndex} data-testid="pickup-example-range">
                        <dt>{trn("{0}: {1} km × {2} + {3} min × {4}", rangeLabel(range), short(part.km), num(range.krPerKm), short(part.minutes), num(range.krPerMinute))}</dt>
                        <dd>{money(part.pay, currency)}</dd>
                      </div>
                    );
                  })}
                  {pickup.capped ? <div className="pp-capped"><dt>{trn("Ranges add up to {0}; capped at the maximum", money(pickup.beforeMax, currency))}</dt><dd>{money(pickup.total, currency)}</dd></div> : null}
                </dl>
              ) : <p className="pp-muted">{trn("Pickup pay is off for {0}.", trx(exampleCategory?.label))}</p>}
              <dl className="pp-lines total">
                <div><dt>{tr("Pickup pay")}</dt><dd data-testid="pickup-pay-total">{money(pickup.total, currency)}</dd></div>
              </dl>
              {rate?.enabled && rate.maxPerRide !== null ? <p className="pp-muted" data-testid="pickup-max-from">{maxFromKm === null ? trn("The maximum of {0} is not reached within 300 km at this pace.", money(rate.maxPerRide, currency)) : trn("From about {0} km the maximum of {1} applies.", short(maxFromKm), money(rate.maxPerRide, currency))}</p> : null}
              {split ? (
                <>
                  <dl className="pp-lines">
                    <div><dt>{tr("Rider pays")}</dt><dd data-testid="pickup-rider-pays">{money(split.riderPays, currency)}</dd></div>
                    <div><dt>{exampleFee > 0 ? tr("of which fixed pickup fee") : tr("Fixed pickup fee (off)")}</dt><dd data-testid="pickup-rider-fee">{money(split.riderFee, currency)}</dd></div>
                    <div><dt>{tr("Driver's share of the fare")}</dt><dd>{money(split.driverFare, currency)}</dd></div>
                    <div><dt>{tr("+ Pickup pay")}</dt><dd>{money(split.pickup, currency)}</dd></div>
                  </dl>
                  <dl className="pp-lines total">
                    <div><dt>{tr("Driver gets")}</dt><dd data-testid="pickup-driver-gets">{money(split.driverGets, currency)}</dd></div>
                  </dl>
                  <dl className="pp-lines">
                    <div><dt>{split.moveraKeeps < 0 ? tr("Movera covers") : tr("Movera keeps")}</dt><dd data-testid="pickup-movera-keeps" className={split.moveraKeeps < 0 ? "negative" : undefined}>{money(Math.abs(split.moveraKeeps), currency)}</dd></div>
                  </dl>
                  <p className="pp-muted">{trn("Movera's share before pickup pay is {0}. It gains when the driver is close and covers the difference when the driver came from far.", money(split.commission, currency))}</p>
                </>
              ) : <p className="pp-muted">{quote?.error ?? tr("Pick a category.")}</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
