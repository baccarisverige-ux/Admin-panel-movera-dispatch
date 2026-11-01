import { Link } from "react-router";
import { Car, Layers, Power, Radar, Route, Smartphone, Target } from "lucide-react";
import { Card, Choice, Num, Row, Switch } from "./fields";
import { autoOfflineText } from "./offerRules";
import type { ZoneDispatch } from "./rules";
import { tr, trn } from "../i18n";

type Props = { zone: ZoneDispatch; onChange: (next: ZoneDispatch) => void; disabled: boolean; zoneId: string };

/** Radar · Exclusive · Reservations › Radar: the zone's Radar rules and what the driver app shows. */
export function RadarRules({ zone, onChange, disabled, zoneId }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  const app = zone.radarApp;
  const setApp = (patch: Partial<ZoneDispatch["radarApp"]>) => set({ radarApp: { ...app, ...patch } });
  const off = disabled || !zone.radar.on;
  return (
    <>
      <Card title={tr("Radar")} tone="purple" icon={<Radar size={18} />} help={tr("One request is shown to several nearby drivers at once. The first to accept gets it.")} off={!zone.radar.on} aside={<Switch label={tr("Radar")} on={zone.radar.on} disabled={disabled} onChange={(on) => set({ radar: { ...zone.radar, on } })} />}>
        <Row label={tr("Drivers who see it")} help={tr("The nearest suitable drivers, all at the same time.")}>
          <Num label={tr("Radar drivers")} value={zone.radar.drivers} unit="drivers" min={1} max={30} disabled={off} onChange={(drivers) => set({ radar: { ...zone.radar, drivers } })} />
        </Row>
        <Row label={tr("Time on the radar")} help={tr("How long the request stays before the next step. A radar group sent from Live or the Dashboard counts down this time too.")}>
          <Num label={tr("Radar time")} value={zone.radar.seconds} unit="s" min={5} max={120} disabled={off} onChange={(seconds) => set({ radar: { ...zone.radar, seconds } })} />
          {zone.secondsDefaulted?.includes("radar") ? <small className="as-help" data-testid="radar-seconds-defaulted">{tr("Set to the default because it was 0")}</small> : null}
        </Row>
        <Row label={tr("If nobody accepts")}>
          <Choice label={tr("After Radar")} value={zone.radar.then} disabled={off} onChange={(then) => set({ radar: { ...zone.radar, then } })} options={[{ id: "widen", label: tr("Wider area") }, { id: "exclusive", label: tr("Exclusive") }, { id: "widen_then_exclusive", label: tr("Wider area, then Exclusive") }]} />
        </Row>
        <p className="dx-note">{trn("{0} Wider area: the search distance steps in {1}. Which mode runs, by time or how busy, is in {2}.", <Layers size={13} aria-hidden="true" />, <Link to={`/dispatch?tab=best&zone=${zoneId}&card=Search+distance`}>{tr("Dispatch › Best driver")}</Link>, <Link to={`/dispatch?zone=${zoneId}&card=Which+mode+runs`}>{tr("Dispatch › Modes")}</Link>)}</p>
      </Card>

      <Card title={tr("Radar in the driver app")} tone="purple" icon={<Smartphone size={18} />} help={tr("Two radar screens, each with its own limit: the full-screen list and the offer cards over the map. The driver app detects whether the car is moving.")} off={!zone.radar.on}>
        <div className="dx-sub">
          <b>{trn("{0} Full-screen radar list", <Smartphone size={13} aria-hidden="true" />)}</b>
          <small>{tr("When the driver opens the radar screen: a list of the rides on the radar.")}</small>
          <Row label={tr("Full-screen radar")} help={tr("Most rides shown in the list at once.")} on={app.fullOn} disabled={off} onToggle={(fullOn) => setApp({ fullOn })}>
            <Num label={tr("Offers on full-screen radar")} before="up to" value={app.full} unit="offers" min={1} max={20} disabled={off || !app.fullOn} onChange={(full) => setApp({ full })} />
          </Row>
          <Row label={tr("Lock the full-screen list while driving")} help={tr("While the car is moving the driver cannot open the list. It opens again as soon as the car stops.")} on={app.fullLockWhileDriving} disabled={off || !app.fullOn} onToggle={(fullLockWhileDriving) => setApp({ fullLockWhileDriving })} />
        </div>
        <div className="dx-sub">
          <b>{trn("{0} Offer cards on the map", <Car size={13} aria-hidden="true" />)}</b>
          <small>{tr("Small offer cards while the driver is on the map screen. Independent of the full-screen list.")}</small>
          <Row label={tr("Popup over the map")} help={app.popupSplitByDriving ? tr("Most cards at the same time while the car is stopped.") : tr("Most cards at the same time, all the time.")} on={app.popupOn} disabled={off} onToggle={(popupOn) => setApp({ popupOn })}>
            <Num label={tr("Offers in the popup")} before="up to" value={app.popup} unit="cards" min={1} max={5} disabled={off || !app.popupOn} onChange={(popup) => setApp({ popup })} />
          </Row>
          <Row label={tr("Different limit while driving")} help={tr("On: the cards have their own limit while the car is moving with no rider. Off: one number all the time.")} on={app.popupSplitByDriving} disabled={off || !app.popupOn} onToggle={(popupSplitByDriving) => setApp({ popupSplitByDriving })}>
            {app.popupSplitByDriving ? <Num label={tr("Offer cards while driving")} before="while driving up to" value={app.popupWhileDriving} unit="cards" min={1} max={5} disabled={off || !app.popupOn} onChange={(popupWhileDriving) => setApp({ popupWhileDriving: Math.round(popupWhileDriving) })} /> : null}
          </Row>
          <p className="dx-note">{trn("{0} The app waits about 10 seconds before switching between stopped and driving, so a traffic light does not flip the cards. Cards never pop over the navigation while driving.", <Car size={13} aria-hidden="true" />)}</p>
        </div>
        <Row label={tr("Hidden with ×: comes back after")} help={tr("A trip the driver hid in the Live list can come back if nobody took it and it is still in Radar. It never counts against the driver.")}>
          <Num label={tr("Hidden Radar trip comes back after")} value={zone.hiddenComesBackMin} unit="min" min={1} max={60} disabled={off} onChange={(hiddenComesBackMin) => set({ hiddenComesBackMin })} />
        </Row>
        <p className="dx-note">{trn("{0} No Radar offers while driving a rider. Only Exclusive offers come during a trip.", <Route size={13} aria-hidden="true" />)}</p>
      </Card>

      <Card title={tr("Go offline automatically")} tone="red" icon={<Power size={18} />} help={tr("A driver who does not accept offers is set offline, so riders are not kept waiting.")} off={!zone.autoOffline.on} aside={<Switch label={tr("Go offline automatically")} on={zone.autoOffline.on} disabled={disabled} onChange={(on) => set({ autoOffline: { ...zone.autoOffline, on } })} />}>
        <Row label={tr("After offers not accepted in a row")} help={`${autoOfflineText(zone.autoOffline.after)} ${tr("Offers sent during a trip do not count. The driver can go online again at once.")}`}>
          <Num label={tr("Offline after offers not accepted")} value={zone.autoOffline.after} unit="offers" min={1} max={99} disabled={disabled || !zone.autoOffline.on} onChange={(after) => set({ autoOffline: { ...zone.autoOffline, after: Math.round(after) } })} />
        </Row>
      </Card>

      <Card title={tr("Set offline without position")} tone="red" icon={<Power size={18} />} help={tr("A driver online whose phone sends no position for this long (not during a trip) is set offline by the server and told so. 0 = never.")}>
        <Row label={tr("Set offline after minutes without position")} help={tr("Default 5 minutes. The driver can go online again at once. Each automatic set offline is in the audit log.")}>
          <Num label={tr("Set offline after minutes without position")} value={zone.autoOffline.noFixMinutes} unit="min" min={0} max={120} disabled={disabled} onChange={(noFixMinutes) => set({ autoOffline: { ...zone.autoOffline, noFixMinutes: Math.round(noFixMinutes) } })} />
        </Row>
      </Card>
    </>
  );
}

/** Radar · Exclusive · Reservations › Exclusive: the zone's Exclusive rules (v0.18.6 G4-E7: no reason texts). */
export function ExclusiveRules({ zone, onChange, disabled, zoneId }: Props) {
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  const off = disabled || !zone.exclusive.on;
  return (
    <>
      <Card title={tr("Exclusive")} tone="blue" icon={<Target size={18} />} help={tr("One request goes to one driver at a time, the best first.")} off={!zone.exclusive.on} aside={<Switch label={tr("Exclusive")} on={zone.exclusive.on} disabled={disabled} onChange={(on) => set({ exclusive: { ...zone.exclusive, on } })} />}>
        <Row label={tr("Time to accept")} help={tr("Each driver has this long to say yes.")}>
          <Num label={tr("Exclusive time")} value={zone.exclusive.seconds} unit="s" min={5} max={60} disabled={off} onChange={(seconds) => set({ exclusive: { ...zone.exclusive, seconds } })} />
          {zone.secondsDefaulted?.includes("exclusive") ? <small className="as-help" data-testid="exclusive-seconds-defaulted">{tr("Set to the default because it was 0")}</small> : null}
        </Row>
        <Row label={tr("Drivers to try")} help={tr("One after the other, before the next step.")}>
          <Num label={tr("Exclusive drivers")} value={zone.exclusive.drivers} unit="drivers" min={1} max={10} disabled={off} onChange={(drivers) => set({ exclusive: { ...zone.exclusive, drivers } })} />
        </Row>
        <Row label={tr("If all say no")}>
          <Choice label={tr("After Exclusive")} value={zone.exclusive.then} disabled={off} onChange={(then) => set({ exclusive: { ...zone.exclusive, then } })} options={[{ id: "radar", label: tr("Radar") }, { id: "widen", label: tr("Wider area") }, { id: "widen_then_radar", label: tr("Wider area, then Radar") }]} />
        </Row>
        <Row label={tr("Exclusive while driving")} help={tr("Offers for the next ride during a trip. Only Exclusive, never Radar. Off: no offers while driving a rider.")} on={zone.exclusiveWhileDriving.on} disabled={off} onToggle={(on) => set({ exclusiveWhileDriving: { ...zone.exclusiveWhileDriving, on } })}>
          <Num label={tr("Exclusive offers while driving")} before="up to" value={zone.exclusiveWhileDriving.count} unit="at a time" min={1} max={5} disabled={off} onChange={(count) => set({ exclusiveWhileDriving: { ...zone.exclusiveWhileDriving, count } })} />
        </Row>
        <p className="dx-note">{trn("{0} The best driver, drivers finishing a ride nearby and favourite drivers are in {1}. What the offer card shows is in {2}.", <Target size={13} aria-hidden="true" />, <Link to={`/dispatch?tab=best&zone=${zoneId}`}>{tr("Dispatch › Best driver")}</Link>, <Link to={`/dispatch?zone=${zoneId}&card=Offer+card`}>{tr("Dispatch › Modes")}</Link>)}</p>
      </Card>
    </>
  );
}
