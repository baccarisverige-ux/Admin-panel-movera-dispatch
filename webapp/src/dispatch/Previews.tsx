import { useState } from "react";
import { AlertTriangle, CalendarClock, Car, Clock, Flag, Home, List, MapPin, Navigation, Radar, Route, ShieldCheck, Sparkles, Star, Target, TrendingUp, UserCheck, UserRound, Users, X } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { Choice } from "./fields";
import { riderSeesLine } from "./cancelFees";
import {
  EXTRAS, homePopupSkippedBelowMin, leaveNowBeforeMin, RESERVATION_STEP_LABEL, reservationTimeline, stepAfterDriverCancel, WAIT_KINDS,
  type DriverGroup, type OfferMode, type ReservationTimelineStep, type ZoneDispatch,
} from "./rules";
import { tr, trn, trx, trSentences, uiLocale } from "../i18n";

/** How the rules look on the phones: the driver's offer card and the rider's waiting screen. */

const SAMPLE: Record<MarketId, { pickup: string; stop: string; drop: string; area: string; price: number }> = {
  SE: { pickup: "Drottninggatan 50", stop: "Sveavägen 20", drop: "Odengatan 32", area: "Vasastan", price: 189 },
  FR: { pickup: "Rue de Rivoli 40", stop: "Place de la Bourse", drop: "Rue de Dunkerque 18", area: "10e arrondissement", price: 18 },
  TN: { pickup: "Avenue Habib Bourguiba", stop: "Place Barcelone", drop: "Rue du Lac Biwa", area: "Lac 2", price: 12 },
};

type OfferView = "popup" | "full" | "offer" | "driving";

export function DriverOfferPreview({ zone, money, country, commissionPct = 20 }: { zone: ZoneDispatch; money: (value: number) => string; country: MarketId; commissionPct?: number }) {
  const sample = SAMPLE[country];
  const first: OfferMode = zone.radar.on ? "radar" : "exclusive";
  const [mode, setMode] = useState<OfferMode>(first);
  const shown: OfferMode = zone[mode].on ? mode : first;
  const [view, setView] = useState<OfferView>("popup");
  const app = zone.radarApp;
  const card = zone.offerCard;
  const driving = zone.exclusiveWhileDriving;
  const radarView: OfferView = view === "popup" && !app.popupOn ? (app.fullOn ? "full" : "popup") : view === "full" && !app.fullOn ? "popup" : view === "full" ? "full" : "popup";
  const exclusiveView: OfferView = view === "driving" ? "driving" : "offer";
  const current: OfferView = shown === "radar" ? radarView : exclusiveView;
  const stack = shown === "radar" ? app.popup : current === "driving" ? (driving.on ? driving.count : 0) : 1;
  const seconds = shown === "radar" ? zone.radar.seconds : zone.exclusive.seconds;
  const badges = card.badges ? zone.extras.filter((extra) => extra.on && extra.badge && (extra.id === "child_seat" || extra.id === "long_trip")).map((extra) => EXTRAS.find((item) => item.id === extra.id)!.badge) : [];
  const stops = card.stops && zone.stops.on ? Math.min(1, zone.stops.max) : 0;
  const fare = card.netFare ? Math.round(sample.price * (1 - commissionPct / 100) * 100) / 100 : sample.price;
  return (
    <figure className="dp-phone dx-phone" aria-label={tr("Driver offer preview")}>
      <div className="ra-switch" role="tablist" aria-label={tr("Offer type")}>
        <button data-command="admin.dispatch.view" type="button" role="tab" aria-selected={shown === "radar"} className={shown === "radar" ? "active" : undefined} disabled={!zone.radar.on} onClick={() => { setMode("radar"); setView("popup"); }}>{tr("Radar")}</button>
        <button data-command="admin.dispatch.view" type="button" role="tab" aria-selected={shown === "exclusive"} className={shown === "exclusive" ? "active" : undefined} disabled={!zone.exclusive.on} onClick={() => { setMode("exclusive"); setView("offer"); }}>{tr("Exclusive")}</button>
      </div>
      {shown === "radar" ? (
        <div className="dx-step-pick" role="group" aria-label={tr("Radar screen")}>
          <button data-command="admin.dispatch.view" type="button" aria-pressed={current === "popup"} className={current === "popup" ? "on" : undefined} disabled={!app.popupOn} onClick={() => setView("popup")}>{tr("Popup")}</button>
          <button data-command="admin.dispatch.view" type="button" aria-pressed={current === "full"} className={current === "full" ? "on" : undefined} disabled={!app.fullOn} onClick={() => setView("full")}>{tr("Full screen")}</button>
        </div>
      ) : (
        <div className="dx-step-pick" role="group" aria-label={tr("Exclusive screen")}>
          <button data-command="admin.dispatch.view" type="button" aria-pressed={current === "offer"} className={current === "offer" ? "on" : undefined} onClick={() => setView("offer")}>{tr("Offer")}</button>
          <button data-command="admin.dispatch.view" type="button" aria-pressed={current === "driving"} className={current === "driving" ? "on" : undefined} onClick={() => setView("driving")}>{tr("While driving")}</button>
        </div>
      )}
      <div className="dp-screen">
        <div className="dp-status"><span>9:41</span><span className="ra-notch" aria-hidden="true" /><span>5G</span></div>
        {shown === "radar" && current === "full" ? (
          <div className="dx-radar-full" aria-label={tr("Full-screen radar")}>
            <b>{trn("{0} Radar · {1} offers max", <Radar size={13} aria-hidden="true" />, app.full)}</b>
            <ul>
              {Array.from({ length: Math.min(app.full, 6) }, (_, index) => (
                <li key={index}><span><b>{money(Math.round(fare * (1 - index * 0.07)))}</b><small>{card.pickupDistance ? tr("{0} km · {1} min to pickup", [(0.8 + index * 0.6).toFixed(1), 2 + index]) : card.pickupAddress ? sample.pickup : tr("Pickup nearby")}</small></span><i>{trn("{0}s", seconds)}</i></li>
              ))}
            </ul>
            {app.full > 6 ? <small>{trn("+{0} more when you scroll", app.full - 6)}</small> : null}
          </div>
        ) : null}
        {current === "driving" && !stack ? <p className="dx-radar-off">{tr("No offers while driving a rider in this zone.")}</p> : null}
        <svg className="dp-map" viewBox="0 0 242 476" aria-hidden="true">
          <rect width="242" height="476" fill="#17222d" />
          <path d="M0 120H242M0 260H242M70 0V476M170 0V476" stroke="#2a3a48" strokeWidth="9" />
          {shown === "radar" ? [40, 70, 100].map((r) => <circle key={r} cx="121" cy="170" r={r} fill="none" stroke="#9b87f5" strokeOpacity={0.5 - r / 300} strokeWidth="2" />) : null}
          <circle cx="121" cy="170" r="8" fill="#e34948" stroke="#fff" strokeWidth="3" />
          <circle cx="70" cy="245" r="11" fill="#215277" stroke="#fff" strokeWidth="3" />
        </svg>
        {stack > 1 ? <span className="dx-offer-stack" aria-label={tr("{0} offers stacked", [stack])}>{Array.from({ length: Math.min(stack - 1, 3) }, (_, index) => <i key={index} style={{ bottom: `${16 + (index + 1) * 7}px`, left: `${14 + (index + 1) * 6}px`, right: `${14 + (index + 1) * 6}px` }} />)}</span> : null}
        {current !== "full" && stack ? <div className={`dx-offer ${shown}`} aria-label={tr("Offer card")}>
          <div className="dx-offer-top">
            <span className={`dx-mode-tag ${shown}`}>{shown === "radar" ? <>{trn("{0} Radar · {1} drivers see it", <Radar size={11} aria-hidden="true" />, zone.radar.drivers)}</> : <><Target size={11} aria-hidden="true" /> {tr("Exclusive")}</>}</span>
            <span className="dx-offer-timer" aria-label={tr("{0} seconds to accept", [seconds])}>{trn("{0}s", seconds)}</span>
          </div>
          <b className="dx-offer-price">{money(fare)}{card.netFare ? <small className="dx-offer-net">{" "}{tr("your share")}</small> : null}</b>
          {/* v0.18.6 (owner decision 3): the rider's real average with one decimal; nothing for a rider with no rating. */}
          {card.riderRating ? <span className="dx-offer-line" data-testid="preview-rider-rating">{trn("{0} {1} rider rating", <Star size={11} aria-hidden="true" />, (4.8).toLocaleString(uiLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}</span> : null}
          {card.pickupDistance ? <span className="dx-offer-line">{trn("{0} 1.8 km · 4 min to pickup", <Navigation size={11} aria-hidden="true" />)}</span> : null}
          <span className="dx-offer-line"><MapPin size={11} aria-hidden="true" /> {card.pickupAddress ? tr("Pickup: {0}", [sample.pickup]) : tr("Pickup nearby")}</span>
          {stops ? <span className="dx-offer-line">{trn("{0} 1 stop{1}", <Route size={11} aria-hidden="true" />, card.pickupAddress ? `: ${sample.stop}` : "")}</span> : null}
          <span className="dx-offer-line"><Flag size={11} aria-hidden="true" /> {card.dropoffAreaOnly ? tr("Drop-off area: {0}", [sample.area]) : tr("Drop-off: {0}", [sample.drop])}{card.tripMinutesKm ? tr(" · 18 min · 6.2 km") : ""}</span>
          {badges.length ? <span className="dx-offer-badges">{badges.map((badge) => <i key={badge}>{badge}</i>)}</span> : null}
          <span className="dx-offer-actions">
            <span className="no"><X size={12} aria-hidden="true" /> {shown === "radar" ? tr("Skip") : tr("No")}</span>
            <span className="yes">{tr("Accept")}</span>
          </span>
          <i className="dx-offer-bar" aria-hidden="true" />
          {stack > 1 && current !== "driving" ? <span className="dx-offer-more">{trn("1 of {0} offers", stack)}</span> : null}
          {current === "driving" ? <span className="dx-offer-more">{trn("Next ride · you are driving a rider{0}", stack > 1 ? tr(" · up to {0}", [stack]) : "")}</span> : null}
        </div> : null}
      </div>
      <figcaption>{shown === "radar" ? tr("Driver app · Radar {0}", [current === "full" ? tr("full screen") : tr("popup")]) : current === "driving" ? tr("Driver app · Exclusive while driving") : tr("Driver app · Exclusive offer")}</figcaption>
    </figure>
  );
}

export function RiderWaitingPreview({ zone }: { zone: ZoneDispatch }) {
  const steps = zone.waiting.filter((step) => step.on).sort((a, b) => a.afterMin - b.afterMin);
  const [pick, setPick] = useState<string | null>(null);
  const step = steps.find((item) => item.id === pick) ?? steps[0] ?? null;
  const label = step ? WAIT_KINDS.find((item) => item.id === step.kind)?.label ?? "" : "";
  return (
    <figure className="dp-phone dx-phone" aria-label={tr("Rider waiting preview")}>
      <div className="dx-step-pick" role="group" aria-label={tr("Waiting step to show")}>
        {steps.map((item) => (
          <button data-command="admin.dispatch.view" key={item.id} type="button" aria-pressed={item.id === step?.id} className={item.id === step?.id ? "on" : undefined} onClick={() => setPick(item.id)}>{trn("{0} min", item.afterMin)}</button>
        ))}
      </div>
      <div className="dp-screen dx-rider">
        <div className="dp-status"><span>9:41</span><span className="ra-notch" aria-hidden="true" /><span>5G</span></div>
        <div className="dx-rider-map" aria-hidden="true">
          <span className="dx-pulse" />
        </div>
        <div className="dx-rider-sheet" aria-label={tr("Rider screen")}>
          <span className="dx-rider-wait">{trn("{0} Looking for a driver{1}", <Clock size={12} aria-hidden="true" />, step ? tr(" · {0} min", [step.afterMin]) : "")}</span>
          {step ? (
            <>
              <b>{trx(label)}</b>
              <p>{trSentences(step.message)}</p>
              {step.kind === "raise_price" ? <span className="dx-rider-btn">{trn("{0} Raise my price", <TrendingUp size={12} aria-hidden="true" />)}</span> : null}
              {step.kind === "upgrade" ? <span className="dx-rider-row"><span className="dx-rider-btn">{trn("{0} Priority", <Sparkles size={12} aria-hidden="true" />)}</span><span className="dx-rider-btn ghost">{tr("Comfort")}</span></span> : null}
              {step.kind === "keep_waiting" ? <span className="dx-rider-row"><span className="dx-rider-btn">{trn("Wait {0} more min", step.extraMin ?? 3)}</span><span className="dx-rider-btn ghost">{tr("Stop")}</span></span> : null}
              {step.kind === "alert_admin" ? <span className="dx-rider-row">{trn("{0} Our team is helping you.", <Users size={12} aria-hidden="true" />)}</span> : null}
              {step.kind === "busy" ? <span className="dx-rider-btn ghost">{tr("Try again later")}</span> : null}
            </>
          ) : <p>{tr("No message is on. The rider only sees “Looking for a driver”.")}</p>}
          <span className="dx-rider-cancel">{tr("Cancel request")}</span>
        </div>
      </div>
      <figcaption>{tr("Rider app · while waiting")}</figcaption>
    </figure>
  );
}

/** "10 min", "2 h 40 min", "1 day". */
export function spanLabel(minutes: number): string {
  const value = Math.max(0, Math.round(minutes));
  if (value < 60) return `${value} min`;
  if (value % 1440 === 0) return value === 1440 ? "1 day" : `${value / 1440} days`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const SAMPLE_LEADS = [
  { id: "30", get label() { return tr("30 min"); } },
  { id: "60", get label() { return tr("1 h"); } },
  { id: "180", get label() { return tr("3 h"); } },
  { id: "1440", get label() { return tr("1 day"); } },
] as const;

const STEP_ICON: Record<ReservationTimelineStep["id"], typeof Radar> = { list: List, home: Home, exclusive: Target, radar: Radar, pickup: Flag };

/** A sample reservation nobody takes, step by step, with the zone's settings. */
export function ReservationTimelinePreview({ zone, groups = [] }: { zone: ZoneDispatch; groups?: readonly DriverGroup[] }) {
  const [lead, setLead] = useState<(typeof SAMPLE_LEADS)[number]["id"]>("180");
  const minutes = Number(lead);
  const steps = reservationTimeline(zone, minutes, groups);
  const cancelBefore = Math.round(minutes / 3);
  const back = stepAfterDriverCancel(zone, minutes - cancelBefore, cancelBefore);
  const skipBelow = homePopupSkippedBelowMin(zone);
  return (
    <div className={zone.reservation.on ? "dx-sub dx-resv" : "dx-sub dx-resv off"} role="group" aria-label={tr("Reservation timeline")}>
      <b>{trn("{0} Step by step, if nobody takes it", <CalendarClock size={13} aria-hidden="true" />)}</b>
      <span className="dx-resv-pick">
        <small>{tr("Sample ride booked")}</small>
        <Choice label={tr("Sample booking")} value={lead} onChange={setLead} options={SAMPLE_LEADS.map((item) => ({ id: item.id, label: item.label }))} />
        <small>{tr("before pickup")}</small>
      </span>
      <ol className="dx-resv-flow" aria-label={tr("Reservation steps")}>
        {steps.map((step) => {
          const Icon = STEP_ICON[step.id];
          return (
            <li key={step.id} className={step.skipped ? `${step.id} skipped` : step.id}>
              <span className="dx-resv-time">
                {step.skipped ? "—" : step.id === "list" ? tr("Booked") : `+${spanLabel(step.afterBookedMin)}`}
                {step.skipped ? null : <small>{step.beforePickupMin ? tr("{0} before", [spanLabel(step.beforePickupMin)]) : tr("pickup")}</small>}
              </span>
              <span className="dx-resv-icon" aria-hidden="true"><Icon size={13} /></span>
              <span><b>{trx(step.title)}</b><small>{step.skipped ?? trx(step.detail)}</small></span>
            </li>
          );
        })}
      </ol>
      <p className="dx-resv-foot">{trn("When a driver takes it, it disappears at once from every other driver's app. If that driver cancels {0} before pickup, it goes back out as {1}.{2}", spanLabel(cancelBefore), <b>{trx(RESERVATION_STEP_LABEL[back])}</b>, skipBelow !== null ? <>{" "}{trn("Rides booked less than {0} before pickup skip the Home popup.", spanLabel(skipBelow))}</> : null)}</p>
    </div>
  );
}

type ResvView = "popup" | "assigned" | "leave" | "late";

const RESV_VIEWS: { id: ResvView; label: string }[] = [
  { id: "popup", get label() { return tr("Home popup"); } },
  { id: "assigned", get label() { return tr("Assigned by Movera"); } },
  { id: "leave", get label() { return tr("Leave now"); } },
  { id: "late", get label() { return tr("Late"); } },
];

/** A scheduled ride on the driver's phone: the Home popup, a ride given by Movera, Leave now and the late warning. */
export function ReservationDriverPreview({ zone, money, country }: { zone: ZoneDispatch; money: (value: number) => string; country: MarketId }) {
  const sample = SAMPLE[country];
  const resv = zone.reservation;
  const [view, setView] = useState<ResvView>("popup");
  const shown: ResvView = view === "popup" && !resv.homePopup ? "assigned" : view === "late" && !resv.lateWarn ? "assigned" : view;
  const spare = resv.types.normal.spareMin;
  const drive = 18;
  const leave = leaveNowBeforeMin(drive, spare);
  const card = zone.offerCard;
  const price = money(Math.round(sample.price * 2.6 * (card.netFare ? 0.8 : 1)));
  const pickup = card.pickupAddress ? `Pickup: ${sample.pickup}` : "Pickup nearby";
  const drop = card.dropoffAreaOnly ? `Drop-off area: ${sample.area}` : `Drop-off: ${sample.drop}`;
  return (
    <figure className="dp-phone dx-phone" aria-label={tr("Driver reservation preview")}>
      <div className="dx-step-pick" role="group" aria-label={tr("Reservation screen")}>
        {RESV_VIEWS.map((item) => {
          const able = item.id === "popup" ? resv.homePopup : item.id === "late" ? resv.lateWarn : true;
          return <button data-command="admin.dispatch.view" key={item.id} type="button" aria-pressed={shown === item.id} className={shown === item.id ? "on" : undefined} disabled={!able} onClick={() => setView(item.id)}>{trx(item.label)}</button>;
        })}
      </div>
      <div className="dp-screen">
        <div className="dp-status"><span>9:41</span><span className="ra-notch" aria-hidden="true" /><span>5G</span></div>
        <svg className="dp-map" viewBox="0 0 242 476" aria-hidden="true">
          <rect width="242" height="476" fill="#17222d" />
          <path d="M0 120H242M0 260H242M70 0V476M170 0V476" stroke="#2a3a48" strokeWidth="9" />
          {shown === "leave" || shown === "late" ? <path d="M70 245 L70 170 L121 170" fill="none" stroke="#2a78d6" strokeWidth="5" strokeLinecap="round" /> : null}
          <circle cx="121" cy="170" r="8" fill="#e34948" stroke="#fff" strokeWidth="3" />
          <circle cx="70" cy="245" r="11" fill="#215277" stroke="#fff" strokeWidth="3" />
        </svg>
        {!resv.on ? <p className="dx-radar-off">{tr("Reservations are off in this zone.")}</p> : null}
        {resv.on && (shown === "leave" || shown === "late") ? (
          <span className={shown === "late" ? "dx-island late" : "dx-island"} aria-label={tr("Island")}>
            {shown === "late" ? <>{trn("{0} Head to your 07:40 pickup", <AlertTriangle size={11} aria-hidden="true" />)}</> : <>{trn("{0} Leave now · 07:40 pickup", <Navigation size={11} aria-hidden="true" />)}</>}
          </span>
        ) : null}
        {resv.on && shown === "popup" ? (
          <div className="dx-offer reservation" aria-label={tr("Offer card")}>
            <div className="dx-offer-top">
              <span className="dx-mode-tag resv">{trn("{0} Scheduled ride · Tomorrow 07:40", <CalendarClock size={11} aria-hidden="true" />)}</span>
              <span className="dx-offer-x" aria-hidden="true"><X size={12} /></span>
            </div>
            <b className="dx-offer-price">{price}</b>
            <span className="dx-offer-line"><MapPin size={11} aria-hidden="true" /> {pickup}</span>
            <span className="dx-offer-line"><Flag size={11} aria-hidden="true" /> {drop}</span>
            <span className="dx-offer-actions single"><span className="yes">{tr("Take it")}</span></span>
            <span className="dx-offer-more">{resv.homePopupTo === "zone" || resv.listTo === "all" ? tr("Shown to every online driver in the zone") : tr("Shown to the same drivers as the list")}</span>
            {resv.popupClosedExclusive && resv.toExclusive ? <span className="dx-offer-more soft">{tr("× closes it. If nobody takes it, it can come back as Exclusive.")}</span> : null}
          </div>
        ) : null}
        {resv.on && shown === "assigned" ? (
          <div className="dx-offer exclusive" aria-label={tr("Offer card")}>
            <div className="dx-offer-top">
              <span className="dx-mode-tag exclusive">{trn("{0} Assigned by Movera", <ShieldCheck size={11} aria-hidden="true" />)}</span>
              <span className="dx-offer-timer" aria-label={tr("{0} seconds to accept", [resv.assignAcceptSec])}>{trn("{0}s", resv.assignAcceptSec)}</span>
            </div>
            <span className="dx-offer-line">{trn("{0} Scheduled ride · Tomorrow 07:40", <CalendarClock size={11} aria-hidden="true" />)}</span>
            <b className="dx-offer-price">{price}</b>
            <span className="dx-offer-line"><MapPin size={11} aria-hidden="true" /> {pickup}</span>
            <span className="dx-offer-line"><Flag size={11} aria-hidden="true" /> {drop}</span>
            <span className="dx-offer-actions">
              <span className="no">{trn("{0} No", <X size={12} aria-hidden="true" />)}</span>
              <span className="yes">{tr("Accept")}</span>
            </span>
            <i className="dx-offer-bar" aria-hidden="true" />
          </div>
        ) : null}
        {resv.on && (shown === "leave" || shown === "late") ? (
          <div className="dx-offer trip" aria-label={tr("Trip sheet")}>
            <span className="dx-offer-line">{trn("{0} Scheduled ride · 07:40", <CalendarClock size={11} aria-hidden="true" />)}</span>
            <b>{sample.pickup}</b>
            <span className="dx-offer-line">{trn("{0} {1} min drive + {2} min spare = leave {3} min before", <Clock size={11} aria-hidden="true" />, drive, spare, leave)}</span>
            <span className="dx-offer-actions single"><span className="yes">{trn("{0} Head to pickup", <Navigation size={12} aria-hidden="true" />)}</span></span>
            {shown === "late" ? <span className="dx-offer-more warn">{trn("Offline: another driver gets it in {0} min", resv.lateBackupAfterMin)}</span> : null}
          </div>
        ) : null}
      </div>
      <figcaption>{trn("Driver app · {0}", trx(RESV_VIEWS.find((item) => item.id === shown)?.label))}</figcaption>
    </figure>
  );
}

/** The rider's booked ride: the driver right after accepting, and the free cancel time. */
export function ReservationRiderPreview({ zone, money, country, fare }: { zone: ZoneDispatch; money: (value: number) => string; country: MarketId; fare: number }) {
  const resv = zone.reservation;
  const cancel = riderSeesLine("reservation", resv.riderFees.economy, fare, country, money, 7 * 60 + 40);
  return (
    <figure className="dp-phone dx-phone" aria-label={tr("Rider reservation preview")}>
      <div className="dp-screen dx-rider">
        <div className="dp-status"><span>9:41</span><span className="ra-notch" aria-hidden="true" /><span>5G</span></div>
        <div className="dx-rider-map" aria-hidden="true" />
        <div className="dx-rider-sheet" aria-label={tr("Rider screen")}>
          <span className="dx-rider-wait">{trn("{0} Booked · Tomorrow 07:40", <CalendarClock size={12} aria-hidden="true" />)}</span>
          {resv.showDriverOnAccept ? (
            <>
              <b>{trn("{0} Your driver", <UserCheck size={13} aria-hidden="true" />)}</b>
              <span className="dx-rider-driver">
                <span className="dx-avatar" aria-hidden="true"><UserRound size={16} /></span>
                <span><b>{trn("Erik · {0} 4.9", <Star size={10} aria-hidden="true" />)}</b><small>{trn("{0} Volvo XC60 · ABC 123", <Car size={10} aria-hidden="true" />)}</small></span>
              </span>
              <p>{tr("Shown as soon as a driver accepts. If the driver changes, you see the new one.")}</p>
            </>
          ) : (
            <>
              <b>{tr("Driver found")}</b>
              <p>{tr("You see your driver's name, photo and car when they head to the pickup.")}</p>
            </>
          )}
          <span className="dx-rider-cancel">{cancel.line.replace(" · no fee after", "")}</span>
        </div>
      </div>
      <figcaption>{tr("Rider app · booked ride")}</figcaption>
    </figure>
  );
}
