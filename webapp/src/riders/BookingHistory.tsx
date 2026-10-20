import { Fragment, useState } from "react";
import { Link } from "react-router";
import { AlertOctagon, CalendarClock, CheckCircle2, ChevronDown, CircleSlash, Clock, Navigation, RotateCcw, UserX, XCircle } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { market } from "../markets/markets";
import { BOOKING_LABEL, bookingCounts, categoryName, type Booking, type BookingStatus } from "./profile";
import { money } from "./ui";
import { tr, trn, uiLocale, trx } from "../i18n";

const ICON: Record<BookingStatus, typeof CheckCircle2> = {
  completed: CheckCircle2,
  cancelled_rider: XCircle,
  cancelled_driver: CircleSlash,
  no_show: UserX,
  interrupted: AlertOctagon,
  in_progress: Navigation,
  scheduled: CalendarClock,
};

const ORDER: (BookingStatus | "all")[] = ["all", "completed", "cancelled_rider", "cancelled_driver", "no_show", "interrupted", "in_progress", "scheduled"];

type Props = {
  bookings: Booking[];
  country: MarketId;
  refunded: (bookingId: string) => number;
  onRefund?: (booking: Booking) => void;
  limit?: number;
};

/** Every booking with its outcome, filterable by case: completed, cancelled, no-show, interrupted… */
export function BookingHistory({ bookings, country, refunded, onRefund, limit }: Props) {
  const [filter, setFilter] = useState<BookingStatus | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(limit ?? 25);
  const counts = bookingCounts(bookings);
  const { timeZone } = market(country);
  const format = new Intl.DateTimeFormat(uiLocale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  const list = bookings.filter((booking) => filter === "all" || booking.status === filter);
  return (
    <div className="rd-history">
      {limit ? null : (
        <div className="rd-history-filters" role="group" aria-label={tr("Booking outcome")}>
          {ORDER.map((id) => (
            <button data-command="admin.table.filter" key={id} type="button" aria-pressed={filter === id} className={`rd-hf s-${id}${filter === id ? " active" : ""}`} disabled={id !== "all" && !counts[id]} onClick={() => { setFilter(id); setShown(25); }}>
              {id === "all" ? tr("All bookings") : trx(BOOKING_LABEL[id])}<span>{counts[id]}</span>
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? <p className="state-line">{tr("No booking here yet.")}</p> : (
        <ol className="rd-bookings" aria-label={tr("Booking history")}>
          {list.slice(0, shown).map((booking) => {
            const Icon = ICON[booking.status];
            const back = refunded(booking.id);
            const isOpen = open === booking.id;
            return (
              <Fragment key={booking.id}>
                <li className={`rd-booking s-${booking.status}${isOpen ? " open" : ""}`}>
                  <button data-command="admin.rider.tab" type="button" className="rd-booking-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : booking.id)}>
                    <span className="rd-b-icon" aria-hidden="true"><Icon size={16} /></span>
                    <span className="rd-b-when">{format.format(booking.at)}<small>{booking.id}</small></span>
                    <span className="rd-b-route"><span className="rd-b-line">{booking.from} <i aria-hidden="true">→</i> {booking.to}</span><small>{trn("{0} · {1} km · {2} min{3}", categoryName(booking.category), booking.km, booking.minutes, booking.driverName ? ` · ${booking.driverName}` : "")}</small></span>
                    <span className={`rd-b-status s-${booking.status}`}>{trx(BOOKING_LABEL[booking.status])}</span>
                    <span className="rd-b-fare">{booking.fareMinor ? money(booking.fareMinor, country) : "—"}{back ? <small>{trn("−{0} refunded", money(Math.round(back * market(country).minorUnits), country))}</small> : null}</span>
                    <ChevronDown size={15} aria-hidden="true" className="rd-b-chev" />
                  </button>
                  {isOpen ? (
                    <div className="rd-booking-more">
                      <dl>
                        <div><dt>{tr("Outcome")}</dt><dd>{trx(BOOKING_LABEL[booking.status])}{booking.reason ? ` · ${booking.reason}` : ""}</dd></div>
                        <div><dt>{tr("Route")}</dt><dd>{booking.from} → {booking.to}</dd></div>
                        <div><dt>{tr("Category")}</dt><dd>{categoryName(booking.category)}</dd></div>
                        <div><dt>{tr("Distance and time")}</dt><dd>{trn("{0} km · {1} min", booking.km, booking.minutes)}</dd></div>
                        <div><dt>{tr("Driver")}</dt><dd>{booking.driverId ? <Link to={`/drivers/${booking.driverId}`}>{booking.driverName}</Link> : tr("No driver")}</dd></div>
                        <div><dt>{tr("Paid")}</dt><dd>{booking.fareMinor ? `${money(booking.fareMinor, country)} · ${booking.payment}` : tr("Nothing charged")}{booking.promo ? tr(" · promotion used") : ""}</dd></div>
                        <div><dt>{tr("Movera fee")}</dt><dd>{booking.feeMinor ? money(booking.feeMinor, country) : "—"}</dd></div>
                        <div><dt>{tr("Rider's rating")}</dt><dd>{booking.ratingGiven ? tr("{0} of 5", [booking.ratingGiven]) : tr("Not rated")}</dd></div>
                      </dl>
                      {onRefund && booking.fareMinor > 0 ? (
                        <button data-command="admin.rider.refund" type="button" className="dash-btn small ghost" onClick={() => onRefund(booking)}>{trn("{0} Refund this ride", <RotateCcw size={13} aria-hidden="true" />)}</button>
                      ) : null}
                      {booking.status === "in_progress" ? <span className="fine">{trn("{0} Live now. Open the dashboard Live tab to follow it on the map.", <Clock size={12} aria-hidden="true" />)}</span> : null}
                    </div>
                  ) : null}
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
      {list.length > shown ? <button data-command="admin.table.filter" type="button" className="dash-btn ghost rd-more" onClick={() => setShown((value) => value + 25)}>{trn("Show {0} more of {1}", Math.min(25, list.length - shown), list.length - shown)}</button> : null}
    </div>
  );
}
