import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Copy, Hourglass, Wallet } from "lucide-react";
import { emptyReservationBook, normalizeReservationBook, useSlice, type ReservationBook } from "../api/hooks";
import type { MarketId } from "../markets/markets";
import { Card, Check, Num, Row, Switch } from "./fields";
import { driverNoShowShare, pickupTerms, WAIT_FIELDS, WAIT_RIDE_TYPES, WAITING_DRIVER_SHARE_PCT, type PickupWait, type WaitBase, type WaitOverride } from "./offers";
import type { CountryDispatch, ZoneDispatch } from "./rules";

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
        : <small>same</small>}
    </span>
  );
}

const EXAMPLES: { type: "normal" | "scheduled" | "airport" | "event"; far: boolean; label: string }[] = [
  { type: "normal", far: false, label: "Normal ride" },
  { type: "scheduled", far: false, label: "Scheduled ride" },
  { type: "airport", far: false, label: "Airport pickup" },
  { type: "event", far: false, label: "Event pickup" },
  { type: "normal", far: true, label: "Far pickup" },
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
    <Card title="Waiting at pickup" tone="green" icon={<Hourglass size={18} />} help="Free wait, then a price per minute. When the free wait ends the driver can also cancel for no-show and the rider pays the no-show fee. Extra rules change only the values you tick.">
      <div className="dx-sub" role="group" aria-label="Waiting from Pricing">
        <b><Wallet size={13} aria-hidden="true" /> Per category, from Pricing</b>
        <small>Free wait, price per minute and the no-show fee are the Pricing values of this zone, so there is one place to change them. The free wait is also the no-show wait: the driver can cancel for no-show when it ends.</small>
        <table className="dx-wait-table">
          <thead><tr><th>Category</th><th>Free wait = no-show wait</th><th>Then per minute</th><th>No-show fee</th></tr></thead>
          <tbody>
            {waitBases.map((row) => <tr key={row.id}><td>{row.label}</td><td>{row.base.freeWaitMin} min</td><td>{money(row.base.perMin)}</td><td>{money(row.base.noShowFee)}</td></tr>)}
          </tbody>
        </table>
        <Link className="dash-btn small ghost" to={`/pricing?country=${countryId}&zone=${zone.zoneId}`}>Change in Pricing</Link>
      </div>
      <Row label="Driver's share" help={`The waiting money always goes ${WAITING_DRIVER_SHARE_PCT}% to the driver. The no-show fee share is one rule for all of ${countryName}. The no-show reason never counts in the cancel rate.`}>
        <span className="dx-override on" data-testid="wait-share-fixed"><small>waiting money {WAITING_DRIVER_SHARE_PCT}% (fixed)</small></span>
        <Num label="Driver's share of the no-show fee" before={`no-show, all of ${countryName}`} value={country.noShowDriverSharePct} unit="%" min={0} max={100} disabled={disabled} onChange={(noShowDriverSharePct) => onCountry({ ...country, noShowDriverSharePct: Math.round(noShowDriverSharePct) })} />
      </Row>

      <div className="dx-sub" role="group" aria-label="Far pickups">
        <span className="dx-sub-head">
          <b>By pickup distance</b>
          <Switch label="Rule for far pickups" on={wait.farPickupOn} disabled={disabled} onChange={(farPickupOn) => set({ farPickupOn })} />
        </span>
        <small>The driver drove far to get the rider: for example a shorter free wait and a higher no-show fee.</small>
        {wait.farPickupOn ? (
          <>
            <span className="dx-resv-pick"><Num label="Far pickup from" before="pickup over" value={wait.farPickupKm} unit="km" step={0.5} min={0.5} max={50} disabled={disabled} onChange={(farPickupKm) => set({ farPickupKm })} /></span>
            {fields(wait.farPickup, "Far pickup", (farPickup) => set({ farPickup }))}
          </>
        ) : null}
      </div>

      <div className="dx-sub" role="group" aria-label="By ride type">
        <b>By ride type</b>
        <small>Pickups of a kind of ride. A ride type rule comes before the distance rule.</small>
        <ul className="dx-types" aria-label="Waiting by ride type">
          {WAIT_RIDE_TYPES.map((type) => {
            const rule = wait.rideTypes[type.id];
            const setRule = (next: Partial<typeof rule>) => set({ rideTypes: { ...wait.rideTypes, [type.id]: { ...rule, ...next } } });
            return (
              <li key={type.id} className={rule.on ? undefined : "off"}>
                <span className="dx-type-name">
                  <b>{type.label}</b>
                  <small>{type.help}</small>
                  <Switch label={`${type.label} rule`} on={rule.on} disabled={disabled} onChange={(on) => setRule({ on })} />
                </span>
                {rule.on ? (
                  <span className="dx-type-values">
                    {type.id === "scheduled" ? <span className="dx-override on"><small>Free wait {included} min · <Link to={`/dispatch?zone=${zone.zoneId}&tab=reservations`}>reservation policy</Link></small></span> : null}
                    {fields(rule, type.label, (next) => setRule(next), type.id === "scheduled" ? "freeWaitMin" : undefined)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {first ? (
        <div className="dx-sub" role="group" aria-label="Waiting examples">
          <b>What the driver sees, {first.label}</b>
          <ul className="dx-wait-examples">
            {EXAMPLES.filter((item) => !item.far || wait.farPickupOn).map((item) => {
              const terms = pickupTerms(first.base, wait, { type: item.type, pickupKm: item.far ? wait.farPickupKm + 1 : 2, includedWaitingMin: included, noShowDriverSharePct: country.noShowDriverSharePct });
              return (
                <li key={item.label}>
                  <b>{item.label}{item.far ? ` (over ${wait.farPickupKm} km)` : ""}</b>
                  <span>{terms.freeWaitMin} min free · then {money(terms.perMin)}/min · no-show after {terms.noShowAfterMin} min · fee {money(terms.noShowFee)} (driver gets {money(driverNoShowShare(terms))})</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="dx-modal-actions">
        {copied ? <small role="status">{copied}</small> : null}
        <button data-command="admin.dispatch.edit" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => { const count = onAllZones(wait); setCopied(`Copied to ${count} zone${count === 1 ? "" : "s"}. Not live yet.`); }}><Copy size={13} aria-hidden="true" /> Use in all zones</button>
      </div>
    </Card>
  );
}
