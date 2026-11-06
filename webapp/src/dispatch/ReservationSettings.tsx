import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Bell, CalendarClock, Clock, Timer, TrendingUp, UserCheck, Users, UserX } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { Card, Choice, Num, Row, Switch } from "./fields";
import { ReservationTimelinePreview, spanLabel } from "./Previews";
import { BookingPolicyCard } from "./BookingPolicy";
import {
  HOME_POPUP_TO, LATE_ETA_REASSIGN_TO, leaveNowBeforeMin, raiseCap, raiseSplit, RESERVATION_CANCEL_TO, RESERVATION_LIST_TO, RIDE_TYPES, smartGapMin,
  type BookingWindow, type DriverGroup, type LateEtaRules, type ReservationRules, type RideTypeId, type RideTypeRule, type ZoneDispatch,
} from "./rules";
import { tr, trn, trx } from "../i18n";

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
  const setLate = (patch: Partial<LateEtaRules>) => setResv({ lateEta: { ...resv.lateEta, ...patch } });
  const setBooking = (patch: Partial<BookingWindow>) => setResv({ booking: { ...resv.booking, ...patch } });
  const bw = resv.booking;
  const off = disabled || !resv.on;
  const late = resv.lateEta;
  const lateTo = LATE_ETA_REASSIGN_TO.find((item) => item.id === late.reassignTo) ?? LATE_ETA_REASSIGN_TO[0];
  // Worked example: at 07:30 the driver is just far enough away to arrive one minute past the minutes allowed.
  const lateAway = 10 + late.toleranceMin + 1;
  const cap = raiseCap(countryId);
  const [tryRaise, setTryRaise] = useState(() => Math.min(cap, Math.round(sampleFare * 0.3)));
  const split = raiseSplit(tryRaise, sampleFare, commissionPct);
  const normal = resv.types.normal;
  const gap = smartGapMin(35, 20, normal.spareMin);
  const group = groups.find((item) => item.id === resv.listGroupId);
  return (
    <div className="dx-cards">
      <Card title={tr("1 · Booking — booking policy of this zone")} tone="green" icon={<CalendarClock size={18} />} help={tr("When a rider can book a ride for later. Saved on the server when you publish.")} off={!resv.on}>
        <div data-testid="booking-window">
          <Row label={tr("How early and how far ahead")} help={tr("Example: pickup at 10:00 can be booked until 09:45 at the latest, and up to 90 days ahead.")}>
            <Num label={tr("Book from, minutes ahead")} before="from" value={bw.minAheadMin} unit="min ahead" min={5} max={240} disabled={off} onChange={(minAheadMin) => setBooking({ minAheadMin })} />
            <Num label={tr("Book up to, days ahead")} before="up to" value={bw.maxAheadDays} unit="days ahead" min={1} max={365} disabled={off} onChange={(maxAheadDays) => setBooking({ maxAheadDays })} />
          </Row>
          <Row label={tr("Booked soon: send at once")} help={tr("Example: booked at 09:35 for 10:00 (under 30 min) → it goes out at once like a normal ride.")}>
            <Num label={tr("Send at once when booked under")} before="under" value={bw.soonBeforeMin} unit="min ahead" min={0} max={240} disabled={off} onChange={(soonBeforeMin) => setBooking({ soonBeforeMin })} />
          </Row>
          <Row label={tr("Longest booked ride")} help={tr("Off = no limit. On: example 60 km → a booked ride of 70 km is refused.")} on={bw.maxTripKm !== null} disabled={off} onToggle={(on) => setBooking({ maxTripKm: on ? 60 : null })}>
            {bw.maxTripKm !== null ? <Num label={tr("Longest booked ride, km")} before="up to" value={bw.maxTripKm} unit="km" min={1} max={1000} disabled={off} onChange={(maxTripKm) => setBooking({ maxTripKm })} /> : null}
          </Row>
          <p className="dx-note">{tr("Card payments are taken in full when the ride is booked (card payments are still coming soon).")}</p>
        </div>
      </Card>

      <Card title={tr("2 · Booked rides list — Reservations")} tone="orange" icon={<CalendarClock size={18} />} help={tr("Who sees a booked ride in Booked rides, and who gets a notice. Example pickup 10:00, booked at 07:00.")} off={!resv.on} aside={<Switch label={tr("Reservations")} on={resv.on} disabled={disabled} onChange={(on) => setResv({ on })} />}>
        {!resv.on ? <p className="dx-note warn" role="status">{trn("{0} Reservations are off for every driver in this zone: nobody gets new reservations. Rides drivers already accepted still run.", <AlertTriangle size={13} aria-hidden="true" />)}</p> : null}
        <Row label={tr("Who gets it in Scheduled rides")} help={trx(RESERVATION_LIST_TO.find((item) => item.id === resv.listTo)?.help)}>
          <Choice label={tr("Scheduled rides go to")} value={resv.listTo} disabled={off} onChange={(listTo) => setResv({ listTo, listGroupId: listTo === "group" && !resv.listGroupId ? groups[0]?.id ?? "" : resv.listGroupId })} options={RESERVATION_LIST_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
          {resv.listTo === "rating" ? <Num label={tr("Lowest rating for Scheduled rides")} before="at least" value={resv.listMinRating} unit="stars" step={0.1} min={1} max={5} disabled={off} onChange={(listMinRating) => setResv({ listMinRating })} /> : null}
          {resv.listTo === "random" ? <Num label={tr("Random group size")} value={resv.listGroupSize} unit="drivers" min={1} max={500} disabled={off} onChange={(listGroupSize) => setResv({ listGroupSize })} /> : null}
          {resv.listTo === "homeNear" ? <Num label={tr("Home distance from pickup")} before="within" value={resv.listHomeKm} unit="km of pickup" step={0.5} min={0.5} max={50} disabled={off} onChange={(listHomeKm) => setResv({ listHomeKm })} /> : null}
          {resv.listTo === "nearNow" ? <Num label={tr("Distance from pickup now")} before="within" value={resv.listNearKm} unit="km of pickup" step={0.5} min={0.5} max={50} disabled={off} onChange={(listNearKm) => setResv({ listNearKm })} /> : null}
          {resv.listTo === "nearAtTime" ? <Num label={tr("Last ride ends within, km")} before="within" value={bw.listAtTimeKm} unit="km of pickup" step={0.5} min={0.5} max={50} disabled={off} onChange={(listAtTimeKm) => setBooking({ listAtTimeKm })} /> : null}
          {resv.listTo === "nearAtTime" ? <Num label={tr("Last ride ends at most, minutes before")} before="at most" value={bw.listAtTimeMin} unit="min before" min={5} max={240} disabled={off} onChange={(listAtTimeMin) => setBooking({ listAtTimeMin })} /> : null}
          {resv.listTo === "areaRegulars" ? <Num label={tr("Trips from the area")} before="at least" value={resv.listAreaTrips} unit="trips in 30 days" min={1} max={200} disabled={off} onChange={(listAreaTrips) => setResv({ listAreaTrips })} /> : null}
          {resv.listTo === "group" ? (
            groups.length ? (
              <select className="dx-select" aria-label={tr("Driver group for Scheduled rides")} value={group ? group.id : ""} disabled={off} onChange={(event) => setResv({ listGroupId: event.target.value })}>
                {!group ? <option value="">{tr("Pick a group")}</option> : null}
                {groups.map((item) => <option key={item.id} value={item.id}>{trn("{0} · {1} driver{2}", trx(item.name), item.driverIds.length, item.driverIds.length === 1 ? "" : tr("s"))}</option>)}
              </select>
            ) : <span className="dx-inline-note">{trn("No group yet. {0}", <Link to={`/dispatch?view=events&country=${countryId}`}>{tr("Make one in Events & groups")}</Link>)}</span>
          ) : null}
        </Row>
        {resv.listTo === "group" && group && !group.driverIds.length ? <p className="dx-note warn">{trn("{0} The group {1} has no drivers yet, so nobody sees these rides in Scheduled rides. Add drivers in Events & groups.", <AlertTriangle size={13} aria-hidden="true" />, group.name)}</p> : null}
        {resv.listTo !== "all" ? (
          <Row label={tr("Open to all drivers")} help={tr("If nobody in the group took it, every driver in the zone sees it in Scheduled rides. Counted from when the rider booked.")} on={resv.listOpenAll} disabled={off} onToggle={(listOpenAll) => setResv({ listOpenAll })}>
            <Num label={tr("Open to all drivers after")} value={resv.listOpenAllAfterMin} unit="min after booking" min={1} max={1440} disabled={disabled} onChange={(listOpenAllAfterMin) => setResv({ listOpenAllAfterMin })} />
          </Row>
        ) : null}
        <Row label={tr("Reservation notice")} help={tr("Example: booked at 07:00 for 10:00 → the 20 nearest drivers who see it get a notice at 07:00.")} on={bw.noticeOn} disabled={off} onToggle={(noticeOn) => setBooking({ noticeOn })}>
          <Num label={tr("Drivers who get the notice")} before="up to" value={bw.noticeMaxDrivers} unit="drivers" min={1} max={500} disabled={off || !bw.noticeOn} onChange={(noticeMaxDrivers) => setBooking({ noticeMaxDrivers })} />
        </Row>
      </Card>

      <Card title={tr("3 · Home popup")} tone="orange" icon={<Bell size={18} />} help={tr("If nobody took it from Booked rides, it can also pop up on Home.")} off={!resv.on}>
        <Row label={tr("Also show as the Home popup")} help={tr("Example: booked at 07:00, nobody took it by 07:10 → it also pops up on Home.")} on={resv.homePopup} disabled={off} onToggle={(homePopup) => setResv({ homePopup })}>
          <Num label={tr("Home popup after booking")} value={resv.homePopupAfterMin} unit="min after booking" min={1} max={1440} disabled={disabled} onChange={(homePopupAfterMin) => setResv({ homePopupAfterMin })} />
        </Row>
        <Row label={tr("Who sees the Home popup")} help={trx(HOME_POPUP_TO.find((item) => item.id === resv.homePopupTo)?.help)}>
          <Choice label={tr("Home popup goes to")} value={resv.homePopupTo} disabled={off || !resv.homePopup} onChange={(homePopupTo) => setResv({ homePopupTo })} options={HOME_POPUP_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
        </Row>
        <Row label={tr("Closed with ×: comes back as Exclusive if nobody took it")} help={tr("A driver who closes the Home popup can get the ride again as an Exclusive offer, when it reaches the Exclusive step.")} on={resv.popupClosedExclusive} disabled={off || !resv.homePopup} onToggle={(popupClosedExclusive) => setResv({ popupClosedExclusive })} />
      </Card>

      <Card title={tr("4 · 30 min before — the search")} tone="orange" icon={<Timer size={18} />} help={tr("Nobody took it: the server sends it out like a normal ride, best-placed drivers first.")} off={!resv.on}>
        <Row label={tr("Start looking for a driver")} help={tr("Example: pickup 10:00 → at 09:30 the search starts: first drivers who can be there by 09:50, then by 10:00, then any near driver.")}>
          <Num label={tr("Reservation search starts")} value={resv.searchBeforeMin} unit="min before" min={5} max={240} disabled={off} onChange={(searchBeforeMin) => setResv({ searchBeforeMin })} />
        </Row>
        <Row label={tr("Becomes an Exclusive trip")} help={tr("Example: still free at 09:40 → offered as Exclusive, one driver at a time.")} on={resv.toExclusive} disabled={off} onToggle={(toExclusive) => setResv({ toExclusive })}>
          <Num label={tr("Exclusive before pickup")} value={resv.exclusiveBeforeMin} unit="min before" min={1} max={180} disabled={disabled} onChange={(exclusiveBeforeMin) => setResv({ exclusiveBeforeMin })} />
        </Row>
        <Row label={tr("Also goes to Radar trips")} help={tr("Example: still free at 09:45 → also in Radar on Home and in the Live list, with the Booked ride badge.")} on={resv.toRadar} disabled={off} onToggle={(toRadar) => setResv({ toRadar })}>
          <Num label={tr("Radar trips before pickup")} value={resv.radarBeforeMin} unit="min before" min={1} max={180} disabled={disabled} onChange={(radarBeforeMin) => setResv({ radarBeforeMin })} />
        </Row>
        <Row label={tr("If the driver who took it cancels")} help={`${RESERVATION_CANCEL_TO.find((item) => item.id === resv.onDriverCancel)?.help ?? ""}${resv.onDriverCancel === "byTime" ? "" : " A step closer to pickup always wins."}`}>
          <Choice label={tr("After a driver cancels")} value={resv.onDriverCancel} disabled={off} onChange={(onDriverCancel) => setResv({ onDriverCancel })} options={RESERVATION_CANCEL_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
        </Row>
        <p className="dx-note dx-resv-tie"><Users size={13} aria-hidden="true" /> <span>{tr("Two drivers take it at the same time → the first tap wins; exact same moment → the system picks one at random.")}</span></p>
        <ReservationTimelinePreview zone={zone} groups={groups} />
      </Card>

      <Card title={tr("5 · Driver start time — Smart gap")} tone="blue" icon={<Timer size={18} />} help={tr("Trip time + drive to the next pickup + spare minutes. It keeps a driver's scheduled rides apart and sends the driver off in time.")} off={!resv.on}>
        <Row label={tr("Arrive before the pickup time")} help={tr("Example: 10 min → the driver must be there at 09:50; the server tells him when to start (\"Start now\") from where he is.")}>
          <Num label={tr("Arrive before pickup, minutes")} before="arrive" value={bw.arriveEarlyMin} unit="min before" min={0} max={60} disabled={off} onChange={(arriveEarlyMin) => setBooking({ arriveEarlyMin })} />
        </Row>
        <Row label={tr("Clashing rides leave the list")} help={tr("A driver can't hold two rides at the same or a close time. They see them all, but once they take one, the others that do not fit the smart gap leave their Scheduled rides.")} on={resv.hideClashing} disabled={off} onToggle={(hideClashing) => setResv({ hideClashing })} />
        <p className="dx-note">{trn("{0} Leave now: the server takes the driver's live position and the real road route to the pickup (the same ETA as a normal ride) + spare minutes, and checks it again every 2 minutes as the driver moves. Then the ride always lands on the driver's screen as the active trip with Head to pickup, even if they were driving away.", <Clock size={13} aria-hidden="true" />)}</p>
        <Row label={tr("Late warning")} help={tr("Leave now cannot start the trip: the island says “Head to your 07:40 pickup”.")} on={resv.lateWarn} disabled={off} onToggle={(lateWarn) => setResv({ lateWarn })} />
        <Row label={tr("Trips toward the pickup before the ride")} help={tr("Like destination mode, aimed at the scheduled pickup. Every trip is checked with the smart gap, so the driver is still in time.")} on={resv.towardPickup} disabled={off} onToggle={(towardPickup) => setResv({ towardPickup })}>
          <Num label={tr("Trips toward the pickup from")} before="from" value={resv.towardPickupBeforeMin} unit="min before" min={15} max={240} disabled={disabled} onChange={(towardPickupBeforeMin) => setResv({ towardPickupBeforeMin })} />
        </Row>
        <div className="dx-sub">
          <b>{trn("{0} Times per kind of ride", <CalendarClock size={13} aria-hidden="true" />)}</b>
          <small>{tr("Be online before pickup, spare minutes in the smart gap, and two reminders to the driver. Spare minutes start at 15.")}</small>
          <ul className="dx-types" aria-label={tr("Times per kind of ride")}>
            {RIDE_TYPES.map((type) => {
              const rule = resv.types[type.id];
              return (
                <li key={type.id}>
                  <span className="dx-type-name">
                    <b>{trx(type.label)}</b>
                    <small>{trx(type.help)}</small>
                    {type.id === "long" ? <Num label={tr("Long trip from")} before="over" value={zone.longTripKm} unit="km" min={10} max={500} disabled={off} onChange={(longTripKm) => set({ longTripKm })} /> : null}
                  </span>
                  <span className="dx-type-values">
                    <Num label={tr("{0} be online before", [trx(type.label)])} before="online" value={rule.onlineBeforeMin} unit="min before" min={5} max={240} disabled={off} onChange={(onlineBeforeMin) => setType(type.id, { onlineBeforeMin })} />
                    <Num label={tr("{0} spare minutes", [trx(type.label)])} before="spare" value={rule.spareMin} unit="min" min={0} max={60} disabled={off} onChange={(spareMin) => setType(type.id, { spareMin })} />
                    <Num label={tr("{0} first reminder", [trx(type.label)])} before="reminders" value={rule.remindFirstMin} unit="min before" min={1} max={1440} disabled={off} onChange={(remindFirstMin) => setType(type.id, { remindFirstMin })} />
                    <Num label={tr("{0} second reminder", [trx(type.label)])} before="and" value={rule.remindLastMin} unit="min before" min={0} max={1440} disabled={off} onChange={(remindLastMin) => setType(type.id, { remindLastMin })} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="dx-resv-foot" aria-label={tr("Smart gap example")}>{trn("Example, normal ride: pickup {0}, 35 min trip, ends 20 min from the next pickup. With {1} spare minutes the next ride can start at {2} or later ({3} gap).{4}", clock(SAMPLE_PICKUP, 0), normal.spareMin, <b>{clock(SAMPLE_PICKUP, gap)}</b>, spanLabel(gap), <>{" "}{trn("A driver 18 min from the pickup gets Leave now {0} before pickup ({1}).", <b>{trn("{0} min", leaveNowBeforeMin(18, normal.spareMin))}</b>, clock(SAMPLE_PICKUP, -leaveNowBeforeMin(18, normal.spareMin)))}</>)}</p>
        </div>
      </Card>

      <Card title={tr("5 · Running late")} tone="red" icon={<Clock size={18} />} help={tr("From Leave now until the driver arrives, their arrival time is checked. If they would arrive more than the minutes allowed late, the ride goes to another driver early. Otherwise an online driver keeps the ride. Only an offline driver loses it, after the offline minutes.")} off={!resv.on}>
        <Row label={tr("Watch arrival time")} help={tr("Checks the driver's estimated arrival at the pickup, from Leave now until they are there.")} on={late.on} disabled={off} onToggle={(on) => setLate({ on })}>
          <Num label={tr("Minutes late allowed")} before="up to" value={late.toleranceMin} unit="min late" min={0} max={30} disabled={disabled} onChange={(toleranceMin) => setLate({ toleranceMin })} />
          <Num label={tr("Check every (seconds)")} before="every" value={late.checkEverySeconds} unit="s" min={15} max={600} disabled={disabled} onChange={(checkEverySeconds) => setLate({ checkEverySeconds })} />
        </Row>
        {late.on ? (
          <Row label={tr("Give the ride to")} help={lateTo.help}>
            <Choice label={tr("Late ride goes to")} value={late.reassignTo} disabled={off} onChange={(reassignTo) => setLate({ reassignTo })} options={LATE_ETA_REASSIGN_TO.map((item) => ({ id: item.id, label: item.label, hint: item.help }))} />
          </Row>
        ) : null}
        <Row label={tr("Offline driver loses the ride")} help={tr("Only a driver who is offline at Leave now: after these minutes the ride goes to another driver and you get an alert. An online driver keeps the ride.")}>
          <Num label={tr("Offline driver loses the ride after")} before="after" value={resv.lateBackupAfterMin} unit="min" min={1} max={60} disabled={off} onChange={(lateBackupAfterMin) => setResv({ lateBackupAfterMin })} />
        </Row>
        {late.on ? <p className="dx-resv-foot" aria-label={tr("Running late example")}>{trn("Example: pickup {0}. At {1} the driver is {2} min away, so they would arrive at {3}: more than {4} min late. The ride goes to: {5}.", clock(SAMPLE_PICKUP, 0), clock(SAMPLE_PICKUP, -10), lateAway, <b>{clock(SAMPLE_PICKUP, late.toleranceMin + 1)}</b>, late.toleranceMin, trx(lateTo.label))}</p> : null}
      </Card>

      <Card title={tr("5 · Late driver — take the ride back")} tone="red" icon={<UserX size={18} />} help={tr("The only case the system takes a ride from a driver: a booked ride he would reach too late while there is still time to find another driver. It counts on his cancel record. Drivers never pay a fee.")} off={!resv.on}>
        <Row label={tr("Take back when late more than")} help={tr("Example: 5 min → a driver who would arrive at 10:06 for a 10:00 pickup loses the ride; at 10:05 he keeps it.")}>
          <Num label={tr("Take back when late more than, minutes")} before="over" value={bw.takeBackLateMin} unit="min late" min={1} max={60} disabled={off} onChange={(takeBackLateMin) => setBooking({ takeBackLateMin })} />
        </Row>
        <Row label={tr("Keep if the driver is close")} help={tr("Example: 10 min → a driver 10 minutes' drive or less from the pickup always keeps the ride, even when late.")}>
          <Num label={tr("Keep if the driver is within, minutes' drive")} before="within" value={bw.takeBackKeepIfDriveMin} unit="min drive" min={0} max={60} disabled={off} onChange={(takeBackKeepIfDriveMin) => setBooking({ takeBackKeepIfDriveMin })} />
        </Row>
        <Row label={tr("Only while there is time")} help={tr("Example: 15 min → from 09:45 on, for a 10:00 pickup, the driver keeps the ride: there is no time to find another one.")}>
          <Num label={tr("Take back only until, minutes before pickup")} before="until" value={bw.takeBackUntilMinBeforePickup} unit="min before" min={0} max={180} disabled={off} onChange={(takeBackUntilMinBeforePickup) => setBooking({ takeBackUntilMinBeforePickup })} />
        </Row>
        <Row label={tr("“Not driving to the rider” notice")} help={tr("The driver is not heading to the pickup: he gets a notice, again every few minutes, until he heads there. The rider can then cancel for free.")} on={bw.notHeadingNotice} disabled={off} onToggle={(notHeadingNotice) => setBooking({ notHeadingNotice })}>
          <Num label={tr("Notice again every, minutes")} before="every" value={bw.notHeadingNoticeEveryMin} unit="min" min={1} max={10} disabled={disabled || !bw.notHeadingNotice} onChange={(notHeadingNoticeEveryMin) => setBooking({ notHeadingNoticeEveryMin })} />
        </Row>
        <Row label={tr("Stop a booked ride with no driver")} help={tr("No driver by the pickup time + these minutes: the ride ends, the rider pays nothing and is told, and admins get an alert.")}>
          <Num label={tr("Stop a booked ride with no driver after pickup +, minutes")} before="+" value={bw.noDriverStopAfterMin} unit="min" min={1} max={240} disabled={off} onChange={(noDriverStopAfterMin) => setBooking({ noDriverStopAfterMin })} />
        </Row>
        <Row label={tr("Take back a live ride")} help={tr("Always off: a live ride is never taken from the driver (owner rule). Read only.")} on={false} onToggle={() => undefined} disabled />
        <p className="dx-resv-foot" aria-label={tr("Late driver example")}>{trn("Example: pickup {0}, the driver is {1} min away at {2} → he would arrive at {3}, {4} min late, and the pickup is still {5} min away: {6}.", clock(SAMPLE_PICKUP, 0), 26, clock(SAMPLE_PICKUP, -20), clock(SAMPLE_PICKUP, 6), 6, 20, <b>{6 > bw.takeBackLateMin && 26 > bw.takeBackKeepIfDriveMin && 20 >= bw.takeBackUntilMinBeforePickup ? tr("taken back, sent to another driver") : tr("he keeps it")}</b>)}</p>
      </Card>

      <Card title={tr("6 · Changes, cancel and reminders")} tone="blue" icon={<Clock size={18} />} help={tr("What the rider may change or cancel, and the reminders. Example pickup 10:00.")} off={!resv.on}>
        <Row label={tr("Free change or cancel")} help={tr("Example: 60 min → the rider can change or cancel for free until 09:00; later no change, and cancel fees apply.") + " " + tr("Cancel under (min) costs the fee, even before a driver takes it. Movera keeps the fee when no driver has taken the ride yet.")}>
          <Num label={tr("Free change or cancel until, minutes before pickup")} before="until" value={bw.freeChangeBeforeMin} unit="min before" min={0} max={1440} disabled={off} onChange={(freeChangeBeforeMin) => setBooking({ freeChangeBeforeMin })} />
        </Row>
        <Row label={tr("Rider changes a ride a driver took")} help={tr("Example: the rider moves 10:00 to 11:00 → the driver is asked \"Keep it at the new time?\"; no answer within 15 min → back to the list.")}>
          <Num label={tr("Time for the driver to answer, minutes")} before="within" value={bw.changeAnswerMin} unit="min" min={1} max={120} disabled={off} onChange={(changeAnswerMin) => setBooking({ changeAnswerMin })} />
        </Row>
        <Row label={tr("Rider reminder")} help={tr("Example: 60 min → the rider gets a reminder at 09:00. 0 = no reminder.")}>
          <Num label={tr("Rider reminder, minutes before pickup")} before="at" value={bw.riderReminderMin} unit="min before" min={0} max={1440} disabled={off} onChange={(riderReminderMin) => setBooking({ riderReminderMin })} />
        </Row>
      </Card>

      <Card title={tr("6 · Cancels")} tone="red" icon={<UserX size={18} />} help={tr("Drivers never pay a fee when they cancel. Every driver cancel counts in the driver's cancel rate.")} off={!resv.on}>
        <p className="dx-note">{trn("Rider free cancel and late cancel fees per car type: see Rider cancel fees in Rides & stops. {0}", <button data-command="admin.dispatch.view" type="button" className="dash-btn small ghost" onClick={onOpenCancelFees}>{tr("Open Rider cancel fees")}</button>)}</p>
        <Row label={tr("A driver's late cancel")} help={tr("A driver cancel this close to pickup is a late cancel. The driver still pays nothing.")}>
          <Num label={tr("Driver late cancel, hours before pickup")} before="under" value={resv.driverLateCancelHours} unit="h before pickup" step={0.5} min={0.5} max={72} disabled={off} onChange={(driverLateCancelHours) => setResv({ driverLateCancelHours })} />
        </Row>
        <Row label={tr("Pause scheduled rides after late cancels")} help={tr("Too many late cancels in the period: the driver can't get scheduled rides for the days you set.")} on={resv.latePause} disabled={off} onToggle={(latePause) => setResv({ latePause })}>
          <Num label={tr("Late cancels before a pause")} value={resv.latePauseAfter} unit="late cancels" min={1} max={20} disabled={disabled} onChange={(latePauseAfter) => setResv({ latePauseAfter })} />
          <Num label={tr("Late cancels counted over days")} before="in" value={resv.latePeriodDays} unit="days" min={1} max={90} disabled={disabled} onChange={(latePeriodDays) => setResv({ latePeriodDays })} />
          <Num label={tr("Scheduled rides paused for days")} before="pause" value={resv.latePauseDays} unit="days" min={1} max={365} disabled={disabled} onChange={(latePauseDays) => setResv({ latePauseDays })} />
        </Row>
        <p className="dx-note">{trn("{0} Drivers never pay. Every driver cancel counts in the cancel rate{1}.", <UserX size={13} aria-hidden="true" />, resv.latePause ? tr("; {0} late cancel{1} in {2} days pause scheduled rides for {3} days", [resv.latePauseAfter, resv.latePauseAfter === 1 ? "" : "s", resv.latePeriodDays, resv.latePauseDays]) : "")}</p>
      </Card>

      <Card title={tr("7 · Pickup")} tone="green" icon={<UserCheck size={18} />} help={tr("Example pickup 10:00: free waiting counts from 10:00, not from when the driver arrives. A no-show is possible only after 10:00 + the free waiting.")} off={!resv.on}>
        {/* Owner D (v0.18.19): a fixed rule now; the field is kept. */}
        <Row label={tr("Rider sees the driver at once")} help={tr("Fixed rule: the rider sees \"Driver assigned\" when a driver takes the ride, and the name, photo and car when the driver starts driving to the pickup.")} on={false} disabled onToggle={(showDriverOnAccept) => setResv({ showDriverOnAccept })} />
      </Card>

      <Card title={tr("8 · No driver near pickup")} tone="orange" icon={<Bell size={18} />} help={tr("Nobody took it and pickup is close.")} off={!resv.on}>
        <Row label={tr("No driver close to pickup")} help={tr("Example: 10 min → still no driver at 09:50: you get an alert and the rider is told; the search goes on, after 10:00 too.")}>
          <Num label={tr("No-driver alert, minutes before pickup")} before="at" value={bw.noDriverAlertMin} unit="min before" min={1} max={120} disabled={off} onChange={(noDriverAlertMin) => setBooking({ noDriverAlertMin })} />
        </Row>
        <Row label={tr("Admin alert")} help={tr("The ride shows in Live and in Alerts as “Booked ride soon with no driver”, so you can give it to a driver.")}>
          <Link className="dash-btn small ghost" to="/alerts">{tr("Alert times in Alerts")}</Link>
        </Row>
        <Row label={tr("Raise the driver's fare")} help={tr("Paid from Movera's commission. The rider pays the same. Never more than {0} in {1}{2}.", [money(cap), countryName, countryId === "SE" ? "" : " (500 kr in Sweden)"])} on={resv.raiseFare} disabled={off} onToggle={(raiseFare) => setResv({ raiseFare })}>
          <Num label={tr("Highest fare raise")} before="up to" value={resv.raiseMax} unit={symbol} step={0.5} min={0} max={cap} disabled={disabled} onChange={(raiseMax) => setResv({ raiseMax })} />
        </Row>
        {resv.raiseFare ? (
          <div className="dx-sub" role="group" aria-label={tr("Try a raise")}>
            <b>{trn("{0} Try a raise", <TrendingUp size={13} aria-hidden="true" />)}</b>
            <small>{trn("Sample booked ride {0}. Movera's commission here is {1}% = {2} (set in Pricing).", money(sampleFare), commissionPct, money(split.commission))}</small>
            <span className="dx-resv-pick">
              <Num label={tr("Sample raise")} before="raise by" value={tryRaise} unit={symbol} step={0.5} min={0} max={cap} onChange={setTryRaise} />
            </span>
            {split.beyond > 0
              ? <p className="dx-note warn" role="status"><AlertTriangle size={13} aria-hidden="true" /> <span>{trn("Goes {0} beyond Movera's commission. Movera pays the difference.", <b>{money(split.beyond)}</b>)}</span></p>
              : <p className="dx-note" role="status"><TrendingUp size={13} aria-hidden="true" /> <span>{trn("All from Movera's commission. {0} of the commission is left.", money(split.commission - split.fromCommission))}</span></p>}
            {tryRaise > resv.raiseMax ? <p className="dx-note warn">{trn("{0} Above your highest raise ({1}), so it cannot be used.", <AlertTriangle size={13} aria-hidden="true" />, money(resv.raiseMax))}</p> : null}
          </div>
        ) : null}
      </Card>

      <Card title={tr("8 · Movera gives a ride to a driver")} tone="blue" icon={<UserCheck size={18} />} help={tr("From a reservation's page you can give the ride to one driver. The driver must accept.")} off={!resv.on}>
        <Row label={tr("Time to accept")} help={tr("It comes like an Exclusive: “Assigned by Movera”, with Accept and a timer. Not accepted: you see it on the reservation and pick someone else.")}>
          <Num label={tr("Time to accept a ride assigned by Movera")} value={resv.assignAcceptSec} unit="s" min={10} max={600} disabled={off} onChange={(assignAcceptSec) => setResv({ assignAcceptSec })} />
        </Row>
      </Card>

      <Card title={tr("Coming soon")} tone="blue" icon={<Users size={18} />} help={tr("These settings are kept but not used yet.")} off={!resv.on}>
        {/* Owner E (v0.18.19): no early auto-assign and no backup driver yet; kept, shown as Coming soon. */}
        <Row label={tr("Give the ride to a driver early")} help={tr("Coming soon")} on={resv.assignEarly} disabled onToggle={(assignEarly) => setResv({ assignEarly })}>
          <Num label={tr("Assign hours before")} value={resv.assignHoursBefore} unit="h before" min={1} max={72} disabled onChange={(assignHoursBefore) => setResv({ assignHoursBefore })} />
        </Row>
        <Row label={tr("Backup driver")} help={tr("Coming soon")} on={resv.backup} disabled onToggle={(backup) => setResv({ backup })} />
      </Card>

      <BookingPolicyCard />
    </div>
  );
}
