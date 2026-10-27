import { useMemo, useState, type ReactNode } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useParams, useSearchParams } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Ban,
  CalendarDays,
  CreditCard,
  Gift,
  Hash,
  History,
  Languages,
  Link2,
  MapPin,
  MessageSquare,
  Package,
  RotateCcw,
  Smartphone,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { useAudit, useSlice } from "../api/hooks";
import { useRefundPolicy } from "../payments/useRefundPolicy";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { AccountChip, Avatar, ContactActions, MessagesPanel, Stat } from "../fleet/ui";
import { market, zoneById } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { BookingHistory } from "../riders/BookingHistory";
import {
  CARE_KEY,
  CREDIT_MAX,
  REPLY_TEMPLATES,
  addCredit,
  addLostItem,
  advanceLostItem,
  assign,
  ban,
  creditedThisMonth,
  decideRefund,
  isBanned,
  markPaid,
  merge,
  promoUsed,
  reply,
  requestRefund,
  responseTone,
  setIdentity,
  toMajor,
  type RefundDestination,
} from "../riders/care";
import { advanceRiderPrivacy, emptyRiderOpsBook, revokeRiderSessions, riderOps, setRiderAccountReason, setRiderNote, type RiderOpsBook } from "../riders/ops";
import { BOOKING_LABEL, categoryName, type Booking } from "../riders/profile";
import { PromoBuilder } from "../riders/PromoBuilder";
import { CURRENCY_SYMBOL, LiveChip, PromoTicketCard, RiderBadges, ScoreBadge, money, shown, waitText } from "../riders/ui";
import { isLiveData } from "../live/realData";
import { useRidersData } from "../riders/useRidersData";
import { CommandButton } from "../ui/CommandButton";
import { NOTE_MAX } from "../domain/labels";
import { SensitiveValue } from "../ui/SensitiveValue";
import { TabPanel, Tabs } from "../ui/Tabs";
import { tr, trn, uiLocale, trx, trSentences } from "../i18n";

const TABS = [
  { id: "overview", get label() { return tr("Overview"); } },
  { id: "bookings", get label() { return tr("Bookings"); } },
  { id: "wallet", get label() { return tr("Wallet & refunds"); } },
  { id: "promotions", get label() { return tr("Promotions"); } },
  { id: "messages", get label() { return tr("Messages"); } },
  { id: "support", get label() { return tr("Support"); } },
  { id: "safety", get label() { return tr("Safety"); } },
  { id: "account", get label() { return tr("Account"); } },
  { id: "activity", get label() { return tr("Activity"); } },
];

const DESTINATIONS: { id: RefundDestination; label: string; hint: string }[] = [
  { id: "wallet", get label() { return tr("Movera wallet"); }, get hint() { return tr("Right away"); } },
  { id: "card", get label() { return tr("Card"); }, get hint() { return tr("3–5 working days"); } },
  { id: "bank", get label() { return tr("Bank account"); }, get hint() { return tr("3–5 working days"); } },
];

export function RiderDetailPage() {
  const { riderId = "" } = useParams();
  const { agent } = useSession();
  const role = agent?.role ?? "viewer";
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((item) => item.id === params.get("tab"))?.id ?? "overview";
  const data = useRidersData("month", null);
  const audit = useAudit();
  const opsSlice = useSlice<RiderOpsBook>("riderOps", emptyRiderOpsBook());
  const { policy: refundPolicy } = useRefundPolicy();
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditReason, setCreditReason] = useState("");
  const [refundId, setRefundId] = useState("");
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundTo, setRefundTo] = useState<RefundDestination>("card");
  const [refundReason, setRefundReason] = useState("");
  const [lostItem, setLostItem] = useState("");
  const [lostRide, setLostRide] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [note, setNote] = useState("");
  const { care, now } = data;
  const row = data.rows.find((item) => item.rider.id === riderId);
  const paidBookings = useMemo(() => (row?.bookings ?? []).filter((booking) => booking.fareMinor > 0 && booking.status !== "scheduled"), [row]);

  function openTab(id: string) {
    const search = new URLSearchParams(params);
    search.set("tab", id);
    setParams(search, { replace: true });
  }

  if (data.loading) return <p className="state-line">{tr("Loading rider.")}</p>;
  if (!row) {
    return <NotFoundRecord kind="Rider" id={riderId} list="/riders" listLabel="riders" />;
  }

  const { rider, profile } = row;
  const country = profile.country;
  const place = market(country);
  const symbol = CURRENCY_SYMBOL[country];
  const date = new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeZone: place.timeZone });
  const dateTime = new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: place.timeZone });
  // Live: a date the server does not send is NaN ("Not connected yet").
  const safeDate = (ms: number) => (Number.isFinite(ms) ? date.format(ms) : tr("Not connected yet"));
  const liveData = isLiveData();
  const me = agent?.id ?? "";
  const seed = { id: rider.id, name: rider.name, status: rider.status, tripId: rider.tripId ?? undefined };
  const book = opsSlice.value;
  const ops = riderOps(book, seed);
  const activeSessions = ops.sessions.filter((session) => session.active);
  const refundsFor = care.refunds.filter((item) => item.riderId === rider.id);
  const refunded = (bookingId: string) => refundsFor.filter((item) => item.bookingId === bookingId && item.status !== "rejected").reduce((sum, item) => sum + item.amount, 0);
  const refundsMinor = refundsFor.filter((item) => item.status === "sent").reduce((sum, item) => sum + Math.round(item.amount * place.minorUnits), 0);
  const lifetimeMinor = profile.spentMinor - refundsMinor - profile.promoMinor;
  const tone = responseTone(row.waitingMin);
  const tickets = (data.tickets.data ?? []).filter((item) => item.phone === rider.phone || item.name === rider.name);
  const incidents = (data.incidents.data ?? []).filter((item) => item.phone === rider.phone || item.name === rider.name);
  const lost = care.lostFound[rider.id] ?? [];
  const audits = (audit.data ?? []).filter((item) => item.targetId === rider.id || item.targetId.startsWith(`${rider.id}-`)).slice(0, 30);
  const promos = care.promotions.filter((ticket) => ticket.riderIds.includes(rider.id));
  const banned = isBanned(care, rider.phone, profile.payment.method);
  const mergedInto = care.merges[rider.id];

  // Money actions, prepared so the confirm button carries the exact change.
  const credit = addCredit(care, rider, creditAmount, creditReason, me, now);
  const usedThisMonth = creditedThisMonth(care, rider.id, now);
  const refundRide = paidBookings.find((booking) => booking.id === refundId);
  const refundLeft = refundRide ? toMajor(refundRide.fareMinor, country) - refunded(refundRide.id) : 0;
  const refund = requestRefund(care, rider, refundRide, refundAmount, refundTo, refundReason, me, now, refundPolicy);
  const lostNext = addLostItem(care, rider.id, lostItem, lostRide, me, now);
  const mergeNext = merge(care, rider.id, mergeInto.trim().toUpperCase());

  function startRefund(booking: Booking) {
    setRefundId(booking.id);
    const left = toMajor(booking.fareMinor, country) - refunded(booking.id);
    setRefundAmount(Math.max(0, Math.round(left * 100) / 100));
    openTab("wallet");
    window.setTimeout(() => document.getElementById("refund-title")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  const statusPatch = (status: string, label: string, command: string, className: string) => (
    <CommandButton
      command={command}
      className={className}
      targetId={rider.id}
      entityState={rider.status}
      scope={rider.zoneId}
      collection="riders"
      before={rider.status}
      after={status}
      patch={{ status }}
      expectedSliceRev={book.draftRev}
      sliceKey="riderOps"
      value={setRiderAccountReason(book, seed, status, reason || label, me)}
      onDone={() => { setReason(""); setNotice(`${rider.name}: ${label.toLowerCase()}.`); }}
    >
      {trx(label)}
    </CommandButton>
  );

  return (
    <div className="fd-page fd-profile rd-profile">
      <Link className="fd-back" to={{ pathname: "/riders", search: params.get("country") ? `?country=${params.get("country")}` : "" }}>{trn("{0} Back to riders", <ArrowLeft size={15} aria-hidden="true" />)}</Link>

      <section className="fd-hero" aria-label={tr("Rider")}>
        <div className="fd-hero-main">
          <Avatar name={rider.name} size={72} />
          <div className="fd-hero-title">
            <h2>{rider.name}</h2>
            <div className="fd-chips">
              <span className="fd-chip code"><Hash size={13} aria-hidden="true" />{profile.code}</span>
              <ScoreBadge score={profile.score} />
              <span className="fd-chip">{trn("{0} from drivers", Number.isFinite(profile.rating) ? profile.rating.toFixed(2) : tr("Not connected yet"))}</span>
              <LiveChip state={row.live} />
              <AccountChip status={rider.status} />
            </div>
            <RiderBadges row={row} />
            <p className="fd-sub">{trn("{0} · {1} · Member since {2} · {3}, {4}", rider.id, statusLabelOf(rider.status), safeDate(profile.joinedAt), zoneById(rider.zoneId)?.name ?? rider.zoneId, trx(place.name))}</p>
          </div>
          <div className="fd-hero-actions">
            <ContactActions kind="rider" id={rider.id} name={rider.name} phone={rider.phone} zoneId={rider.zoneId} messageTo={`/riders/${rider.id}?tab=messages`} />
            <div className="fd-action-row">
              {can(role, "finance.read") ? <button data-command="admin.rider.walletCredit" type="button" className="dash-btn ghost" onClick={() => openTab("wallet")}>{trn("{0} Add money", <Wallet size={15} aria-hidden="true" />)}</button> : null}
              {can(role, "finance.read") ? <button data-command="admin.rider.refund" type="button" className="dash-btn ghost" onClick={() => openTab("wallet")}>{trn("{0} Refund", <RotateCcw size={15} aria-hidden="true" />)}</button> : null}
              {can(role, "riders.promotions") ? <button data-command="admin.rider.promoAdd" type="button" className="dash-btn ghost" onClick={() => openTab("promotions")}>{trn("{0} Promotion", <Gift size={15} aria-hidden="true" />)}</button> : null}
            </div>
            <label className="fd-reason"><span>{tr("Reason")}</span><input aria-label={tr("Account reason")} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr("Stored in the rider's activity")} /></label>
            <div className="fd-action-row">
              {rider.status === "blocked" ? statusPatch("active", "Unblock", "admin.rider.unblock", "dash-btn") : null}
              {rider.status === "on_hold" ? statusPatch("active", "Activate", "admin.rider.activate", "dash-btn") : null}
              {rider.status === "active" ? statusPatch("on_hold", "Put on hold", "admin.rider.hold", "dash-btn ghost") : null}
              {rider.status !== "blocked" ? statusPatch("blocked", "Block", "admin.rider.block", "dash-btn danger") : null}
            </div>
          </div>
        </div>
        <div className="rd-facts">
          <Stat label={tr("Rides")} value={shown(profile.completed)} hint={Number.isFinite(profile.ridesLast30) ? tr("{0} in the last 30 days", [profile.ridesLast30]) : undefined} />
          <Stat label={tr("Spent")} value={money(profile.spentMinor, country, true)} hint={tr("all time")} />
          <Stat label={tr("Average fare")} value={money(profile.avgFareMinor, country)} />
          <Stat label={tr("Cancel rate")} value={Number.isFinite(profile.cancelRate) ? `${profile.cancelRate}%` : tr("Not connected yet")} warn={profile.cancelRate > 20 ? "red" : profile.cancelRate > 12 ? "amber" : null} />
          <Stat label={tr("No-shows")} value={shown(profile.noShows)} warn={profile.noShows >= 3 ? "red" : null} />
          <Stat label={tr("Lifetime value")} value={money(lifetimeMinor, country, true)} hint={tr("spent − refunds − promotions")} />
          <Stat label={tr("Wallet")} value={money(row.walletMinor, country)} />
        </div>
      </section>

      {notice || data.careSlice.message || opsSlice.message ? <p className="fd-notice" role="status">{trSentences(notice)} {trSentences(data.careSlice.message)} {trSentences(opsSlice.message)}</p> : null}
      {row.unpaidMinor > 0 ? (
        <div className="fd-banner red rd-banner" role="alert">
          <Wallet size={16} aria-hidden="true" />
          <span>{trn("{0} A payment failed on the rider's side. New rides are blocked until it is paid.", <b>{trn("Unpaid balance {0}.", money(row.unpaidMinor, country))}</b>)}</span>
          <CommandButton command="admin.rider.askPay" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before="unpaid" after="asked to pay" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={reply(care, rider, `You have an unpaid balance of ${money(row.unpaidMinor, country)}. Please update your card in the app to keep riding.`, me, now)} disabled={!can(role, "support.reply")} onDone={() => setNotice("Rider asked to pay.")}>{tr("Ask to pay")}</CommandButton>
          <CommandButton command="admin.rider.markPaid" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={money(row.unpaidMinor, country)} after="paid" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={markPaid(care, rider.id, now)} onDone={() => setNotice("Unpaid balance marked as paid. Rides are open again.")}>{tr("Mark as paid")}</CommandButton>
        </div>
      ) : null}
      {row.waitingMin !== null ? (
        <div className={`fd-banner ${tone === "red" ? "red" : "amber"} rd-banner`}>
          <MessageSquare size={16} aria-hidden="true" />
          <span><b>{trn("Waiting for a reply for {0}.", waitText(row.waitingMin))}</b> “{row.thread[row.thread.length - 1]?.text}”</span>
          <button data-command="admin.rider.tab" type="button" className="dash-btn small" onClick={() => openTab("messages")}>{tr("Reply")}</button>
        </div>
      ) : null}
      {profile.fraudFlags.length ? <p className="fd-banner amber">{trn("{0} To check: {1}. Nothing happens automatically; a person decides.", <AlertTriangle size={16} aria-hidden="true" />, profile.fraudFlags.join(" · "))}</p> : null}
      {banned ? <p className="fd-banner red">{trn("{0} This rider's phone or card is on the ban list.", <Ban size={16} aria-hidden="true" />)}</p> : null}
      {mergedInto ? <p className="fd-banner amber">{trn("{0} Merged into {1}. Use that account from now on.", <Link2 size={16} aria-hidden="true" />, <Link to={`/riders/${mergedInto}`}>{mergedInto}</Link>)}</p> : null}

      <Tabs tabs={TABS} activeId={tab} onChange={openTab} />

      <div className="fd-panel">
        <TabPanel id="overview" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3>{trn("{0} Profile", <UserCog size={16} aria-hidden="true" />)}</h3>
              <dl className="rd-dl">
                <div><dt>{tr("Phone")}</dt><dd><SensitiveValue value={rider.phone} permission="riders.viewSensitive" command="admin.rider.revealSensitive" targetId={rider.id} label={tr("Phone")} /></dd></div>
                <div><dt>{tr("Email")}</dt><dd><SensitiveValue value={profile.email} permission="riders.viewSensitive" command="admin.rider.revealSensitive" targetId={rider.id} label={tr("Email")} /></dd></div>
                <div><dt>{trn("{0} Language", <Languages size={13} aria-hidden="true" />)}</dt><dd>{profile.language}</dd></div>
                <div><dt>{trn("{0} Home and work", <MapPin size={13} aria-hidden="true" />)}</dt><dd>{profile.homeArea} · {profile.workArea}</dd></div>
                <div><dt>{trn("{0} Member since", <CalendarDays size={13} aria-hidden="true" />)}</dt><dd>{safeDate(profile.joinedAt)}</dd></div>
                <div><dt>{tr("Last ride")}</dt><dd>{profile.lastRideAt ? dateTime.format(profile.lastRideAt) : liveData ? tr("Not connected yet") : tr("No ride yet")}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Habits", <History size={16} aria-hidden="true" />)}</h3>
              <dl className="rd-dl">
                <div><dt>{tr("Favourite category")}</dt><dd>{trx(categoryName(profile.favouriteCategory))}</dd></div>
                <div><dt>{tr("Usually rides")}</dt><dd>{profile.usualTimes}</dd></div>
                <div><dt>{tr("Cancelled")}</dt><dd>{Number.isFinite(profile.cancelled) ? trn("{0} · no-shows {1} · interrupted {2}", profile.cancelled, profile.noShows, profile.interrupted) : tr("Not connected yet")}</dd></div>
                <div><dt>{tr("Promotion savings")}</dt><dd>{money(profile.promoMinor, country)}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Payment", <CreditCard size={16} aria-hidden="true" />)}</h3>
              <dl className="rd-dl">
                <div><dt>{tr("Method")}</dt><dd>{profile.payment.method}</dd></div>
                <div><dt>{tr("Card expires")}</dt><dd className={profile.payment.expiringSoon ? "warn" : undefined}>{profile.payment.expires}{profile.payment.expiringSoon ? tr(" · expires soon") : ""}</dd></div>
                <div><dt>{tr("Failed payments")}</dt><dd className={profile.payment.failed ? "warn" : undefined}>{shown(profile.payment.failed)}</dd></div>
                <div><dt>{tr("Chargebacks")}</dt><dd className={profile.payment.chargebacks ? "warn" : undefined}>{shown(profile.payment.chargebacks)}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Referral", <Users size={16} aria-hidden="true" />)}</h3>
              <dl className="rd-dl">
                <div><dt>{tr("Invite code")}</dt><dd><code>{profile.referral.code}</code></dd></div>
                <div><dt>{tr("Friends invited")}</dt><dd>{shown(profile.referral.invited)}</dd></div>
                <div><dt>{tr("Joined and rode")}</dt><dd>{shown(profile.referral.joined)}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Devices", <Smartphone size={16} aria-hidden="true" />)}</h3>
              <ul className="rd-devices">
                {profile.devices.map((device) => <li key={device.model}><b>{device.platform} · {device.model}</b><small>{trn("{0} · last seen {1}", device.app, dateTime.format(device.lastSeen))}</small></li>)}
              </ul>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Active promotions", <Gift size={16} aria-hidden="true" />)}</h3>
              {row.promos.length === 0 ? <p className="state-line">{tr("None right now.")}</p> : row.promos.map((item) => <PromoTicketCard key={item.ticket.id} ticket={item.ticket} used={item.used} locale={place.locale} />)}
            </section>
          </div>
          <section className="fd-box">
            <div className="fd-section-head">
              <h3>{trn("{0} Latest bookings", <History size={16} aria-hidden="true" />)}</h3>
              <button data-command="admin.rider.tab" type="button" className="link-action" onClick={() => openTab("bookings")}>{trn("See all {0} bookings", row.bookings.length)}</button>
            </div>
            <BookingHistory bookings={row.bookings} country={country} refunded={refunded} limit={5} />
          </section>
        </TabPanel>

        <TabPanel id="bookings" activeId={tab}>
          <BookingHistory bookings={row.bookings} country={country} refunded={refunded} onRefund={can(role, "finance.read") ? startRefund : undefined} />
        </TabPanel>

        <TabPanel id="wallet" activeId={tab}>
          <div className="rd-money">
            <section className="fd-box rd-wallet">
              <h3>{trn("{0} Movera wallet", <Wallet size={16} aria-hidden="true" />)}</h3>
              <strong className="rd-wallet-balance">{money(row.walletMinor, country)}</strong>
              <div className="rd-limit">
                <span>{trn("Given this month: {0} of {1} {2}", usedThisMonth, care.limits[country], symbol)}</span>
                <i aria-hidden="true"><b style={{ width: `${Math.min(100, (usedThisMonth / care.limits[country]) * 100)}%` }} /></i>
              </div>
              <div className="rd-form-grid">
                <label className="field">{trn("Amount{0}", <NumberField label={tr("Wallet amount")} value={creditAmount} unit={symbol} onChange={setCreditAmount} />)}</label>
                <label className="field">{trn("Why{0}", <input aria-label={tr("Wallet reason")} value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder={tr("Driver was late")} />)}</label>
              </div>
              {credit.error && (creditReason || creditAmount !== 100) ? <p className="rd-form-error">{trSentences(credit.error)}</p> : <small className="fine">{trn("At most {0} {1} at a time.", CREDIT_MAX[country], symbol)}</small>}
              <CommandButton command="admin.rider.walletCredit" className="dash-btn" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} amountOre={Math.round(creditAmount * place.minorUnits)} before={money(row.walletMinor, country)} after={`+${creditAmount} ${symbol}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={credit.care} disabled={!can(role, "finance.read") || Boolean(credit.error)} title={credit.error} onDone={() => { setNotice(`Added ${creditAmount} ${symbol} to ${rider.name}'s wallet.`); setCreditReason(""); }}>{trn("{0} Add to wallet", <Wallet size={14} aria-hidden="true" />)}</CommandButton>
              {care.credits.filter((item) => item.riderId === rider.id).length ? (
                <ul className="rd-ledger" aria-label={tr("Wallet credits")}>
                  {care.credits.filter((item) => item.riderId === rider.id).map((item) => <li key={item.id}><b>+{item.amount} {symbol}</b><span>{item.reason}</span><small>{dateTime.format(Date.parse(item.at))} · {item.by}</small></li>)}
                </ul>
              ) : null}
            </section>

            <section className="fd-box rd-refund">
              <h3 id="refund-title">{trn("{0} Refund a ride", <RotateCcw size={16} aria-hidden="true" />)}</h3>
              <label className="field">{trn("Ride{0}", <select aria-label={tr("Ride to refund")} value={refundId} onChange={(event) => {
                  setRefundId(event.target.value);
                  const ride = paidBookings.find((booking) => booking.id === event.target.value);
                  if (ride) setRefundAmount(Math.max(0, Math.round((toMajor(ride.fareMinor, country) - refunded(ride.id)) * 100) / 100));
                }}>
                  <option value="">{tr("Pick a ride")}</option>
                  {paidBookings.slice(0, 60).map((booking) => <option key={booking.id} value={booking.id}>{date.format(booking.at)} · {booking.from} → {booking.to} · {money(booking.fareMinor, country)} · {trx(BOOKING_LABEL[booking.status])}</option>)}
                </select>)}</label>
              <div className="rd-form-grid">
                <label className="field">{trn("Amount{0}{1}", refundRide ? tr(" (up to {0})", [refundLeft.toFixed(2)]) : "", <NumberField label={tr("Refund amount")} value={refundAmount} unit={symbol} onChange={setRefundAmount} />)}</label>
                <label className="field">{trn("Why{0}", <input aria-label={tr("Refund reason")} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder={tr("Charged twice")} />)}</label>
              </div>
              <div className="rd-dest" role="radiogroup" aria-label={tr("Refund to")}>
                {DESTINATIONS.map((item) => (
                  <button data-command="admin.ui.quickAction" key={item.id} type="button" role="radio" aria-checked={refundTo === item.id} className={refundTo === item.id ? "active" : undefined} onClick={() => setRefundTo(item.id)}>
                    <b>{trx(item.label)}</b><small>{trx(item.hint)}</small>
                  </button>
                ))}
              </div>
              {refund.error && refundRide && refundReason ? <p className="rd-form-error">{trSentences(refund.error)}</p> : <small className="fine">{trn("Refunds above {0} {1} need a second admin to approve ({2}).", refundPolicy.aboveMajor[country], symbol, <Link to="/settings#refunds">{tr("set in Settings")}</Link>)}</small>}
              <CommandButton command="admin.rider.refund" className="dash-btn" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} amountOre={Math.round(refundAmount * place.minorUnits)} before={refundRide?.id ?? ""} after={`${refundAmount} ${symbol} to ${refundTo}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={refund.care} disabled={!can(role, "finance.read") || Boolean(refund.error)} title={refund.error} onDone={() => { setNotice(refund.needsApproval ? `Refund of ${refundAmount} ${symbol} is waiting for a second admin to approve.` : `Refunded ${refundAmount} ${symbol} to the rider's ${DESTINATIONS.find((item) => item.id === refundTo)?.label.toLowerCase()}.`); setRefundReason(""); setRefundId(""); }}>{trn("{0} Refund {1}", <RotateCcw size={14} aria-hidden="true" />, refundAmount ? `${refundAmount} ${symbol}` : "")}</CommandButton>
            </section>
          </div>
          <section className="fd-box">
            <h3>{tr("Refund history")}</h3>
            {refundsFor.length === 0 ? <p className="state-line">{tr("No refund for this rider.")}</p> : (
              <ul className="rd-ledger" aria-label={tr("Refunds")}>
                {refundsFor.map((item) => (
                  <li key={item.id}>
                    <b>{item.amount} {symbol}</b>
                    <span>{trn("{0} · to {1} · {2}", item.bookingId, item.destination, item.reason)}</span>
                    <span className={`rd-refund-status r-${item.status}`}>{item.status === "waiting" ? tr("Waiting for approval") : item.status === "sent" ? tr("Sent") : tr("Rejected")}</span>
                    <small>{trn("Asked by {0} · {1}{2}", item.by, dateTime.format(Date.parse(item.at)), item.decidedBy ? tr(" · decided by {0}", [item.decidedBy]) : "")}</small>
                    {item.status === "waiting" && can(role, "approval.decide") ? (
                      <span className="rd-inline">
                        <CommandButton command="admin.rider.refundDecide" className="dash-btn small" targetId={item.id} confirmTarget={false} scope={rider.zoneId} before="waiting" after="approved" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={decideRefund(care, item.id, true, me).care} disabled={Boolean(decideRefund(care, item.id, true, me).error)} title={decideRefund(care, item.id, true, me).error} onDone={() => setNotice("Refund approved and sent.")}>{tr("Approve")}</CommandButton>
                        <CommandButton command="admin.rider.refundDecide" className="dash-btn small ghost" targetId={item.id} confirmTarget={false} scope={rider.zoneId} before="waiting" after="rejected" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={decideRefund(care, item.id, false, me).care} disabled={Boolean(decideRefund(care, item.id, false, me).error)} title={decideRefund(care, item.id, false, me).error} onDone={() => setNotice("Refund rejected.")}>{tr("Reject")}</CommandButton>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabPanel>

        <TabPanel id="promotions" activeId={tab}>
          {promos.length ? (
            <section className="fd-box">
              <h3>{trn("{0} Promotions on this account", <Gift size={16} aria-hidden="true" />)}</h3>
              <div className="rd-ticket-grid">
                {promos.map((ticket) => <PromoTicketCard key={ticket.id} ticket={ticket} used={promoUsed(ticket, rider.id, row.bookings)} locale={place.locale} />)}
              </div>
            </section>
          ) : null}
          <section className="fd-box">
            <PromoBuilder single country={country} care={care} agentId={agent?.id ?? null} canEdit={can(role, "riders.promotions")} rows={[row]} onCreated={setNotice} />
          </section>
        </TabPanel>

        <TabPanel id="messages" activeId={tab}>
          <div className="rd-msg-head">
            {tone ? <span className={`rd-badge reply t-${tone}`}>{trn("Waiting {0}", waitText(row.waitingMin ?? 0))}</span> : <span className="rd-badge done">{tr("All answered")}</span>}
            <span className="fine">{care.assigned[rider.id] ? tr("Assigned to {0}", [care.assigned[rider.id]]) : tr("Not assigned")}</span>
            {care.assigned[rider.id] !== me ? (
              <CommandButton command="admin.rider.assign" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={care.assigned[rider.id] ?? "nobody"} after={me} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={assign(care, rider.id, me)} disabled={!can(role, "support.reply")} onDone={() => setNotice("Conversation assigned to you.")}>{tr("Assign to me")}</CommandButton>
            ) : (
              <CommandButton command="admin.rider.assign" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={me} after="nobody" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={assign(care, rider.id, null)} onDone={() => setNotice("Conversation unassigned.")}>{tr("Unassign")}</CommandButton>
            )}
          </div>
          <MessagesPanel
            messages={row.thread}
            contactName={rider.name}
            command="admin.rider.message"
            targetId={rider.id}
            scope={rider.zoneId}
            sliceKey={CARE_KEY}
            expectedSliceRev={care.draftRev}
            build={(text) => reply(care, rider, text, me, now)}
            templates={REPLY_TEMPLATES}
            onSent={() => setNotice(`Message sent to ${rider.name}.`)}
            locale={place.locale}
            timeZone={place.timeZone}
          />
        </TabPanel>

        <TabPanel id="support" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3>{tr("Support tickets")}</h3>
              {row.complaint ? <p className="fd-banner amber">{trn("{0} Open complaint: {1}", <AlertTriangle size={14} aria-hidden="true" />, row.complaint)}</p> : null}
              {tickets.length === 0 ? <p className="state-line">{tr("No ticket for this rider.")}</p> : <ul className="rd-ledger">{tickets.map((item) => <li key={item.id}><Link to={`/tickets/${item.id}`}>{item.id}</Link><span>{statusLabelOf(item.status)}</span></li>)}</ul>}
              <Link className="link-action" to="/support">{tr("Open the support queue")}</Link>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Lost and found", <Package size={16} aria-hidden="true" />)}</h3>
              {lost.length === 0 ? <p className="state-line">{tr("No lost item reported.")}</p> : (
                <ul className="rd-ledger" aria-label={tr("Lost items")}>
                  {lost.map((item) => (
                    <li key={item.id}>
                      <b>{item.item}</b>
                      <span className={`rd-lost l-${item.status.replace(" ", "-")}`}>{item.status}</span>
                      <small>{item.bookingId || tr("ride not known")} · {dateTime.format(Date.parse(item.at))}</small>
                      {item.status !== "returned" ? <CommandButton command="admin.rider.lostFound" className="dash-btn small ghost" targetId={item.id} confirmTarget={false} scope={rider.zoneId} before={item.status} after="next" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={advanceLostItem(care, rider.id, item.id)} onDone={() => setNotice(`${item.item}: ${item.status === "reported" ? "driver contacted" : "returned"}.`)}>{item.status === "reported" ? tr("Driver contacted") : tr("Returned to rider")}</CommandButton> : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="rd-form-grid">
                <label className="field">{trn("Item{0}", <input aria-label={tr("Lost item")} value={lostItem} onChange={(event) => setLostItem(event.target.value)} placeholder={tr("Black umbrella")} />)}</label>
                <label className="field">{trn("Ride{0}", <select aria-label={tr("Lost item ride")} value={lostRide} onChange={(event) => setLostRide(event.target.value)}>
                    <option value="">{tr("Not sure")}</option>
                    {row.bookings.filter((booking) => booking.status === "completed").slice(0, 10).map((booking) => <option key={booking.id} value={booking.id}>{date.format(booking.at)} · {booking.driverName ?? tr("driver")}</option>)}
                  </select>)}</label>
              </div>
              <CommandButton command="admin.rider.lostFound" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before="" after={lostItem} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={lostNext.care} disabled={Boolean(lostNext.error)} onDone={() => { setNotice(`${lostItem} reported as lost.`); setLostItem(""); }}>{tr("Report lost item")}</CommandButton>
            </section>
          </div>
        </TabPanel>

        <TabPanel id="safety" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3>{tr("Trusted contacts")}</h3>
              {profile.trustedContacts.length === 0 ? <p className="state-line">{tr("The rider shares trips with nobody.")}</p> : <ul className="rd-ledger">{profile.trustedContacts.map((item) => <li key={item.name}><b>{item.name}</b><span>{item.relation}</span></li>)}</ul>}
              <h4>{tr("Safety incidents")}</h4>
              {incidents.length === 0 ? <p className="state-line">{tr("No incident.")}</p> : <ul className="rd-ledger">{incidents.map((item) => <li key={item.id}><Link to={`/incidents/${item.id}`}>{item.id}</Link><span>{statusLabelOf(item.status)}</span></li>)}</ul>}
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Identity check", <BadgeCheck size={16} aria-hidden="true" />)}</h3>
              <p>{care.identity[rider.id] === "verified" ? tr("Identity verified.") : care.identity[rider.id] === "requested" ? tr("Asked the rider to verify their identity.") : tr("Not checked. Ask for it for high-risk riders or large wallet balances.")}</p>
              {care.identity[rider.id] !== "verified" ? (
                <CommandButton command="admin.rider.identity" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={care.identity[rider.id] ?? "none"} after={care.identity[rider.id] === "requested" ? "verified" : "requested"} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={setIdentity(care, rider.id, care.identity[rider.id] === "requested" ? "verified" : "requested")} disabled={!can(role, "riders.block")} onDone={() => setNotice(care.identity[rider.id] === "requested" ? "Identity marked as verified." : "Identity check requested.")}>
                  {care.identity[rider.id] === "requested" ? tr("Mark as verified") : tr("Ask to verify identity")}
                </CommandButton>
              ) : null}
            </section>
          </div>
        </TabPanel>

        <TabPanel id="account" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3>{trn("{0} Sessions", <Smartphone size={16} aria-hidden="true" />)}</h3>
              <ul className="rd-ledger" aria-label={tr("Rider sessions")}>{ops.sessions.map((session) => <li key={session.id}><b>{session.platform} · {session.device}</b><span>{session.active ? tr("Signed in") : tr("Signed out")}</span></li>)}</ul>
              <CommandButton command="admin.rider.signOut" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={`${activeSessions.length} active sessions`} after="0 active sessions" expectedSliceRev={book.draftRev} sliceKey="riderOps" value={revokeRiderSessions(book, seed, me)} disabled={activeSessions.length === 0} onDone={() => setNotice("Signed out of every active rider session.")}>{tr("Sign out all sessions")}</CommandButton>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Ban list", <Ban size={16} aria-hidden="true" />)}</h3>
              <p className="fine">{tr("A banned phone or card cannot open a new account.")}</p>
              <div className="fd-action-row">
                <CommandButton command="admin.rider.ban" className="dash-btn small danger" targetId={rider.id} scope={rider.zoneId} before="allowed" after="phone banned" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={ban(care, "phones", rider.phone, rider.id, reason || "Banned by admin", me, now).care} disabled={!can(role, "riders.block") || care.bans.phones.some((item) => item.value === rider.phone)} onDone={() => setNotice("Phone number added to the ban list.")}>{tr("Ban phone number")}</CommandButton>
                <CommandButton command="admin.rider.ban" className="dash-btn small danger" targetId={rider.id} scope={rider.zoneId} before="allowed" after="card banned" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={ban(care, "cards", profile.payment.method, rider.id, reason || "Banned by admin", me, now).care} disabled={!can(role, "riders.block") || care.bans.cards.some((item) => item.value === profile.payment.method)} onDone={() => setNotice("Card added to the ban list.")}>{tr("Ban card")}</CommandButton>
              </div>
            </section>
            <section className="fd-box">
              <h3>{trn("{0} Merge duplicate account", <Link2 size={16} aria-hidden="true" />)}</h3>
              <p className="fine">{tr("Same person with two accounts? Keep the other one; this one points to it.")}</p>
              <div className="rd-inline">
                <input aria-label={tr("Account to keep")} value={mergeInto} onChange={(event) => setMergeInto(event.target.value)} placeholder={tr("Rider id, e.g. R0042")} />
                <CommandButton command="admin.rider.merge" className="dash-btn small" targetId={rider.id} scope={rider.zoneId} before={rider.id} after={`merged into ${mergeInto}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={mergeNext.care} disabled={!can(role, "riders.block") || Boolean(mergeNext.error) || Boolean(mergedInto)} title={mergeNext.error} onDone={() => setNotice(`Merged into ${mergeInto.toUpperCase()}.`)}>{tr("Merge")}</CommandButton>
              </div>
            </section>
            <section className="fd-box">
              <h3>{tr("Privacy request")}</h3>
              <p>{trn("Status: {0}", ops.privacy)}</p>
              <CommandButton command="admin.rider.privacy" className="dash-btn small ghost" targetId={rider.id} scope={rider.zoneId} before={ops.privacy} after="next" expectedSliceRev={book.draftRev} sliceKey="riderOps" value={advanceRiderPrivacy(book, seed, me)} disabled={ops.privacy === "done"} onDone={() => setNotice("Privacy request advanced.")}>{tr("Advance privacy")}</CommandButton>
            </section>
            <section className="fd-box">
              <h3>{tr("Private note")}</h3>
              <p className="fd-note-text">{ops.privateNote || tr("No private note.")}</p>
              <textarea aria-label={tr("Private internal note")} rows={3} value={note} maxLength={NOTE_MAX} onChange={(event) => setNote(event.target.value)} />
              <CommandButton command="admin.rider.note" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={ops.privateNote || "empty"} after={note || "empty"} expectedSliceRev={book.draftRev} sliceKey="riderOps" value={setRiderNote(book, seed, note, me)} disabled={!note.trim()} onDone={() => { setNotice("Private rider note saved."); setNote(""); }}>{tr("Save private note")}</CommandButton>
              {ops.accountReason ? <p className="fine">{trn("Latest account reason: {0}", ops.accountReason)}</p> : null}
            </section>
          </div>
        </TabPanel>

        <TabPanel id="activity" activeId={tab}>
          <Timeline items={[
            ...(Number.isFinite(profile.joinedAt) ? [{ at: profile.joinedAt, text: "Joined Movera", tone: "violet" as const }] : []),
            ...row.bookings.filter((booking) => booking.at <= now).slice(0, 15).map((booking) => ({ at: booking.at, text: `${BOOKING_LABEL[booking.status]} · ${booking.from} → ${booking.to}${booking.fareMinor ? ` · ${money(booking.fareMinor, country)}` : ""}`, tone: booking.status === "completed" ? "green" : booking.status === "interrupted" || booking.status === "no_show" ? "red" : "grey" })),
            ...care.credits.filter((item) => item.riderId === rider.id).map((item) => ({ at: Date.parse(item.at), text: `Wallet +${item.amount} ${symbol} by ${item.by}: ${item.reason}`, tone: "blue" })),
            ...refundsFor.map((item) => ({ at: Date.parse(item.at), text: `Refund ${item.amount} ${symbol} to ${item.destination} (${item.status}) by ${item.by}`, tone: "blue" })),
            ...promos.map((ticket) => ({ at: Date.parse(ticket.createdAt), text: `Promotion ${ticket.code} given by ${ticket.createdBy}`, tone: "aqua" })),
            ...row.thread.map((message) => ({ at: Date.parse(message.at), text: `${message.from === "admin" ? `Movera (${message.by})` : "Rider"}: ${message.text}`, tone: message.from === "admin" ? "blue" : "amber" })),
            ...audits.map((item) => ({ at: Date.parse(item.at), text: `${item.action} · ${item.result} · ${item.actorId}`, tone: "grey" })),
          ]} format={(at) => dateTime.format(at)} />
        </TabPanel>
      </div>
    </div>
  );
}

function statusLabelOf(status: string): string {
  return status === "on_hold" ? "on hold" : status.replaceAll("_", " ");
}

function Timeline({ items, format }: { items: { at: number; text: string; tone: string }[]; format: (at: number) => string }): ReactNode {
  const sorted = [...items].sort((a, b) => b.at - a.at).slice(0, 60);
  return (
    <ol className="rd-timeline" aria-label={tr("Rider timeline")}>
      {sorted.map((item, index) => <li key={`${item.at}-${index}`} className={`t-${item.tone}`}><time>{format(item.at)}</time><span>{item.text}</span></li>)}
    </ol>
  );
}
