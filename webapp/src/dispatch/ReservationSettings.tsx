import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Bell, CalendarClock, Timer, TrendingUp, UserCheck, Users, UserX } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { Card, Choice, Num, Row, Switch } from "./fields";
import { ReservationTimelinePreview, spanLabel } from "./Previews";
import { BookingPolicyCard } from "./BookingPolicy";
import { ScheduledAccessCard } from "../drivers/ScheduledAccess";
import {
  HOME_POPUP_TO, leaveNowBeforeMin, raiseCap, raiseSplit, RESERVATION_CANCEL_TO, RESERVATION_LIST_TO, RIDE_TYPES, smartGapMin,
  type DriverGroup, type ReservationRules, type RideTypeId, type RideTypeRule, type ZoneDispatch,
} from "./rules";

type Props = {
  zone: ZoneDispatch;
  onChange: (next: ZoneDispatch) => void;
  disabled: boolean;
  symbol: string;
  money: (value: number) => string;
  countryId: MarketId;
  countryName: string;
  groups: DriverGroup[];
  /** Movera's commission in this zone for a normal ride, from Pricing, and a sample booked-ride fare. */
  commissionPct: number;
  sampleFare: number;
  /** Opens Rides & stops › Rider cancel fees on its Reservations tab. */
  onOpenCancelFees: () => void;
};

/** "07:40" plus some minutes, for the worked examples. */
function clock(startMin: number, plusMin: number): string {
  const total = (((startMin + plusMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const SAMPLE_PICKUP = 7 * 60 + 40;

/** Dispatch › Reservations: everything about rides booked for later, in one place. */
export function ReservationSettings({ zone, onChange, disabled, symbol, money, countryId, countryName, groups, commissionPct, sampleFare, onOpenCancelFees }: Props) {
  const resv = zone.reservation;
  const set = (patch: Partial<ZoneDispatch>) => onChange({ ...zone, ...patch });
  const setResv = (patch: Partial<ReservationRules>) => set({ reservation: { ...resv, ...patch } });
  const setType = (id: RideTypeId, patch: Partial<RideTypeRule>) => setResv({ types: { ...resv.types, [id]: { ...resv.types[id], ...patch } } });
  const off = disabled || !resv.on;
  const cap = raiseCap(countryId);
  const [tryRaise, setTryRaise] = useState(() => Math.min(cap, Math.round(sampleFare * 0.3)));
  const split = raiseSplit(tryRaise, sampleFare, commissionPct);
  const normal = resv.types.normal;
  const gap = smartGapMin(35, 20, normal.spareMin);
  const group = groups.find((item) => item.id === resv.listGroupId);
  return (
    <div className="dx-cards">
      <Card title="Reservations" tone="orange" icon={<CalendarClock size={18} />} help="Rides booked for later. Nobody took it yet: Scheduled rides, then the Home popup, then Exclusive, then Radar trips." off={!resv.on} aside={<Switch label="Reservations" on={resv.on} disabled={disabled} onChange={(on) => setResv({ on })} />}>
        <Row label="Start looking for a driver" help="Before the pickup time.">
          <Num label="Reservation search starts" value={resv.searchBeforeMin} unit="min before" min={5} max={240} disabled={off} onChange={(searchBeforeMin) => setResv({ searchBeforeMin })} />
        </Row>
        <Row label="Give the ride to a driver early" help="For example the night before." on={resv.assignEarly} disabled={off} onToggle={(assignEarly) => setResv({ assignEarly })}>
          <Num label="Assign hours before" value={resv.assignHoursBefore} unit="h before" min={1} max={72} disabled={disabled} onChange={(assignHoursBefore) => setResv({ assignHoursBefore })} />
        </Row>
        <Row label="Backup driver" help="A second driver is ready if the first cancels." on={resv.backup} disabled={off} onToggle={(backup) => setResv({ backup })} />
        <Row label="Who gets it in Scheduled rides" help={RESERVATION_LIST_TO.find((item) => item.id === resv.listTo)?.help}>
          <Choice label="Scheduled rides go to" value={resv.listTo} disabled={off} onChange={(listTo) => setResv({ listTo, listGroupId: listTo === "group" && !resv.listGroupId ? groups[0]?.id ?? "" : resv.listGroupId })} options={RESERVATION_LIST_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
          {resv.listTo === "rating" ? <Num label="Lowest rating for Scheduled rides" before="at least" value={resv.listMinRating} unit="stars" step={0.1} min={1} max={5} disabled={off} onChange={(listMinRating) => setResv({ listMinRating })} /> : null}
          {resv.listTo === "random" ? <Num label="Random group size" value={resv.listGroupSize} unit="drivers" min={1} max={500} disabled={off} onChange={(listGroupSize) => setResv({ listGroupSize })} /> : null}
          {resv.listTo === "homeNear" ? <Num label="Home distance from pickup" before="within" value={resv.listHomeKm} unit="km of pickup" step={0.5} min={0.5} max={50} disabled={off} onChange={(listHomeKm) => setResv({ listHomeKm })} /> : null}
          {resv.listTo === "nearNow" ? <Num label="Distance from pickup now" before="within" value={resv.listNearKm} unit="km of pickup" step={0.5} min={0.5} max={50} disabled={off} onChange={(listNearKm) => setResv({ listNearKm })} /> : null}
          {resv.listTo === "areaRegulars" ? <Num label="Trips from the area" before="at least" value={resv.listAreaTrips} unit="trips in 30 days" min={1} max={200} disabled={off} onChange={(listAreaTrips) => setResv({ listAreaTrips })} /> : null}
          {resv.listTo === "group" ? (
            groups.length ? (
              <select className="dx-select" aria-label="Driver group for Scheduled rides" value={group ? group.id : ""} disabled={off} onChange={(event) => setResv({ listGroupId: event.target.value })}>
                {!group ? <option value="">Pick a group</option> : null}
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.driverIds.length} driver{item.driverIds.length === 1 ? "" : "s"}</option>)}
              </select>
            ) : <span className="dx-inline-note">No group yet. <Link to={`/dispatch?view=events&country=${countryId}`}>Make one in Events &amp; groups</Link></span>
          ) : null}
        </Row>
        {resv.listTo === "group" && group && !group.driverIds.length ? <p className="dx-note warn"><AlertTriangle size={13} aria-hidden="true" /> The group {group.name} has no drivers yet, so nobody sees these rides in Scheduled rides. Add drivers in Events &amp; groups.</p> : null}
        {resv.listTo !== "all" ? (
          <Row label="Open to all drivers" help="If nobody in the group took it, every driver in the zone sees it in Scheduled rides. Counted from when the rider booked." on={resv.listOpenAll} disabled={off} onToggle={(listOpenAll) => setResv({ listOpenAll })}>
            <Num label="Open to all drivers after" value={resv.listOpenAllAfterMin} unit="min after booking" min={1} max={1440} disabled={disabled} onChange={(listOpenAllAfterMin) => setResv({ listOpenAllAfterMin })} />
          </Row>
        ) : null}
        <Row label="Also show as the Home popup" help="If nobody took it from Scheduled rides yet. Counted from when the rider booked. It stays in the list too." on={resv.homePopup} disabled={off} onToggle={(homePopup) => setResv({ homePopup })}>
          <Num label="Home popup after booking" value={resv.homePopupAfterMin} unit="min after booking" min={1} max={1440} disabled={disabled} onChange={(homePopupAfterMin) => setResv({ homePopupAfterMin })} />
        </Row>
        <Row label="Who sees the Home popup" help={HOME_POPUP_TO.find((item) => item.id === resv.homePopupTo)?.help}>
          <Choice label="Home popup goes to" value={resv.homePopupTo} disabled={off || !resv.homePopup} onChange={(homePopupTo) => setResv({ homePopupTo })} options={HOME_POPUP_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
        </Row>
        <Row label="Closed with ×: comes back as Exclusive if nobody took it" help="A driver who closes the Home popup can get the ride again as an Exclusive offer, when it reaches the Exclusive step." on={resv.popupClosedExclusive} disabled={off || !resv.homePopup} onToggle={(popupClosedExclusive) => setResv({ popupClosedExclusive })} />
        <Row label="Becomes an Exclusive trip" help="If nobody took it by then. Shown like today's Exclusive offer." on={resv.toExclusive} disabled={off} onToggle={(toExclusive) => setResv({ toExclusive })}>
          <Num label="Exclusive before pickup" value={resv.exclusiveBeforeMin} unit="min before" min={1} max={180} disabled={disabled} onChange={(exclusiveBeforeMin) => setResv({ exclusiveBeforeMin })} />
        </Row>
        <Row label="Also goes to Radar trips" help="Home deck and Live list, as a normal trip that needs a driver soon. Never labelled Exclusive in Radar." on={resv.toRadar} disabled={off} onToggle={(toRadar) => setResv({ toRadar })}>
          <Num label="Radar trips before pickup" value={resv.radarBeforeMin} unit="min before" min={1} max={180} disabled={disabled} onChange={(radarBeforeMin) => setResv({ radarBeforeMin })} />
        </Row>
        <Row label="If the driver who took it cancels" help={`${RESERVATION_CANCEL_TO.find((item) => item.id === resv.onDriverCancel)?.help ?? ""}${resv.onDriverCancel === "byTime" ? "" : " A step closer to pickup always wins."}`}>
          <Choice label="After a driver cancels" value={resv.onDriverCancel} disabled={off} onChange={(onDriverCancel) => setResv({ onDriverCancel })} options={RESERVATION_CANCEL_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
        </Row>
        <Row label="Rider sees the driver at once" help="Name, photo and car as soon as a driver accepts. If the driver changes, the rider sees the new one. Off: the rider sees the driver when they head to the pickup." on={resv.showDriverOnAccept} disabled={off} onToggle={(showDriverOnAccept) => setResv({ showDriverOnAccept })} />
        <p className="dx-note dx-resv-tie"><Users size={13} aria-hidden="true" /> <span>Two drivers take it at the same time → the first tap wins; exact same moment → the system picks one at random.</span></p>
        <ReservationTimelinePreview zone={zone} groups={groups} />
      </Card>

      <Card title="Smart gap" tone="blue" icon={<Timer size={18} />} help="Trip time + drive to the next pickup + spare minutes. It keeps a driver's scheduled rides apart and sends the driver off in time." off={!resv.on}>
        <Row label="Clashing rides leave the list" help="A driver can't hold two rides at the same or a close time. They see them all, but once they take one, the others that do not fit the smart gap leave their Scheduled rides." on={resv.hideClashing} disabled={off} onToggle={(hideClashing) => setResv({ hideClashing })} />
        <Row label="Leave now" help="Live drive time to the pickup + spare minutes. Then the ride lands on the driver's screen as the active trip with Head to pickup, even if they were driving away." on={resv.leaveNow} disabled={off} onToggle={(leaveNow) => setResv({ leaveNow })} />
        <Row label="Late warning, then backup driver" help="Not moving toward the pickup after Leave now: the island says “Head to your 07:40 pickup”. After these minutes: an admin alert, and the backup driver gets the ride." on={resv.lateWarn} disabled={off} onToggle={(lateWarn) => setResv({ lateWarn })}>
          <Num label="Backup driver after the late warning" before="backup after" value={resv.lateBackupAfterMin} unit="min" min={1} max={60} disabled={disabled} onChange={(lateBackupAfterMin) => setResv({ lateBackupAfterMin })} />
        </Row>
        <Row label="Trips toward the pickup before the ride" help="Like destination mode, aimed at the scheduled pickup. Every trip is checked with the smart gap, so the driver is still in time." on={resv.towardPickup} disabled={off} onToggle={(towardPickup) => setResv({ towardPickup })}>
          <Num label="Trips toward the pickup from" before="from" value={resv.towardPickupBeforeMin} unit="min before" min={15} max={240} disabled={disabled} onChange={(towardPickupBeforeMin) => setResv({ towardPickupBeforeMin })} />
        </Row>
        <div className="dx-sub">
          <b><CalendarClock size={13} aria-hidden="true" /> Times per kind of ride</b>
          <small>Be online before pickup, spare minutes in the smart gap, and two reminders to the driver. Spare minutes start at 15.</small>
          <ul className="dx-types" aria-label="Times per kind of ride">
            {RIDE_TYPES.map((type) => {
              const rule = resv.types[type.id];
              return (
                <li key={type.id}>
                  <span className="dx-type-name">
                    <b>{type.label}</b>
                    <small>{type.help}</small>
                    {type.id === "long" ? <Num label="Long trip from" before="over" value={zone.longTripKm} unit="km" min={10} max={500} disabled={off} onChange={(longTripKm) => set({ longTripKm })} /> : null}
                  </span>
                  <span className="dx-type-values">
                    <Num label={`${type.label} be online before`} before="online" value={rule.onlineBeforeMin} unit="min before" min={5} max={240} disabled={off} onChange={(onlineBeforeMin) => setType(type.id, { onlineBeforeMin })} />
                    <Num label={`${type.label} spare minutes`} before="spare" value={rule.spareMin} unit="min" min={0} max={60} disabled={off} onChange={(spareMin) => setType(type.id, { spareMin })} />
                    <Num label={`${type.label} first reminder`} before="reminders" value={rule.remindFirstMin} unit="min before" min={1} max={1440} disabled={off} onChange={(remindFirstMin) => setType(type.id, { remindFirstMin })} />
                    <Num label={`${type.label} second reminder`} before="and" value={rule.remindLastMin} unit="min before" min={1} max={1440} disabled={off} onChange={(remindLastMin) => setType(type.id, { remindLastMin })} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="dx-resv-foot" aria-label="Smart gap example">
            Example, normal ride: pickup {clock(SAMPLE_PICKUP, 0)}, 35 min trip, ends 20 min from the next pickup. With {normal.spareMin} spare minutes the next ride can start at <b>{clock(SAMPLE_PICKUP, gap)}</b> or later ({spanLabel(gap)} gap).
            {resv.leaveNow ? <> A driver 18 min from the pickup gets Leave now <b>{leaveNowBeforeMin(18, normal.spareMin)} min</b> before pickup ({clock(SAMPLE_PICKUP, -leaveNowBeforeMin(18, normal.spareMin))}).</> : null}
          </p>
        </div>
      </Card>

      <Card title="Cancels" tone="red" icon={<UserX size={18} />} help="Drivers never pay a fee when they cancel. Every driver cancel counts in the driver's cancel rate." off={!resv.on}>
        <p className="dx-note">Rider free cancel and late cancel fees per car type: see Rider cancel fees in Rides &amp; stops. <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={onOpenCancelFees}>Open Rider cancel fees</button></p>
        <Row label="A driver's late cancel" help="A driver cancel this close to pickup is a late cancel. The driver still pays nothing.">
          <Num label="Driver late cancel, hours before pickup" before="under" value={resv.driverLateCancelHours} unit="h before pickup" step={0.5} min={0.5} max={72} disabled={off} onChange={(driverLateCancelHours) => setResv({ driverLateCancelHours })} />
        </Row>
        <Row label="Pause scheduled rides after late cancels" help="Too many late cancels in the period: the driver can't get scheduled rides for the days you set." on={resv.latePause} disabled={off} onToggle={(latePause) => setResv({ latePause })}>
          <Num label="Late cancels before a pause" value={resv.latePauseAfter} unit="late cancels" min={1} max={20} disabled={disabled} onChange={(latePauseAfter) => setResv({ latePauseAfter })} />
          <Num label="Late cancels counted over days" before="in" value={resv.latePeriodDays} unit="days" min={1} max={90} disabled={disabled} onChange={(latePeriodDays) => setResv({ latePeriodDays })} />
          <Num label="Scheduled rides paused for days" before="pause" value={resv.latePauseDays} unit="days" min={1} max={365} disabled={disabled} onChange={(latePauseDays) => setResv({ latePauseDays })} />
        </Row>
        <p className="dx-note"><UserX size={13} aria-hidden="true" /> Drivers never pay. Every driver cancel counts in the cancel rate{resv.latePause ? `; ${resv.latePauseAfter} late cancel${resv.latePauseAfter === 1 ? "" : "s"} in ${resv.latePeriodDays} days pause scheduled rides for ${resv.latePauseDays} days` : ""}.</p>
      </Card>

      <ScheduledAccessCard />

      <Card title="No driver near pickup" tone="orange" icon={<Bell size={18} />} help="Nobody took it and pickup is close." off={!resv.on}>
        <Row label="Admin alert" help="The ride shows in Live and in Alerts as “Booked ride soon with no driver”, so you can give it to a driver.">
          <Link className="dash-btn small ghost" to="/alerts">Alert times in Alerts</Link>
        </Row>
        <Row label="Raise the driver's fare" help={`Paid from Movera's commission. The rider pays the same. Never more than ${money(cap)} in ${countryName}${countryId === "SE" ? "" : " (500 kr in Sweden)"}.`} on={resv.raiseFare} disabled={off} onToggle={(raiseFare) => setResv({ raiseFare })}>
          <Num label="Highest fare raise" before="up to" value={resv.raiseMax} unit={symbol} step={0.5} min={0} max={cap} disabled={disabled} onChange={(raiseMax) => setResv({ raiseMax })} />
        </Row>
        {resv.raiseFare ? (
          <div className="dx-sub" role="group" aria-label="Try a raise">
            <b><TrendingUp size={13} aria-hidden="true" /> Try a raise</b>
            <small>Sample booked ride {money(sampleFare)}. Movera's commission here is {commissionPct}% = {money(split.commission)} (set in Pricing).</small>
            <span className="dx-resv-pick">
              <Num label="Sample raise" before="raise by" value={tryRaise} unit={symbol} step={0.5} min={0} max={cap} onChange={setTryRaise} />
            </span>
            {split.beyond > 0
              ? <p className="dx-note warn" role="status"><AlertTriangle size={13} aria-hidden="true" /> <span>Goes <b>{money(split.beyond)}</b> beyond Movera's commission. Movera pays the difference.</span></p>
              : <p className="dx-note" role="status"><TrendingUp size={13} aria-hidden="true" /> <span>All from Movera's commission. {money(split.commission - split.fromCommission)} of the commission is left.</span></p>}
            {tryRaise > resv.raiseMax ? <p className="dx-note warn"><AlertTriangle size={13} aria-hidden="true" /> Above your highest raise ({money(resv.raiseMax)}), so it cannot be used.</p> : null}
          </div>
        ) : null}
      </Card>

      <Card title="Movera gives a ride to a driver" tone="blue" icon={<UserCheck size={18} />} help="From a reservation's page you can give the ride to one driver. The driver must accept." off={!resv.on}>
        <Row label="Time to accept" help="It comes like an Exclusive: “Assigned by Movera”, with Accept and a timer. Not accepted: you see it on the reservation and pick someone else.">
          <Num label="Time to accept a ride assigned by Movera" value={resv.assignAcceptSec} unit="s" min={10} max={600} disabled={off} onChange={(assignAcceptSec) => setResv({ assignAcceptSec })} />
        </Row>
      </Card>

      <BookingPolicyCard />
    </div>
  );
}
