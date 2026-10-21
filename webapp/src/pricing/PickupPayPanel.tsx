import { Fragment, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Car, Copy, Info, Layers, Plus, Route, Trash2, Wallet } from "lucide-react";
import { market, type MarketId } from "../markets/markets";
import { NumberField } from "./NumberField";
import { PICKUP_DISPLAYS, PICKUP_OFFERS, addPickupRange, pickupPayFor, pickupSplit, rangeLabel, removePickupRange, updatePickupRange, type PickupPay, type PickupRange, type PickupRate } from "./pickupPay";
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

/** A category's pickup-distance ranges: from (read-only), to or "and above", per km, per minute. */
function PickupRanges({ categoryLabel, rate, old, symbol, step, locked, bad, pathPrefix, onChange }: RangesProps) {
  const ranges = rate.ranges ?? [];
  const add = (
    <button data-command="admin.pricing.edit" type="button" className="dash-btn small ghost" disabled={locked} onClick={() => onChange(addPickupRange(rate))}>{trn("{0} Add range", <Plus size={14} aria-hidden="true" />)}</button>
  );
  if (!ranges.length) {
    return (
      <div className="pp-ranges empty" role="group" aria-label={tr("{0} pickup ranges", [categoryLabel])}>
        <small>{tr("One rate for every pickup distance. Add ranges to pay a different rate by distance.")}</small>
        {add}
      </div>
    );
  }
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
        return (
          <div key={index} className="pp-range" data-testid={`${pathPrefix}-range-${index}`}>
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
            <button data-command="admin.pricing.edit" type="button" className="icon-ghost danger" aria-label={tr("Delete {0} ({1})", [name, rangeLabel(range)])} disabled={locked} onClick={() => onChange(removePickupRange(ranges, index))}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        );
      })}
      {add}
    </div>
  );
}

/** A big amount with the decimals and currency smaller, like the driver app's offer card. */
function BigAmount({ value, currency }: { value: number; currency: MarketId }) {
  const item = market(currency);
  const digits = item.minorUnits === 1000 ? 3 : 2;
  const parts = new Intl.NumberFormat(item.locale, { style: "currency", currency: item.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).formatToParts(value);
  const whole = parts.filter((part) => part.type === "integer" || part.type === "group" || part.type === "minusSign").map((part) => part.value).join("");
  const fraction = parts.filter((part) => part.type === "decimal" || part.type === "fraction").map((part) => part.value).join("");
  return (
    <span className="pp-big" aria-label={money(value, currency)}>
      <b>{whole}</b>
      <small>{fraction}{currencySymbol(currency)}</small>
    </span>
  );
}

/** Driver pickup pay for one zone: rates per category, which offers get it, and how the driver sees it. */
export function PickupPayPanel({ zoneName, currency, categories, book, published, problems, canEdit, onChange, onUseInAllZones, onCopy }: Props) {
  const pay = book.pickupPay;
  const before = published.pickupPay;
  const bad = new Set(problems.map((problem) => problem.path));
  const symbol = currencySymbol(currency);
  const locale = market(currency).locale;
  const num = (value: number, digits = 2) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const short = (value: number) => String(Number(value.toFixed(2)));

  const firstOn = categories.find((category) => category.id === "comfort" && pay.rates.comfort?.enabled) ?? categories.find((category) => pay.rates[category.id]?.enabled) ?? categories[0];
  const [exampleId, setExampleId] = useState(firstOn?.id ?? "comfort");
  const [exampleKm, setExampleKm] = useState(4.2);
  const [exampleMin, setExampleMin] = useState(9);

  const setRate = (categoryId: string, patch: Partial<PickupRate>) => onChange({ ...pay, rates: { ...pay.rates, [categoryId]: { ...pay.rates[categoryId], ...patch } } });

  const exampleCategory = categories.find((category) => category.id === exampleId) ?? firstOn;
  const rate = exampleCategory ? pay.rates[exampleCategory.id] : undefined;
  const pickup = pickupPayFor(rate, exampleKm, exampleMin);
  const exampleRange = pickup.rangeIndex === null ? undefined : rate?.ranges?.[pickup.rangeIndex];
  const quote = exampleCategory ? quoteRide(book, { categoryId: exampleCategory.id, ...SAMPLE_TRIP, waitMin: 0, stops: 0, stopWaitMin: 0, babySeats: 0, childSeats: 0, airportPickup: false, airportDropoff: false, reservation: false, surge: 1 }) : null;
  const split = quote && !quote.error ? pickupSplit(quote.total, quote.driverGets, pickup.total) : null;
  const pickupLine = `incl. ${money(pickup.total, currency)} pickup · ${short(exampleKm)} km · ${short(exampleMin)} min`;

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
              <h3 id="pickup-title">{tr("Pickup pay · paid by Movera")}</h3>
              <p>{tr("Drivers are paid for the drive to the pickup, from their live location when the offer shows. It is worked out again each time the offer shows. The rider's price never changes.")}</p>
            </div>
          </header>

          <div className="pp-section">
            <h4>{trn("Per category · {0}", zoneName)}</h4>
            <div className="pp-table-wrap" tabIndex={0} aria-label={tr("Pickup pay per category")}>
              <table className="pp-table">
                <thead>
                  <tr>
                    <th scope="col">{tr("Category")}</th>
                    <th scope="col">{tr("On")}</th>
                    <th scope="col">{tr("Per km")}</th>
                    <th scope="col">{tr("Per minute")}</th>
                    <th scope="col">{tr("Free first km")}</th>
                    <th scope="col">{tr("Free first minutes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => {
                    const item = pay.rates[category.id];
                    const old = before.rates[category.id];
                    if (!item) return null;
                    const off = !item.enabled;
                    const locked = !canEdit || off;
                    const ranged = Boolean(item.ranges?.length);
                    const single = ranged ? "Paid by the ranges below" : undefined;
                    return (
                      <Fragment key={category.id}>
                      <tr className={off ? "off pp-cat" : "pp-cat"}>
                        <th scope="row">{trx(category.label)}</th>
                        <td><Switch label={tr("{0} pickup pay", [trx(category.label)])} checked={item.enabled} disabled={!canEdit} onChange={(enabled) => setRate(category.id, { enabled })} /></td>
                        <td><NumberField className="pp-unit" label={tr("{0} pickup per km", [trx(category.label)])} value={item.perKm} unit={`${symbol}/km`} step={inputStep(currency)} disabled={locked || ranged} title={single} changed={item.perKm !== old?.perKm} invalid={bad.has(`pickup.${category.id}.perKm`)} onChange={(perKm) => setRate(category.id, { perKm })} /></td>
                        <td><NumberField className="pp-unit" label={tr("{0} pickup per minute", [trx(category.label)])} value={item.perMin} unit={`${symbol}/min`} step={inputStep(currency)} disabled={locked || ranged} title={single} changed={item.perMin !== old?.perMin} invalid={bad.has(`pickup.${category.id}.perMin`)} onChange={(perMin) => setRate(category.id, { perMin })} /></td>
                        <td>
                          <span className="pp-free">
                            <Switch label={tr("{0} free first km", [trx(category.label)])} checked={item.freeKmOn} disabled={locked} onChange={(freeKmOn) => setRate(category.id, { freeKmOn })} />
                            <NumberField label={tr("{0} free km", [trx(category.label)])} value={item.freeKm} unit="km" step={0.1} disabled={locked || !item.freeKmOn} changed={item.freeKm !== old?.freeKm || item.freeKmOn !== old?.freeKmOn} invalid={bad.has(`pickup.${category.id}.freeKm`)} onChange={(freeKm) => setRate(category.id, { freeKm })} />
                          </span>
                        </td>
                        <td>
                          <span className="pp-free">
                            <Switch label={tr("{0} free first minutes", [trx(category.label)])} checked={item.freeMinOn} disabled={locked} onChange={(freeMinOn) => setRate(category.id, { freeMinOn })} />
                            <NumberField label={tr("{0} free minutes", [trx(category.label)])} value={item.freeMin} unit="min" disabled={locked || !item.freeMinOn} changed={item.freeMin !== old?.freeMin || item.freeMinOn !== old?.freeMinOn} invalid={bad.has(`pickup.${category.id}.freeMin`)} onChange={(freeMin) => setRate(category.id, { freeMin })} />
                          </span>
                        </td>
                      </tr>
                      <tr className={off ? "off pp-ranges-row" : "pp-ranges-row"}>
                        <td colSpan={6}>
                          <PickupRanges categoryLabel={category.label} rate={item} old={old} symbol={symbol} step={inputStep(currency)} locked={locked} bad={bad} pathPrefix={`pickup.${category.id}`} onChange={(ranges) => setRate(category.id, { ranges })} />
                        </td>
                      </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="fine-print">{tr("The free part is not paid. Turn either one, both or none on. There is no cap.")}</p>
            <p className="fine-print">{tr("With ranges, the whole pickup is paid at the rate of the range its km falls into (exactly 10 km is in 0–10). Ranges go up with no gaps; only the last can be \"and above\", and longer pickups than a closed last range use the last range.")}</p>
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
            <p className="pp-note">{trn("{0} Reservations taken from the Scheduled rides list never get pickup pay.", <Info size={15} aria-hidden="true" />)}</p>
            <p className="pp-note">{trn("{0} How Radar, Exclusive and reservation offers work is set in {1}.", <Info size={15} aria-hidden="true" />, <Link to="/offers">{tr("Radar · Exclusive · Reservations")}</Link>)}</p>
          </div>
        </section>

        <p className="pp-warning" role="note">{trn("{0} The old \"Long pickup fee\" ({1}, added to the rider's price) is removed. Pickup pay replaces it.", <AlertTriangle size={15} aria-hidden="true" />, money(fromSek(20, currency), currency))}</p>
      </div>

      <div className="pp-side">
        <section className="dash-card pp-card" aria-labelledby="pickup-card-title">
          <header className="pp-head violet">
            <span className="pp-icon violet"><Car size={20} aria-hidden="true" /></span>
            <div>
              <h3 id="pickup-card-title">{tr("On the driver's offer card")}</h3>
              <p>{tr("The driver always gets the total. You choose if the card also shows the pickup part.")}</p>
            </div>
          </header>
          <div className="pp-section">
            <div className="segmented pp-segmented" role="radiogroup" aria-label={tr("Offer card shows")}>
              {PICKUP_DISPLAYS.map((item) => (
                <button data-command="admin.pricing.edit" key={item.id} type="button" role="radio" aria-checked={pay.display === item.id} className={pay.display === item.id ? "active" : undefined} disabled={!canEdit} onClick={() => onChange({ ...pay, display: item.id })}>
                  {trx(item.label)}
                </button>
              ))}
            </div>
            <div className={pay.display === "total" ? "pp-offer chosen" : "pp-offer"} data-testid="offer-total-only">
              <BigAmount value={split?.driverGets ?? 0} currency={currency} />
              <small>{tr("Total only: the pickup pay is inside the price.")}</small>
            </div>
            <div className={pay.display === "breakdown" ? "pp-offer chosen" : "pp-offer"} data-testid="offer-breakdown">
              <BigAmount value={split?.driverGets ?? 0} currency={currency} />
              <span className="pp-pickup-line">{pickupLine}</span>
            </div>
          </div>
        </section>

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
            <div className="pp-receipt">
              {rate?.enabled ? (
                <dl className="pp-lines">
                  {exampleRange ? <div data-testid="pickup-example-range"><dt>{tr("Range")}</dt><dd>{rangeLabel(exampleRange)}</dd></div> : null}
                  <div><dt>{trn("({0}{1}) km × {2}", short(exampleKm), pickup.freeKm ? tr(" − {0} free", [short(pickup.freeKm)]) : "", num(pickup.perKm))}</dt><dd>{money(pickup.kmPay, currency)}</dd></div>
                  <div><dt>{trn("({0}{1}) min × {2}", short(exampleMin), pickup.freeMin ? tr(" − {0} free", [short(pickup.freeMin)]) : "", num(pickup.perMin))}</dt><dd>{money(pickup.minPay, currency)}</dd></div>
                </dl>
              ) : <p className="pp-muted">{trn("Pickup pay is off for {0}.", trx(exampleCategory?.label))}</p>}
              <dl className="pp-lines total">
                <div><dt>{tr("Pickup pay")}</dt><dd data-testid="pickup-pay-total">{money(pickup.total, currency)}</dd></div>
              </dl>
              {split ? (
                <>
                  <dl className="pp-lines">
                    <div><dt>{tr("Rider pays (unchanged)")}</dt><dd>{money(split.riderPays, currency)}</dd></div>
                    <div><dt>{tr("Driver's share of the fare")}</dt><dd>{money(split.driverFare, currency)}</dd></div>
                    <div><dt>{tr("+ Pickup pay")}</dt><dd>{money(split.pickup, currency)}</dd></div>
                  </dl>
                  <dl className="pp-lines total">
                    <div><dt>{tr("Driver gets")}</dt><dd data-testid="pickup-driver-gets">{money(split.driverGets, currency)}</dd></div>
                  </dl>
                  <dl className="pp-lines">
                    <div><dt>{tr("Movera keeps")}</dt><dd data-testid="pickup-movera-keeps">{money(split.moveraKeeps, currency)}</dd></div>
                  </dl>
                  <p className="pp-muted">{trn("instead of {0}: pickup pay comes out of Movera's commission.", money(split.commission, currency))}</p>
                </>
              ) : <p className="pp-muted">{quote?.error ?? tr("Pick a category.")}</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
