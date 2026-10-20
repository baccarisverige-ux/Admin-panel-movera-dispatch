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
  Shield,
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
  blockedByDrivers,
  creditedThisMonth,
  decideRefund,
  driverReports,
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
import { CURRENCY_SYMBOL, LiveChip, PromoTicketCard, RiderBadges, ScoreBadge, money, waitText } from "../riders/ui";
import { useRidersData } from "../riders/useRidersData";
import { CommandButton } from "../ui/CommandButton";
import { NOTE_MAX } from "../domain/labels";
import { SensitiveValue } from "../ui/SensitiveValue";
import { TabPanel, Tabs } from "../ui/Tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "bookings", label: "Bookings" },
  { id: "wallet", label: "Wallet & refunds" },
  { id: "promotions", label: "Promotions" },
  { id: "messages", label: "Messages" },
  { id: "support", label: "Support" },
  { id: "safety", label: "Safety" },
  { id: "account", label: "Account" },
  { id: "activity", label: "Activity" },
];

const DESTINATIONS: { id: RefundDestination; label: string; hint: string }[] = [
  { id: "wallet", label: "Movera wallet", hint: "Right away" },
  { id: "card", label: "Card", hint: "3–5 working days" },
  { id: "bank", label: "Bank account", hint: "3–5 working days" },
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

  if (data.loading) return <p className="state-line">Loading rider.</p>;
  if (!row) {
    return <NotFoundRecord kind="Rider" id={riderId} list="/riders" listLabel="riders" />;
  }

  const { rider, profile } = row;
  const country = profile.country;
  const place = market(country);
  const symbol = CURRENCY_SYMBOL[country];
  const date = new Intl.DateTimeFormat(place.locale, { dateStyle: "medium", timeZone: place.timeZone });
  const dateTime = new Intl.DateTimeFormat(place.locale, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: place.timeZone });
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
  const reports = driverReports(rider, now);
  const blockers = blockedByDrivers(rider);
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
      {label}
    </CommandButton>
  );

  return (
    <div className="fd-page fd-profile rd-profile">
      <Link className="fd-back" to={{ pathname: "/riders", search: params.get("country") ? `?country=${params.get("country")}` : "" }}><ArrowLeft size={15} aria-hidden="true" /> Back to riders</Link>

      <section className="fd-hero" aria-label="Rider">
        <div className="fd-hero-main">
          <Avatar name={rider.name} size={72} />
          <div className="fd-hero-title">
            <h2>{rider.name}</h2>
            <div className="fd-chips">
              <span className="fd-chip code"><Hash size={13} aria-hidden="true" />{profile.code}</span>
              <ScoreBadge score={profile.score} />
              <span className="fd-chip">{profile.rating.toFixed(2)} from drivers</span>
              <LiveChip state={row.live} />
              <AccountChip status={rider.status} />
            </div>
            <RiderBadges row={row} />
            <p className="fd-sub">{rider.id} · {statusLabelOf(rider.status)} · Member since {date.format(profile.joinedAt)} · {zoneById(rider.zoneId)?.name ?? rider.zoneId}, {place.name}</p>
          </div>
          <div className="fd-hero-actions">
            <ContactActions kind="rider" id={rider.id} name={rider.name} phone={rider.phone} zoneId={rider.zoneId} messageTo={`/riders/${rider.id}?tab=messages`} />
            <div className="fd-action-row">
              {can(role, "finance.read") ? <button data-command="admin.rider.walletCredit" type="button" className="dash-btn ghost" onClick={() => openTab("wallet")}><Wallet size={15} aria-hidden="true" /> Add money</button> : null}
              {can(role, "finance.read") ? <button data-command="admin.rider.refund" type="button" className="dash-btn ghost" onClick={() => openTab("wallet")}><RotateCcw size={15} aria-hidden="true" /> Refund</button> : null}
              {can(role, "riders.promotions") ? <button data-command="admin.rider.promoAdd" type="button" className="dash-btn ghost" onClick={() => openTab("promotions")}><Gift size={15} aria-hidden="true" /> Promotion</button> : null}
            </div>
            <label className="fd-reason"><span>Reason</span><input aria-label="Account reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Stored in the rider's activity" /></label>
            <div className="fd-action-row">
              {rider.status === "blocked" ? statusPatch("active", "Unblock", "admin.rider.unblock", "dash-btn") : null}
              {rider.status === "on_hold" ? statusPatch("active", "Activate", "admin.rider.activate", "dash-btn") : null}
              {rider.status === "active" ? statusPatch("on_hold", "Put on hold", "admin.rider.hold", "dash-btn ghost") : null}
              {rider.status !== "blocked" ? statusPatch("blocked", "Block", "admin.rider.block", "dash-btn danger") : null}
            </div>
          </div>
        </div>
        <div className="rd-facts">
          <Stat label="Rides" value={String(profile.completed)} hint={`${profile.ridesLast30} in the last 30 days`} />
          <Stat label="Spent" value={money(profile.spentMinor, country, true)} hint="all time" />
          <Stat label="Average fare" value={money(profile.avgFareMinor, country)} />
          <Stat label="Cancel rate" value={`${profile.cancelRate}%`} warn={profile.cancelRate > 20 ? "red" : profile.cancelRate > 12 ? "amber" : null} />
          <Stat label="No-shows" value={String(profile.noShows)} warn={profile.noShows >= 3 ? "red" : null} />
          <Stat label="Lifetime value" value={money(lifetimeMinor, country, true)} hint="spent − refunds − promotions" />
          <Stat label="Wallet" value={money(row.walletMinor, country)} />
        </div>
      </section>

      {notice || data.careSlice.message || opsSlice.message ? <p className="fd-notice" role="status">{notice} {data.careSlice.message} {opsSlice.message}</p> : null}
      {row.unpaidMinor > 0 ? (
        <div className="fd-banner red rd-banner" role="alert">
          <Wallet size={16} aria-hidden="true" />
          <span><b>Unpaid balance {money(row.unpaidMinor, country)}.</b> A payment failed on the rider's side. New rides are blocked until it is paid.</span>
          <CommandButton command="admin.rider.askPay" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before="unpaid" after="asked to pay" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={reply(care, rider, `You have an unpaid balance of ${money(row.unpaidMinor, country)}. Please update your card in the app to keep riding.`, me, now)} disabled={!can(role, "support.reply")} onDone={() => setNotice("Rider asked to pay.")}>Ask to pay</CommandButton>
          <CommandButton command="admin.rider.markPaid" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={money(row.unpaidMinor, country)} after="paid" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={markPaid(care, rider.id, now)} onDone={() => setNotice("Unpaid balance marked as paid. Rides are open again.")}>Mark as paid</CommandButton>
        </div>
      ) : null}
      {row.waitingMin !== null ? (
        <div className={`fd-banner ${tone === "red" ? "red" : "amber"} rd-banner`}>
          <MessageSquare size={16} aria-hidden="true" />
          <span><b>Waiting for a reply for {waitText(row.waitingMin)}.</b> “{row.thread[row.thread.length - 1]?.text}”</span>
          <button data-command="admin.rider.tab" type="button" className="dash-btn small" onClick={() => openTab("messages")}>Reply</button>
        </div>
      ) : null}
      {profile.fraudFlags.length ? <p className="fd-banner amber"><AlertTriangle size={16} aria-hidden="true" /> To check: {profile.fraudFlags.join(" · ")}. Nothing happens automatically; a person decides.</p> : null}
      {banned ? <p className="fd-banner red"><Ban size={16} aria-hidden="true" /> This rider's phone or card is on the ban list.</p> : null}
      {mergedInto ? <p className="fd-banner amber"><Link2 size={16} aria-hidden="true" /> Merged into <Link to={`/riders/${mergedInto}`}>{mergedInto}</Link>. Use that account from now on.</p> : null}

      <Tabs tabs={TABS} activeId={tab} onChange={openTab} />

      <div className="fd-panel">
        <TabPanel id="overview" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3><UserCog size={16} aria-hidden="true" /> Profile</h3>
              <dl className="rd-dl">
                <div><dt>Phone</dt><dd><SensitiveValue value={rider.phone} permission="riders.viewSensitive" command="admin.rider.revealSensitive" targetId={rider.id} label="Phone" /></dd></div>
                <div><dt>Email</dt><dd><SensitiveValue value={profile.email} permission="riders.viewSensitive" command="admin.rider.revealSensitive" targetId={rider.id} label="Email" /></dd></div>
                <div><dt><Languages size={13} aria-hidden="true" /> Language</dt><dd>{profile.language}</dd></div>
                <div><dt><MapPin size={13} aria-hidden="true" /> Home and work</dt><dd>{profile.homeArea} · {profile.workArea}</dd></div>
                <div><dt><CalendarDays size={13} aria-hidden="true" /> Member since</dt><dd>{date.format(profile.joinedAt)}</dd></div>
                <div><dt>Last ride</dt><dd>{profile.lastRideAt ? dateTime.format(profile.lastRideAt) : "No ride yet"}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3><History size={16} aria-hidden="true" /> Habits</h3>
              <dl className="rd-dl">
                <div><dt>Favourite category</dt><dd>{categoryName(profile.favouriteCategory)}</dd></div>
                <div><dt>Usually rides</dt><dd>{profile.usualTimes}</dd></div>
                <div><dt>Cancelled</dt><dd>{profile.cancelled} · no-shows {profile.noShows} · interrupted {profile.interrupted}</dd></div>
                <div><dt>Promotion savings</dt><dd>{money(profile.promoMinor, country)}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3><CreditCard size={16} aria-hidden="true" /> Payment</h3>
              <dl className="rd-dl">
                <div><dt>Method</dt><dd>{profile.payment.method}</dd></div>
                <div><dt>Card expires</dt><dd className={profile.payment.expiringSoon ? "warn" : undefined}>{profile.payment.expires}{profile.payment.expiringSoon ? " · expires soon" : ""}</dd></div>
                <div><dt>Failed payments</dt><dd className={profile.payment.failed ? "warn" : undefined}>{profile.payment.failed}</dd></div>
                <div><dt>Chargebacks</dt><dd className={profile.payment.chargebacks ? "warn" : undefined}>{profile.payment.chargebacks}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3><Users size={16} aria-hidden="true" /> Referral</h3>
              <dl className="rd-dl">
                <div><dt>Invite code</dt><dd><code>{profile.referral.code}</code></dd></div>
                <div><dt>Friends invited</dt><dd>{profile.referral.invited}</dd></div>
                <div><dt>Joined and rode</dt><dd>{profile.referral.joined}</dd></div>
              </dl>
            </section>
            <section className="fd-box">
              <h3><Smartphone size={16} aria-hidden="true" /> Devices</h3>
              <ul className="rd-devices">
                {profile.devices.map((device) => <li key={device.model}><b>{device.platform} · {device.model}</b><small>{device.app} · last seen {dateTime.format(device.lastSeen)}</small></li>)}
              </ul>
            </section>
            <section className="fd-box">
              <h3><Gift size={16} aria-hidden="true" /> Active promotions</h3>
              {row.promos.length === 0 ? <p className="state-line">None right now.</p> : row.promos.map((item) => <PromoTicketCard key={item.ticket.id} ticket={item.ticket} used={item.used} locale={place.locale} />)}
            </section>
          </div>
          <section className="fd-box">
            <div className="fd-section-head">
              <h3><History size={16} aria-hidden="true" /> Latest bookings</h3>
              <button data-command="admin.rider.tab" type="button" className="link-action" onClick={() => openTab("bookings")}>See all {row.bookings.length} bookings</button>
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
              <h3><Wallet size={16} aria-hidden="true" /> Movera wallet</h3>
              <strong className="rd-wallet-balance">{money(row.walletMinor, country)}</strong>
              <div className="rd-limit">
                <span>Given this month: {usedThisMonth} of {care.limits[country]} {symbol}</span>
                <i aria-hidden="true"><b style={{ width: `${Math.min(100, (usedThisMonth / care.limits[country]) * 100)}%` }} /></i>
              </div>
              <div className="rd-form-grid">
                <label className="field">Amount<NumberField label="Wallet amount" value={creditAmount} unit={symbol} onChange={setCreditAmount} /></label>
                <label className="field">Why<input aria-label="Wallet reason" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder="Driver was late" /></label>
              </div>
              {credit.error && (creditReason || creditAmount !== 100) ? <p className="rd-form-error">{credit.error}</p> : <small className="fine">At most {CREDIT_MAX[country]} {symbol} at a time.</small>}
              <CommandButton command="admin.rider.walletCredit" className="dash-btn" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} amountOre={Math.round(creditAmount * place.minorUnits)} before={money(row.walletMinor, country)} after={`+${creditAmount} ${symbol}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={credit.care} disabled={!can(role, "finance.read") || Boolean(credit.error)} title={credit.error} onDone={() => { setNotice(`Added ${creditAmount} ${symbol} to ${rider.name}'s wallet.`); setCreditReason(""); }}>
                <Wallet size={14} aria-hidden="true" /> Add to wallet
              </CommandButton>
              {care.credits.filter((item) => item.riderId === rider.id).length ? (
                <ul className="rd-ledger" aria-label="Wallet credits">
                  {care.credits.filter((item) => item.riderId === rider.id).map((item) => <li key={item.id}><b>+{item.amount} {symbol}</b><span>{item.reason}</span><small>{dateTime.format(Date.parse(item.at))} · {item.by}</small></li>)}
                </ul>
              ) : null}
            </section>

            <section className="fd-box rd-refund">
              <h3 id="refund-title"><RotateCcw size={16} aria-hidden="true" /> Refund a ride</h3>
              <label className="field">Ride
                <select aria-label="Ride to refund" value={refundId} onChange={(event) => {
                  setRefundId(event.target.value);
                  const ride = paidBookings.find((booking) => booking.id === event.target.value);
                  if (ride) setRefundAmount(Math.max(0, Math.round((toMajor(ride.fareMinor, country) - refunded(ride.id)) * 100) / 100));
                }}>
                  <option value="">Pick a ride</option>
                  {paidBookings.slice(0, 60).map((booking) => <option key={booking.id} value={booking.id}>{date.format(booking.at)} · {booking.from} → {booking.to} · {money(booking.fareMinor, country)} · {BOOKING_LABEL[booking.status]}</option>)}
                </select>
              </label>
              <div className="rd-form-grid">
                <label className="field">Amount{refundRide ? ` (up to ${refundLeft.toFixed(2)})` : ""}<NumberField label="Refund amount" value={refundAmount} unit={symbol} onChange={setRefundAmount} /></label>
                <label className="field">Why<input aria-label="Refund reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Charged twice" /></label>
              </div>
              <div className="rd-dest" role="radiogroup" aria-label="Refund to">
                {DESTINATIONS.map((item) => (
                  <button data-command="admin.ui.quickAction" key={item.id} type="button" role="radio" aria-checked={refundTo === item.id} className={refundTo === item.id ? "active" : undefined} onClick={() => setRefundTo(item.id)}>
                    <b>{item.label}</b><small>{item.hint}</small>
                  </button>
                ))}
              </div>
              {refund.error && refundRide && refundReason ? <p className="rd-form-error">{refund.error}</p> : <small className="fine">Refunds above {refundPolicy.aboveMajor[country]} {symbol} need a second admin to approve (<Link to="/settings#refunds">set in Settings</Link>).</small>}
              <CommandButton command="admin.rider.refund" className="dash-btn" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} amountOre={Math.round(refundAmount * place.minorUnits)} before={refundRide?.id ?? ""} after={`${refundAmount} ${symbol} to ${refundTo}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={refund.care} disabled={!can(role, "finance.read") || Boolean(refund.error)} title={refund.error} onDone={() => { setNotice(refund.needsApproval ? `Refund of ${refundAmount} ${symbol} is waiting for a second admin to approve.` : `Refunded ${refundAmount} ${symbol} to the rider's ${DESTINATIONS.find((item) => item.id === refundTo)?.label.toLowerCase()}.`); setRefundReason(""); setRefundId(""); }}>
                <RotateCcw size={14} aria-hidden="true" /> Refund {refundAmount ? `${refundAmount} ${symbol}` : ""}
              </CommandButton>
            </section>
          </div>
          <section className="fd-box">
            <h3>Refund history</h3>
            {refundsFor.length === 0 ? <p className="state-line">No refund for this rider.</p> : (
              <ul className="rd-ledger" aria-label="Refunds">
                {refundsFor.map((item) => (
                  <li key={item.id}>
                    <b>{item.amount} {symbol}</b>
                    <span>{item.bookingId} · to {item.destination} · {item.reason}</span>
                    <span className={`rd-refund-status r-${item.status}`}>{item.status === "waiting" ? "Waiting for approval" : item.status === "sent" ? "Sent" : "Rejected"}</span>
                    <small>Asked by {item.by} · {dateTime.format(Date.parse(item.at))}{item.decidedBy ? ` · decided by ${item.decidedBy}` : ""}</small>
                    {item.status === "waiting" && can(role, "approval.decide") ? (
                      <span className="rd-inline">
                        <CommandButton command="admin.rider.refundDecide" className="dash-btn small" targetId={item.id} confirmTarget={false} scope={rider.zoneId} before="waiting" after="approved" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={decideRefund(care, item.id, true, me).care} disabled={Boolean(decideRefund(care, item.id, true, me).error)} title={decideRefund(care, item.id, true, me).error} onDone={() => setNotice("Refund approved and sent.")}>Approve</CommandButton>
                        <CommandButton command="admin.rider.refundDecide" className="dash-btn small ghost" targetId={item.id} confirmTarget={false} scope={rider.zoneId} before="waiting" after="rejected" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={decideRefund(care, item.id, false, me).care} disabled={Boolean(decideRefund(care, item.id, false, me).error)} title={decideRefund(care, item.id, false, me).error} onDone={() => setNotice("Refund rejected.")}>Reject</CommandButton>
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
              <h3><Gift size={16} aria-hidden="true" /> Promotions on this account</h3>
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
            {tone ? <span className={`rd-badge reply t-${tone}`}>Waiting {waitText(row.waitingMin ?? 0)}</span> : <span className="rd-badge done">All answered</span>}
            <span className="fine">{care.assigned[rider.id] ? `Assigned to ${care.assigned[rider.id]}` : "Not assigned"}</span>
            {care.assigned[rider.id] !== me ? (
              <CommandButton command="admin.rider.assign" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={care.assigned[rider.id] ?? "nobody"} after={me} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={assign(care, rider.id, me)} disabled={!can(role, "support.reply")} onDone={() => setNotice("Conversation assigned to you.")}>Assign to me</CommandButton>
            ) : (
              <CommandButton command="admin.rider.assign" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={me} after="nobody" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={assign(care, rider.id, null)} onDone={() => setNotice("Conversation unassigned.")}>Unassign</CommandButton>
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
              <h3>Support tickets</h3>
              {row.complaint ? <p className="fd-banner amber"><AlertTriangle size={14} aria-hidden="true" /> Open complaint: {row.complaint}</p> : null}
              {tickets.length === 0 ? <p className="state-line">No ticket for this rider.</p> : <ul className="rd-ledger">{tickets.map((item) => <li key={item.id}><Link to={`/tickets/${item.id}`}>{item.id}</Link><span>{statusLabelOf(item.status)}</span></li>)}</ul>}
              <Link className="link-action" to="/support">Open the support queue</Link>
            </section>
            <section className="fd-box">
              <h3><Package size={16} aria-hidden="true" /> Lost and found</h3>
              {lost.length === 0 ? <p className="state-line">No lost item reported.</p> : (
                <ul className="rd-ledger" aria-label="Lost items">
                  {lost.map((item) => (
                    <li key={item.id}>
                      <b>{item.item}</b>
                      <span className={`rd-lost l-${item.status.replace(" ", "-")}`}>{item.status}</span>
                      <small>{item.bookingId || "ride not known"} · {dateTime.format(Date.parse(item.at))}</small>
                      {item.status !== "returned" ? <CommandButton command="admin.rider.lostFound" className="dash-btn small ghost" targetId={item.id} confirmTarget={false} scope={rider.zoneId} before={item.status} after="next" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={advanceLostItem(care, rider.id, item.id)} onDone={() => setNotice(`${item.item}: ${item.status === "reported" ? "driver contacted" : "returned"}.`)}>{item.status === "reported" ? "Driver contacted" : "Returned to rider"}</CommandButton> : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="rd-form-grid">
                <label className="field">Item<input aria-label="Lost item" value={lostItem} onChange={(event) => setLostItem(event.target.value)} placeholder="Black umbrella" /></label>
                <label className="field">Ride
                  <select aria-label="Lost item ride" value={lostRide} onChange={(event) => setLostRide(event.target.value)}>
                    <option value="">Not sure</option>
                    {row.bookings.filter((booking) => booking.status === "completed").slice(0, 10).map((booking) => <option key={booking.id} value={booking.id}>{date.format(booking.at)} · {booking.driverName ?? "driver"}</option>)}
                  </select>
                </label>
              </div>
              <CommandButton command="admin.rider.lostFound" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before="" after={lostItem} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={lostNext.care} disabled={Boolean(lostNext.error)} onDone={() => { setNotice(`${lostItem} reported as lost.`); setLostItem(""); }}>Report lost item</CommandButton>
            </section>
          </div>
        </TabPanel>

        <TabPanel id="safety" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3><Shield size={16} aria-hidden="true" /> Reports from drivers</h3>
              {reports.length === 0 ? <p className="state-line">No driver reported this rider.</p> : <ul className="rd-ledger">{reports.map((item) => <li key={item.id}><b>{item.reason}</b><span>by {item.driver}</span><small>{date.format(item.at)} · {item.photos} photo{item.photos === 1 ? "" : "s"}</small></li>)}</ul>}
              <h4>Drivers who blocked this rider</h4>
              {blockers.length ? <p>{blockers.join(", ")}</p> : <p className="state-line">None.</p>}
            </section>
            <section className="fd-box">
              <h3>Trusted contacts</h3>
              {profile.trustedContacts.length === 0 ? <p className="state-line">The rider shares trips with nobody.</p> : <ul className="rd-ledger">{profile.trustedContacts.map((item) => <li key={item.name}><b>{item.name}</b><span>{item.relation}</span></li>)}</ul>}
              <h4>Safety incidents</h4>
              {incidents.length === 0 ? <p className="state-line">No incident.</p> : <ul className="rd-ledger">{incidents.map((item) => <li key={item.id}><Link to={`/incidents/${item.id}`}>{item.id}</Link><span>{statusLabelOf(item.status)}</span></li>)}</ul>}
            </section>
            <section className="fd-box">
              <h3><BadgeCheck size={16} aria-hidden="true" /> Identity check</h3>
              <p>{care.identity[rider.id] === "verified" ? "Identity verified." : care.identity[rider.id] === "requested" ? "Asked the rider to verify their identity." : "Not checked. Ask for it for high-risk riders or large wallet balances."}</p>
              {care.identity[rider.id] !== "verified" ? (
                <CommandButton command="admin.rider.identity" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={care.identity[rider.id] ?? "none"} after={care.identity[rider.id] === "requested" ? "verified" : "requested"} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={setIdentity(care, rider.id, care.identity[rider.id] === "requested" ? "verified" : "requested")} disabled={!can(role, "riders.block")} onDone={() => setNotice(care.identity[rider.id] === "requested" ? "Identity marked as verified." : "Identity check requested.")}>
                  {care.identity[rider.id] === "requested" ? "Mark as verified" : "Ask to verify identity"}
                </CommandButton>
              ) : null}
            </section>
          </div>
        </TabPanel>

        <TabPanel id="account" activeId={tab}>
          <div className="rd-overview">
            <section className="fd-box">
              <h3><Smartphone size={16} aria-hidden="true" /> Sessions</h3>
              <ul className="rd-ledger" aria-label="Rider sessions">{ops.sessions.map((session) => <li key={session.id}><b>{session.platform} · {session.device}</b><span>{session.active ? "Signed in" : "Signed out"}</span></li>)}</ul>
              <CommandButton command="admin.rider.signOut" className="dash-btn small ghost" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={`${activeSessions.length} active sessions`} after="0 active sessions" expectedSliceRev={book.draftRev} sliceKey="riderOps" value={revokeRiderSessions(book, seed, me)} disabled={activeSessions.length === 0} onDone={() => setNotice("Signed out of every active rider session.")}>Sign out all sessions</CommandButton>
            </section>
            <section className="fd-box">
              <h3><Ban size={16} aria-hidden="true" /> Ban list</h3>
              <p className="fine">A banned phone or card cannot open a new account.</p>
              <div className="fd-action-row">
                <CommandButton command="admin.rider.ban" className="dash-btn small danger" targetId={rider.id} scope={rider.zoneId} before="allowed" after="phone banned" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={ban(care, "phones", rider.phone, rider.id, reason || "Banned by admin", me, now).care} disabled={!can(role, "riders.block") || care.bans.phones.some((item) => item.value === rider.phone)} onDone={() => setNotice("Phone number added to the ban list.")}>Ban phone number</CommandButton>
                <CommandButton command="admin.rider.ban" className="dash-btn small danger" targetId={rider.id} scope={rider.zoneId} before="allowed" after="card banned" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={ban(care, "cards", profile.payment.method, rider.id, reason || "Banned by admin", me, now).care} disabled={!can(role, "riders.block") || care.bans.cards.some((item) => item.value === profile.payment.method)} onDone={() => setNotice("Card added to the ban list.")}>Ban card</CommandButton>
              </div>
            </section>
            <section className="fd-box">
              <h3><Link2 size={16} aria-hidden="true" /> Merge duplicate account</h3>
              <p className="fine">Same person with two accounts? Keep the other one; this one points to it.</p>
              <div className="rd-inline">
                <input aria-label="Account to keep" value={mergeInto} onChange={(event) => setMergeInto(event.target.value)} placeholder="Rider id, e.g. R0042" />
                <CommandButton command="admin.rider.merge" className="dash-btn small" targetId={rider.id} scope={rider.zoneId} before={rider.id} after={`merged into ${mergeInto}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={mergeNext.care} disabled={!can(role, "riders.block") || Boolean(mergeNext.error) || Boolean(mergedInto)} title={mergeNext.error} onDone={() => setNotice(`Merged into ${mergeInto.toUpperCase()}.`)}>Merge</CommandButton>
              </div>
            </section>
            <section className="fd-box">
              <h3>Privacy request</h3>
              <p>Status: {ops.privacy}</p>
              <CommandButton command="admin.rider.privacy" className="dash-btn small ghost" targetId={rider.id} scope={rider.zoneId} before={ops.privacy} after="next" expectedSliceRev={book.draftRev} sliceKey="riderOps" value={advanceRiderPrivacy(book, seed, me)} disabled={ops.privacy === "done"} onDone={() => setNotice("Privacy request advanced.")}>Advance privacy</CommandButton>
            </section>
            <section className="fd-box">
              <h3>Private note</h3>
              <p className="fd-note-text">{ops.privateNote || "No private note."}</p>
              <textarea aria-label="Private internal note" rows={3} value={note} maxLength={NOTE_MAX} onChange={(event) => setNote(event.target.value)} />
              <CommandButton command="admin.rider.note" className="dash-btn small" targetId={rider.id} confirmTarget={false} scope={rider.zoneId} before={ops.privateNote || "empty"} after={note || "empty"} expectedSliceRev={book.draftRev} sliceKey="riderOps" value={setRiderNote(book, seed, note, me)} disabled={!note.trim()} onDone={() => { setNotice("Private rider note saved."); setNote(""); }}>Save private note</CommandButton>
              {ops.accountReason ? <p className="fine">Latest account reason: {ops.accountReason}</p> : null}
            </section>
          </div>
        </TabPanel>

        <TabPanel id="activity" activeId={tab}>
          <Timeline items={[
            { at: profile.joinedAt, text: "Joined Movera", tone: "violet" },
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
    <ol className="rd-timeline" aria-label="Rider timeline">
      {sorted.map((item, index) => <li key={`${item.at}-${index}`} className={`t-${item.tone}`}><time>{format(item.at)}</time><span>{item.text}</span></li>)}
    </ol>
  );
}
