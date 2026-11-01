import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Copy, Hourglass, Wallet } from "lucide-react";
import { emptyReservationBook, normalizeReservationBook, useSlice, type ReservationBook } from "../api/hooks";
import type { MarketId } from "../markets/markets";
import { Card, Check, Num, Row, Switch } from "./fields";
import { driverNoShowShare, pickupTerms, WAIT_FIELDS, WAIT_RIDE_TYPES, WAITING_DRIVER_SHARE_PCT, type PickupWait, type WaitBase, type WaitOverride } from "./offers";
import { cancelAfterArrivedText } from "./offerRules";
import type { CountryDispatch, ZoneDispatch } from "./rules";
import { tr, trn, trx } from "../i18n";

export type WaitBaseRow = { id: string; label: string; base: WaitBase };

type Props = {
  zone: ZoneDispatch;
  onChange: (next: ZoneDispatch) => void;
  disabled: boolean;
  symbol: string;
  money: (value: number) => string;
  countryId: MarketId;
  /** Free wait, price per minute and no-show fee per category, from Pricing for this zone. */
  waitBases: WaitBaseRow[];
  /** Puts these waiting rules in every zone the admin may change. Returns how many zones. */
  onAllZones: (pickupWait: PickupWait) => number;
  /** The no-show fee share is a country rule (Q44). */
  country: CountryDispatch;
  onCountry: (next: CountryDispatch) => void;
  countryName: string;
};

/** One value a rule can change. Unticked: the same as the zone's own terms. */
function OverrideField({ rule, field, unit, label, disabled, onChange }: { rule: WaitOverride; field: keyof WaitOverride; unit: string; label: string; disabled: boolean; onChange: (next: WaitOverride) => void }) {
  const value = rule[field];
  const name = WAIT_FIELDS.find((item) => item.id === field)!.label;
  return (
    <span className={value === null ? "dx-override" : "dx-override on"}>
      <Check label={name} on={value !== null} disabled={disabled} onChange={(on) => onChange({ ...rule, [field]: on ? (field === "noShowAfterMin" ? 5 : field === "freeWaitMin" ? 2 : 0) : null })} />
      {value !== null
        ? <Num label={`${label} ${name.toLowerCase()}`} value={value} unit={unit} step={field === "perMin" ? 0.01 : field === "noShowFee" ? 0.5 : 1} min={field === "noShowAfterMin" ? 1 : 0} max={field === "perMin" || field === "noShowFee" ? 1000 : 60} disabled={disabled} onChange={(next) => onChange({ ...rule, [field]: next })} />
        : <small>{tr("same")}</small>}
    </span>
  );
}

const EXAMPLES: { type: "normal" | "scheduled" | "airport" | "event"; far: boolean; label: string }[] = [
  { type: "normal", far: false, get label() { return tr("Normal ride"); } },
  { type: "scheduled", far: false, get label() { return tr("Scheduled ride"); } },
  { type: "airport", far: false, get label() { return tr("Airport pickup"); } },
  { type: "event", far: false, get label() { return tr("Event pickup"); } },
  { type: "normal", far: true, get label() { return tr("Far pickup"); } },
];

/** Q19/Q20: waiting at pickup. One source: the category's free wait, price per minute and no-show fee are Pricing's. */
export function PickupWaitCard({ zone, onChange, disabled, symbol, money, countryId, waitBases, onAllZones, country, onCountry, countryName }: Props) {
  const wait = zone.pickupWait;
  const set = (patch: Partial<PickupWait>) => onChange({ ...zone, pickupWait: { ...wait, ...patch } });
  const policySlice = useSlice<ReservationBook>("reservationOps", emptyReservationBook());
  const included = useMemo(() => normalizeReservationBook(policySlice.value).currentPolicy.includedWaitingMinutes, [policySlice.value]);
  const [copied, setCopied] = useState("");
  const first = waitBases[0];
  const unitOf = (field: keyof WaitOverride) => (WAIT_FIELDS.find((item) => item.id === field)!.unit === "money" ? (field === "perMin" ? `${symbol}/min` : symbol) : "min");
  const fields = (rule: WaitOverride, label: string, onRule: (next: WaitOverride) => void, skip?: keyof WaitOverride) => (
    <span className="dx-overrides">
      {WAIT_FIELDS.filter((item) => item.id !== skip).map((item) => <OverrideField key={item.id} rule={rule} field={item.id} unit={unitOf(item.id)} label={label} disabled={disabled} onChange={onRule} />)}
    </span>
  );
  return (
    <Card title={tr("Waiting at pickup")} tone="green" icon={<Hourglass size={18} />} help={tr("Free wait, then a price per minute. When the free wait ends the driver can also cancel for no-show and the rider pays the no-show fee. Extra rules change only the values you tick.")}>
      <div className="dx-sub" role="group" aria-label={tr("Waiting from Pricing")}>
        <b>{trn("{0} Per category, from Pricing", <Wallet size={13} aria-hidden="true" />)}</b>
        <small>{tr("Free wait, price per minute and the no-show fee are the Pricing values of this zone, so there is one place to change them. The free wait is also the no-show wait: the driver can cancel for no-show when it ends.")} {tr("The driver and rider apps always get these Pricing values in the zone's currency, whatever an older app document says: Pricing wins.")}</small>
        <table className="dx-wait-table">
          <thead><tr><th>{tr("Category")}</th><th>{tr("Free wait = no-show wait")}</th><th>{tr("Then per minute")}</th><th>{tr("No-show fee")}</th></tr></thead>
          <tbody>
            {waitBases.map((row) => <tr key={row.id}><td>{trx(row.label)}</td><td>{trn("{0} min", row.base.freeWaitMin)}</td><td>{money(row.base.perMin)}</td><td>{money(row.base.noShowFee)}</td></tr>)}
          </tbody>
        </table>
        <Link className="dash-btn small ghost" to={`/pricing?country=${countryId}&zone=${zone.zoneId}`}>{tr("Change in Pricing")}</Link>
      </div>
      {/* v0.18.7 (G5 Q2, owner "admin can adjust"): the no-show fee for a cancel after arrival, per zone, default on. */}
      <Row label={tr("Cancel after the driver arrived counts as a no-show")} help={tr("{0} Inside the free minutes after accept the rider always cancels free; before the free waiting at the pickup is over it is the normal cancel fee. Off: the normal cancel fee applies after arrival too.", [cancelAfterArrivedText()])} on={wait.cancelAfterArrivedIsNoShow} disabled={disabled} onToggle={(cancelAfterArrivedIsNoShow) => set({ cancelAfterArrivedIsNoShow })} />
      <Row label={tr("Driver's share")} help={tr("The waiting money always goes {0}% to the driver. The no-show fee share is one rule for all of {1}. The no-show reason never counts in the cancel rate.", [WAITING_DRIVER_SHARE_PCT, countryName])}>
        <span className="dx-override on" data-testid="wait-share-fixed"><small>{trn("waiting money {0}% (fixed)", WAITING_DRIVER_SHARE_PCT)}</small></span>
        <Num label={tr("Driver's share of the no-show fee")} before={tr("no-show, all of {0}", [countryName])} value={country.noShowDriverSharePct} unit="%" min={0} max={100} disabled={disabled} onChange={(noShowDriverSharePct) => onCountry({ ...country, noShowDriverSharePct: Math.round(noShowDriverSharePct) })} />
      </Row>

      <div className="dx-sub" role="group" aria-label={tr("Far pickups")}>
        <span className="dx-sub-head">
          <b>{tr("By pickup distance")}</b>
          <Switch label={tr("Rule for far pickups")} on={wait.farPickupOn} disabled={disabled} onChange={(farPickupOn) => set({ farPickupOn })} />
        </span>
        <small>{tr("The driver drove far to get the rider: for example a shorter free wait and a higher no-show fee.")}</small>
        {wait.farPickupOn ? (
          <>
            <span className="dx-resv-pick"><Num label={tr("Far pickup from")} before="pickup over" value={wait.farPickupKm} unit="km" step={0.5} min={0.5} max={50} disabled={disabled} onChange={(farPickupKm) => set({ farPickupKm })} /></span>
            {fields(wait.farPickup, "Far pickup", (farPickup) => set({ farPickup }))}
          </>
        ) : null}
      </div>

      <div className="dx-sub" role="group" aria-label={tr("By ride type")}>
        <b>{tr("By ride type")}</b>
        <small>{tr("Pickups of a kind of ride. A ride type rule comes before the distance rule.")}</small>
        <ul className="dx-types" aria-label={tr("Waiting by ride type")}>
          {WAIT_RIDE_TYPES.map((type) => {
            const rule = wait.rideTypes[type.id];
            const setRule = (next: Partial<typeof rule>) => set({ rideTypes: { ...wait.rideTypes, [type.id]: { ...rule, ...next } } });
            return (
              <li key={type.id} className={rule.on ? undefined : "off"}>
                <span className="dx-type-name">
                  <b>{trx(type.label)}</b>
                  <small>{trx(type.help)}</small>
                  <Switch label={tr("{0} rule", [trx(type.label)])} on={rule.on} disabled={disabled} onChange={(on) => setRule({ on })} />
                </span>
                {rule.on ? (
                  <span className="dx-type-values">
                    {type.id === "scheduled" ? <span className="dx-override on"><small>{trn("Free wait {0} min · {1}", included, <Link to={`/dispatch?zone=${zone.zoneId}&tab=reservations`}>{tr("reservation policy")}</Link>)}</small></span> : null}
                    {fields(rule, type.label, (next) => setRule(next), type.id === "scheduled" ? "freeWaitMin" : undefined)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {first ? (
        <div className="dx-sub" role="group" aria-label={tr("Waiting examples")}>
          <b>{trn("What the driver sees, {0}", trx(first.label))}</b>
          <ul className="dx-wait-examples">
            {EXAMPLES.filter((item) => !item.far || wait.farPickupOn).map((item) => {
              const terms = pickupTerms(first.base, wait, { type: item.type, pickupKm: item.far ? wait.farPickupKm + 1 : 2, includedWaitingMin: included, noShowDriverSharePct: country.noShowDriverSharePct });
              return (
                <li key={item.label}>
                  <b>{trx(item.label)}{item.far ? tr(" (over {0} km)", [wait.farPickupKm]) : ""}</b>
                  <span>{trn("{0} min free · then {1}/min · no-show after {2} min · fee {3} (driver gets {4})", terms.freeWaitMin, money(terms.perMin), terms.noShowAfterMin, money(terms.noShowFee), money(driverNoShowShare(terms)))}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="dx-modal-actions">
        {copied ? <small role="status">{copied}</small> : null}
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => { const count = onAllZones(wait); setCopied(tr("Copied to {0} zone{1}. Not live yet.", [count, count === 1 ? "" : "s"])); }}>{trn("{0} Use in all zones", <Copy size={13} aria-hidden="true" />)}</button>
      </div>
    </Card>
  );
}
