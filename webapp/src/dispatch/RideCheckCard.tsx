import { Link } from "react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, Num, Row, Switch } from "./fields";
import { RIDE_CHECK_LIMITS, type RideCheckRules, type ZoneDispatch } from "./rules";
import { tr, trn } from "../i18n";

/**
 * Dispatch › Safety: when the driver and rider apps ask "Is everything OK?". v0.18.9 (G7, contract.json#onTrip.rideCheck):
 * every number is this zone's (DriverAppConfig.rideCheck, published with Dispatch): the server checks the driver's GPS
 * and asks BOTH the rider and the driver; no answer in time alerts the safety team.
 */
export function RideCheckCard({ zone, onChange, disabled }: { zone: ZoneDispatch; onChange: (next: ZoneDispatch) => void; disabled: boolean }) {
  const check = zone.rideCheck;
  const setCheck = (patch: Partial<RideCheckRules>) => onChange({ ...zone, rideCheck: { ...check, ...patch } });
  const L = RIDE_CHECK_LIMITS;
  const off = disabled || !check.on;
  return (
    <Card title={tr("Ride check")} tone="green" icon={<ShieldCheck size={18} />} help={tr("Movera asks the rider and the driver “Is everything OK?” when the car stops too long, leaves the route or the trip ends far from the destination. No answer in time alerts the safety team.")} off={!check.on} aside={<Switch label={tr("Ride check")} on={check.on} disabled={disabled} onChange={(on) => setCheck({ on })} />}>
      <Row label={tr("Finished far from drop-off")} help={tr("The driver ends the trip far from the drop-off. Ride check starts right after.")} on={check.farOn} disabled={off} onToggle={(farOn) => setCheck({ farOn })}>
        <Num label={tr("Ended far from the drop-off")} before="more than" value={check.endFarMeters} unit="m" step={50} min={L.endFarMeters.min} max={L.endFarMeters.max} disabled={off} onChange={(endFarMeters) => setCheck({ endFarMeters })} />
      </Row>
      <Row label={tr("Unexpected long stop")} help={tr("No movement mid-trip, not at a planned stop and not at the drop-off.")} on={check.stopOn} disabled={off} onToggle={(stopOn) => setCheck({ stopOn })}>
        <Num label={tr("Long stop")} before="more than" value={check.stopMinutes} unit="min" step={1} min={L.stopMinutes.min} max={L.stopMinutes.max} disabled={off} onChange={(stopMinutes) => setCheck({ stopMinutes })} />
      </Row>
      <Row label={tr("Off the route")} help={tr("The car is far from the planned route.")} on={check.routeOn} disabled={off} onToggle={(routeOn) => setCheck({ routeOn })}>
        <Num label={tr("Off the route from")} before="more than" value={check.routeKm} unit="km" step={0.5} min={L.routeKm.min} max={L.routeKm.max} disabled={off} onChange={(routeKm) => setCheck({ routeKm })} />
      </Row>
      <Row label={tr("Longer than expected")} help={tr("Part of Off the route: the trip takes much longer than the time shown at booking.")} on={check.longerOn} disabled={off} onToggle={(longerOn) => setCheck({ longerOn })}>
        <Num label={tr("Longer than expected from")} before="more than" value={check.longerPct} unit="% longer" step={5} min={L.longerPct.min} max={L.longerPct.max} disabled={off} onChange={(longerPct) => setCheck({ longerPct })} />
      </Row>
      <Row label={tr("Possible crash")} help={tr("A very hard stop or impact. The card opens at once, with Call 112 on top.")} on={check.crashOn} disabled={off} onToggle={(crashOn) => setCheck({ crashOn })} />
      <Row label={tr("Time to answer")} help={tr("No answer in this time alerts the safety team.")}>
        <Num label={tr("Time to answer")} value={check.noAnswerSeconds} unit="s" step={10} min={L.noAnswerSeconds.min} max={L.noAnswerSeconds.max} disabled={off} onChange={(noAnswerSeconds) => setCheck({ noAnswerSeconds })} />
      </Row>
      <Row label={tr("Ask again after")} help={tr("The same reason does not ask again before this.")}>
        <Num label={tr("Ask again after")} value={check.repeatMinutes} unit="min" step={1} min={L.repeatMinutes.min} max={L.repeatMinutes.max} disabled={off} onChange={(repeatMinutes) => setCheck({ repeatMinutes })} />
      </Row>
      <Row label={tr("No answer rings the alarm")} help={tr("Off: a no-answer case is listed without sound. Need help always rings.")} on={check.noAnswerAlarm} disabled={off} onToggle={(noAnswerAlarm) => setCheck({ noAnswerAlarm })} />
      <p className="dx-note rc-note"><ShieldAlert size={13} aria-hidden="true" /> <span>{trn("The rider and the driver also get a push, so a locked phone still asks. Movera never calls 112; the person calls. Every check is in {0}.", <Link to="/incidents?view=ridechecks">{tr("Incidents → Ride checks")}</Link>)}</span></p>
    </Card>
  );
}
