import { Flag, Info, Navigation, Route } from "lucide-react";
import { Card, Choice, Num, Row, Switch } from "./fields";
import type { ZoneDispatch } from "./rules";
import {
  TRIP_RULE_LIMITS as L, destinationFocus, destinationPreview, focusSwitches, nextTripsPreview,
  type DestinationFocus, type DestinationModeRules, type NextTripRules,
} from "./tripRules";
import { tr, trn } from "../i18n";

const FOCUS: { id: Exclude<DestinationFocus, "none">; label: string; hint: string }[] = [
  { id: "final", get label() { return tr("Final destination"); }, get hint() { return tr("Only trips that end near the destination."); } },
  { id: "onTheWay", get label() { return tr("On the way"); }, get hint() { return tr("Trips that end along the route and bring the driver closer."); } },
  { id: "both", get label() { return tr("Both"); }, get hint() { return tr("Trips to the destination and along the way."); } },
];

/** Dispatch › Rules › Destination & next trips: R13-9 Destination mode and R13-18 next trips during a trip. */
export function DestinationSettings({ zone, onChange, disabled, zoneName }: { zone: ZoneDispatch; onChange: (next: ZoneDispatch) => void; disabled: boolean; zoneName: string }) {
  const dest = zone.destinationMode;
  const next = zone.nextTrips;
  const setDest = (patch: Partial<DestinationModeRules>) => onChange({ ...zone, destinationMode: { ...dest, ...patch } });
  const setNext = (patch: Partial<NextTripRules>) => onChange({ ...zone, nextTrips: { ...next, ...patch } });
  const off = disabled || !dest.on;
  const focus = destinationFocus(dest);
  return (
    <div className="dx-cards">
      <Card title={tr("Destination mode")} tone="green" icon={<Flag size={18} />} help={tr("Drivers in {0} set a destination and get trips that bring them closer. Each part has its own switch; a part that is off has no limit.", [zoneName])} off={!dest.on} aside={<Switch label={tr("Destination mode")} on={dest.on} disabled={disabled} onChange={(on) => setDest({ on })} />}>
        <Row label={tr("Time limit")} help={tr("How long a destination stays active after the driver sets it.")} on={dest.timeLimitOn} disabled={off} onToggle={(timeLimitOn) => setDest({ timeLimitOn })}>
          <Num label={tr("Destination active for")} before="up to" value={dest.timeLimitHours} unit="h" step={L.timeLimitHours.step} min={L.timeLimitHours.min} max={L.timeLimitHours.max} disabled={off} onChange={(timeLimitHours) => setDest({ timeLimitHours })} />
        </Row>
        <Row label={tr("Destinations per day")} help={tr("How many times one driver can set a destination per day.")} on={dest.dailyLimitOn} disabled={off} onToggle={(dailyLimitOn) => setDest({ dailyLimitOn })}>
          <Num label={tr("Destinations per day")} value={dest.perDay} unit="per day" step={L.perDay.step} min={L.perDay.min} max={L.perDay.max} disabled={off} onChange={(perDay) => setDest({ perDay: Math.round(perDay) })} />
        </Row>
        <Row label={tr("Corridor around the route")} help={tr("A trip counts when its drop-off is this close to the driver's road route to the destination and the trip brings the driver closer.")} on={dest.corridorOn} disabled={off} onToggle={(corridorOn) => setDest({ corridorOn })}>
          <Num label={tr("Destination corridor")} before="within" value={dest.corridorKm} unit="km" step={L.corridorKm.step} min={L.corridorKm.min} max={L.corridorKm.max} disabled={off} onChange={(corridorKm) => setDest({ corridorKm })} />
        </Row>
        <Row label={tr("Focus")} help={tr("Which trips match a destination.")}>
          {focus === "none" ? <span className="dx-limit-link">{tr("None on")}</span> : <Choice label={tr("Destination focus")} value={focus} options={FOCUS} disabled={off} onChange={(value) => setDest(focusSwitches(value))} />}
        </Row>
        <Row label={tr("Final destination")} help={tr("Trips that end near the destination, for example straight to Arlanda.")} on={dest.finalOn} disabled={off} onToggle={(finalOn) => setDest({ finalOn })} />
        <Row label={tr("On the way")} help={tr("Trips that end along the route, for example Sollentuna or Upplands Väsby on the way to Arlanda.")} on={dest.onTheWayOn} disabled={off} onToggle={(onTheWayOn) => setDest({ onTheWayOn })} />
        <p className="dx-note dx-trip-note" data-testid="destination-preview"><Navigation size={13} aria-hidden="true" /> <span>{destinationPreview(dest)}</span></p>
      </Card>

      <Card title={tr("Next trips during a trip")} tone="blue" icon={<Route size={18} />} help={tr("When the driver can get the next trip while driving a rider. Each limit has its own switch; with both off, offers can come on the whole last leg.")}>
        <p className="dx-note dx-trip-note"><Info size={13} aria-hidden="true" /> <span>{trn("Next trips are only {0} offers and {1}, never Radar cards. They come only on the way to the final drop-off, never while heading to a stop or before pickup.", <b>{tr("Exclusive")}</b>, <b>{tr("Exclusive reservations")}</b>)}</span></p>
        <Row label={tr("Close to the drop-off")} help={tr("Offers start when the driver is this close to the final drop-off.")} on={next.withinKmOn} disabled={disabled} onToggle={(withinKmOn) => setNext({ withinKmOn })}>
          <Num label={tr("Next trips within km of drop-off")} before="within" value={next.withinKm} unit="km" step={L.withinKm.step} min={L.withinKm.min} max={L.withinKm.max} disabled={disabled} onChange={(withinKm) => setNext({ withinKm })} />
        </Row>
        <Row label={tr("Soon at the drop-off")} help={tr("Offers start this many minutes before the final drop-off.")} on={next.withinMinOn} disabled={disabled} onToggle={(withinMinOn) => setNext({ withinMinOn })}>
          <Num label={tr("Next trips within minutes of drop-off")} before="within" value={next.withinMin} unit="min" step={L.withinMin.step} min={L.withinMin.min} max={L.withinMin.max} disabled={disabled} onChange={(withinMin) => setNext({ withinMin: Math.round(withinMin) })} />
        </Row>
        <p className="dx-note dx-trip-note" data-testid="next-trips-preview"><Navigation size={13} aria-hidden="true" /> <span>{nextTripsPreview(next)}</span></p>
      </Card>
    </div>
  );
}
