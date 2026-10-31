import { Link } from "react-router";
import { CreditCard, EyeOff, HandCoins, MessageSquareText, Percent, RotateCcw } from "lucide-react";
import { Card, Choice, Num, Row, Switch } from "./fields";
import { CANCEL_RATE_DRIVER_TEXT, EXCLUSIVE_REASON_MAX, EXCLUSIVE_REASONS, OFFER_CARD_DETAILS, type OfferCardDetails } from "./offers";
import { RAISE_FACTOR_RANGE, raiseFactorLabel } from "./offerRules";
import type { CountryDispatch, ZoneDispatch } from "./rules";
import { tr, trn, trx } from "../i18n";

type Props = { zone: ZoneDispatch; onChange: (next: ZoneDispatch) => void; disabled: boolean };

/** Q14: what the driver sees on an offer card (Radar, Exclusive and the reservation popup). */
export function OfferCardSettings({ zone, onChange, disabled }: Props) {
  const card = zone.offerCard;
  const setCard = (patch: Partial<OfferCardDetails>) => onChange({ ...zone, offerCard: { ...card, ...patch } });
  return (
    <Card title={tr("Offer card")} tone="blue" icon={<CreditCard size={18} />} help={tr("What the driver sees before accepting, on the Radar card, the Exclusive card and the reservation popup. Switch each detail on or off.")}>
      <Row label={tr("Fare shown")} help={card.netFare ? tr("The driver's share, after Movera's commission.") : tr("The full fare the rider pays.")}>
        <Choice label={tr("Fare on the offer card")} value={card.netFare ? "net" : "full"} disabled={disabled} onChange={(value) => setCard({ netFare: value === "net" })} options={[{ id: "full", label: tr("Full fare") }, { id: "net", label: tr("Driver's share") }]} />
      </Row>
      <Row label={tr("Drop-off")} help={card.dropoffAreaOnly ? tr("Only the area, for example Vasastan. The street shows after accepting.") : tr("The full address.")}>
        <Choice label={tr("Drop-off on the offer card")} value={card.dropoffAreaOnly ? "area" : "address"} disabled={disabled} onChange={(value) => setCard({ dropoffAreaOnly: value === "area" })} options={[{ id: "address", label: tr("Full address") }, { id: "area", label: tr("Area only") }]} />
      </Row>
      {OFFER_CARD_DETAILS.map((item) => (
        <Row key={item.id} label={trx(item.label)} help={trx(item.help)} on={card[item.id]} disabled={disabled} onToggle={(on) => setCard({ [item.id]: on } as Partial<OfferCardDetails>)} />
      ))}
    </Card>
  );
}

/**
 * v0.18.6 (owner G4-E4 "2×, admin can change (Recommended)"): how far a rider may raise the fare while searching, per
 * zone or the country standard (DispatchDocument.raisePrice.maxFactor, contract range 1–3, default 2). The rider app
 * hides every raise button over it and the server refuses a higher raise. Same in Sweden and France.
 */
export function RaiseLimitCard({ zone, onChange, disabled }: Props) {
  const factor = zone.raisePrice.maxFactor;
  const [low, high] = RAISE_FACTOR_RANGE;
  return (
    <Card title={tr("Rider raise limit")} tone="green" icon={<HandCoins size={18} />} help={tr("While a rider waits for a driver they can offer more. This is the most they can offer, as times the booked price. The rider app hides the amounts above it.")}>
      <Row label={tr("Highest price a rider can offer")} help={tr("For example 2× on a trip booked at 200: at most 400. From {0} to {1}.", [raiseFactorLabel(low), raiseFactorLabel(high)])}>
        <Num label={tr("Rider raise limit")} value={factor} unit="×" min={low} max={high} step={0.1} disabled={disabled} onChange={(maxFactor) => onChange({ ...zone, raisePrice: { maxFactor: Math.round(maxFactor * 10) / 10 } })} />
      </Row>
    </Card>
  );
}

/**
 * Q15: the short text that said why an offer is Exclusive. v0.18.6 (owner G4-E7 "Remove short line explain"): not shown
 * in the panel any more (the driver app shows no such line and the server sends none); kept for the demo's old books.
 */
export function ExclusiveReasonsCard({ zone, onChange, disabled }: Props) {
  const reasons = zone.exclusiveReasons;
  return (
    <Card title={tr("Exclusive reasons")} tone="purple" icon={<MessageSquareText size={18} />} help={tr("The short text on an Exclusive offer that says why it is for this driver. Keep it short and professional, at most {0} characters. Off: no reason text.", [EXCLUSIVE_REASON_MAX])} off={!zone.exclusive.on}>
      <ul className="dx-reasons" aria-label={tr("Exclusive reasons")}>
        {EXCLUSIVE_REASONS.map((item) => {
          const reason = reasons[item.id];
          const set = (patch: Partial<typeof reason>) => onChange({ ...zone, exclusiveReasons: { ...reasons, [item.id]: { ...reason, ...patch } } });
          const long = reason.text.trim().length > EXCLUSIVE_REASON_MAX;
          return (
            <li key={item.id} className={reason.on ? undefined : "off"}>
              <span className="dx-reason-when"><small>{item.when}</small></span>
              <input className={long || (reason.on && !reason.text.trim()) ? "dx-text invalid" : "dx-text"} aria-label={tr("Exclusive reason text: {0}", [item.when])} value={reason.text} maxLength={EXCLUSIVE_REASON_MAX + 12} disabled={disabled} onChange={(event) => set({ text: event.target.value })} />
              <span className="dx-reason-tools">
                {reason.text !== item.text ? <button data-command="admin.dispatch.edit" type="button" className="icon-ghost" aria-label={tr("Use the default text for {0}", [item.when])} title={tr("Back to “{0}”", [item.text])} disabled={disabled} onClick={() => set({ text: item.text })}><RotateCcw size={13} aria-hidden="true" /></button> : null}
                <Switch label={tr("Exclusive reason {0}", [item.text])} on={reason.on} disabled={disabled} onChange={(on) => set({ on })} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="dx-note">{tr("A ride Movera gives to a driver always says “Assigned by Movera”.")}</p>
    </Card>
  );
}

/** Q22: the cancel rate drivers should stay under. A country rule, never shown to drivers. */
export function CancelRateCard({ country, onCountry, countryName, disabled }: { country: CountryDispatch; onCountry: (next: CountryDispatch) => void; countryName: string; disabled: boolean }) {
  return (
    <Card title={tr("Cancel rate · all of {0}", [countryName])} tone="orange" icon={<Percent size={18} />} help={tr("The cancel rate a driver should stay under. A normal-trip cancel only counts in the cancel rate: no pause and no fee.")}>
      <Row label={tr("Cancel rate limit")} help={tr("Drivers see their own rate, never this number.")}>
        <Num label={tr("Cancel rate limit")} before="under" value={country.cancelRateLimitPct} unit="%" min={1} max={100} disabled={disabled} onChange={(cancelRateLimitPct) => onCountry({ ...country, cancelRateLimitPct: Math.round(cancelRateLimitPct) })} />
      </Row>
      <p className="dx-note dx-resv-tie"><EyeOff size={13} aria-hidden="true" /> <span>{trn("Never shown to drivers. Under their cancel rate they see: “{0}”.", CANCEL_RATE_DRIVER_TEXT)}</span></p>
      <p className="dx-note"><span>{trn("Zones with “Over the cancel rate limit” on in Safety send no requests to drivers over it. Reasons marked “Doesn't count” never count ({0}). Scheduled rides also follow the late-cancel rule in Reservations. The acceptance rate has no rules.", <Link to="/dispatch?view=reasons">{tr("Cancel reasons")}</Link>)}</span></p>
    </Card>
  );
}
