import { Link } from "react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, Num, Row } from "./fields";
import { useRideCheckSettings } from "../safety/RideCheckSettingsCard";
import { RIDE_CHECK_LIMITS, type RideCheckRules, type ZoneDispatch } from "./rules";

/** Dispatch › Safety: when the driver and rider apps ask "Is everything OK?". Each trigger on or off, with its number. */
export function RideCheckCard({ zone, onChange, disabled }: { zone: ZoneDispatch; onChange: (next: ZoneDispatch) => void; disabled: boolean }) {
  const check = zone.rideCheck;
  const setCheck = (patch: Partial<RideCheckRules>) => onChange({ ...zone, rideCheck: { ...check, ...patch } });
  const anyOn = check.farOn || check.stopOn || check.routeOn || check.longerOn || check.crashOn;
  const L = RIDE_CHECK_LIMITS;
  const { settings } = useRideCheckSettings();
  const shared = <a href="#rc-triggers">Same for every zone</a>;
  return (
    <Card title="Ride check" tone="green" icon={<ShieldCheck size={18} />} help={'The driver and rider apps ask "Is everything OK?" when a trip looks wrong. Accident, Someone hurt or I feel unsafe sends you an alert.'} off={!anyOn}>
      <Row label="Finished far from drop-off" help="The driver taps Finish far from the drop-off. Ride check starts right after finish." on={check.farOn} disabled={disabled} onToggle={(farOn) => setCheck({ farOn })}>
        <span className="dx-limit-link" data-testid="ride-check-far">More than {settings.finishFarFromDropoffKm} km · {shared}</span>
      </Row>
      <Row label="Unexpected long stop" help="No movement mid-trip, not at a planned stop and not in traffic." on={check.stopOn} disabled={disabled} onToggle={(stopOn) => setCheck({ stopOn })}>
        <span className="dx-limit-link" data-testid="ride-check-stop">More than {settings.longStopMinutes} min · {shared}</span>
      </Row>
      <Row label="Off the route" help="The car is far from the planned route." on={check.routeOn} disabled={disabled} onToggle={(routeOn) => setCheck({ routeOn })}>
        <Num label="Off the route from" before="more than" value={check.routeKm} unit="km" step={0.5} min={L.routeKm.min} max={L.routeKm.max} disabled={disabled} onChange={(routeKm) => setCheck({ routeKm })} />
      </Row>
      <Row label="Longer than expected" help="Part of Off the route: the trip takes much longer than the time shown at booking." on={check.longerOn} disabled={disabled} onToggle={(longerOn) => setCheck({ longerOn })}>
        <Num label="Longer than expected from" before="more than" value={check.longerPct} unit="% longer" step={5} min={L.longerPct.min} max={L.longerPct.max} disabled={disabled} onChange={(longerPct) => setCheck({ longerPct })} />
      </Row>
      <Row label="Possible crash" help="A very hard stop or impact. The card opens at once, with Call 112 on top." on={check.crashOn} disabled={disabled} onToggle={(crashOn) => setCheck({ crashOn })} />
      <p className="dx-note rc-note"><ShieldAlert size={13} aria-hidden="true" /> <span>The card cannot be closed until the person answers. Movera never calls 112; the person calls. Every check is in <Link to="/incidents?view=ridechecks">Incidents → Ride checks</Link>.</span></p>
    </Card>
  );
}
