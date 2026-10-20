import { useState, type ReactNode } from "react";
import { useRefundPolicy } from "../payments/useRefundPolicy";
import { Link } from "react-router";
import { Ban, Check, Flag, Headset, Lock, MessageSquare, Phone, PhoneMissed, Receipt, RotateCcw, Siren, StickyNote, Wallet } from "lucide-react";
import type { DemoRecord } from "../api/seed";
import { useSession } from "../auth/SessionContext";
import { AGENTS, can } from "../auth/permissions";
import { market, type MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import {
  TRIP_OPS_KEY,
  addEntry,
  callSummary,
  decide,
  isFlagged,
  needsApproval,
  withStatus,
  type CallLine,
  type ChatLine,
  type Entry,
  type MoneySplit,
  type NewEntry,
  type TripOps,
} from "./file";

export const agentName = (id: string) => AGENTS.find((agent) => agent.id === id)?.name ?? id;

export function Section({ id, title, icon, aside, children, testId, wide = false }: { id: string; title: string; icon: ReactNode; aside?: ReactNode; children: ReactNode; testId?: string; wide?: boolean }) {
  return (
    <section id={id} className={wide ? "op-section wide" : "op-section"} aria-label={title} data-testid={testId}>
      <header className="op-section-head"><h3><span aria-hidden="true">{icon}</span> {title}</h3>{aside}</header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ money */

export function SplitView({ split, money }: { split: MoneySplit; money: (minor: number) => string }) {
  if (split.state === "none") return <p className="dx-calm">No money moved on this trip.</p>;
  const pct = (value: number) => (split.riderPaid > 0 ? Math.max(0, Math.round((value / split.riderPaid) * 100)) : 0);
  return (
    <div className="op-split">
      {split.state === "estimate" ? <p className="dx-note">The trip is not finished. These numbers are an estimate from the price at booking.</p> : null}
      {split.state === "cancel_fee" ? <p className="dx-note">The trip was cancelled. The rider paid a fee.</p> : null}
      <div className="op-split-bar" role="img" aria-label={`Driver ${pct(split.driverGets)}%, Movera ${pct(split.moveraKeeps)}%${split.fleet ? `, fleet owner ${pct(split.fleet)}%` : ""}`}>
        <i className="driver" style={{ width: `${pct(split.driverGets)}%` }} />
        {split.fleet ? <i className="fleet" style={{ width: `${pct(split.fleet)}%` }} /> : null}
        <i className="movera" style={{ width: `${pct(split.moveraKeeps)}%` }} />
      </div>
      <dl className="op-split-lines">
        <div className="head"><dt>Trip price</dt><dd>{money(split.price)}</dd></div>
        {split.appFee ? <div><dt>of which app fee</dt><dd>{money(split.appFee)}</dd></div> : null}
        {split.promo ? <div className="minus"><dt>Promotion (paid by Movera)</dt><dd>− {money(split.promo)}</dd></div> : null}
        {split.tip ? <div className="plus"><dt>Tip (all to the driver)</dt><dd>+ {money(split.tip)}</dd></div> : null}
        {split.refunded ? <div className="minus"><dt>Refunded to the rider</dt><dd>− {money(split.refunded)}</dd></div> : null}
        <div className="total"><dt>Rider paid</dt><dd>{money(split.riderPaid)}</dd></div>
        <div className="sep"><dt>Movera commission {split.commissionPct}%</dt><dd>{money(split.commission)}</dd></div>
        {split.payChange ? <div className={split.payChange > 0 ? "plus" : "minus"}><dt>Pay change by an admin</dt><dd>{split.payChange > 0 ? "+ " : "− "}{money(Math.abs(split.payChange))}</dd></div> : null}
        {split.driverBonus ? <div className="plus" data-testid="split-driver-bonus"><dt>Money added for the driver (paid by Movera)</dt><dd>+ {money(split.driverBonus)}</dd></div> : null}
        <div className="driver"><dt><i aria-hidden="true" /> Driver gets</dt><dd>{money(split.driverGets)}</dd></div>
        {split.fleet ? <div className="fleet"><dt><i aria-hidden="true" /> Fleet owner gets {split.fleetPct}%</dt><dd>{money(split.fleet)}</dd></div> : null}
        <div className="movera"><dt><i aria-hidden="true" /> Movera keeps</dt><dd>{money(split.moveraKeeps)}</dd></div>
        {split.driverBonus && split.moveraKeeps < 0 ? <div className="minus" data-testid="split-beyond-commission"><dt>Movera pays beyond its commission</dt><dd>{money(-split.moveraKeeps)}</dd></div> : null}
        <div className="vat"><dt>VAT included ({Math.round(split.vatRate * 100)}%, to confirm)</dt><dd>{money(split.vat)}</dd></div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ chat and calls */

export function ChatCalls({ chat, calls, revealed, allowed, reveal, country, riderName, driverName }: { chat: readonly ChatLine[]; calls: readonly CallLine[]; revealed: boolean; allowed: boolean; reveal: ReactNode; country: MarketId; riderName: string; driverName: string }) {
  const time = (iso: string) => new Intl.DateTimeFormat(market(country).locale, { timeZone: market(country).timeZone, timeStyle: "short" }).format(new Date(iso));
  return (
    <div className="op-chat-grid">
      <div>
        <h4 className="op-sub">Calls through Movera</h4>
        <p className="op-call-summary" data-testid="trip-calls">{calls.length || chat.length ? callSummary(calls) : "No driver was assigned, so there were no calls."}.</p>
        {calls.length ? (
          <ul className="op-calls" aria-label="Calls">
            {calls.map((call) => (
              <li key={call.at} className={call.answered ? "ok" : "missed"}>
                {call.answered ? <Phone size={14} aria-hidden="true" /> : <PhoneMissed size={14} aria-hidden="true" />}
                <span><b>{call.from === "driver" ? `${driverName} called ${riderName}` : `${riderName} called ${driverName}`}</b><small>{time(call.at)} · {call.answered ? `${Math.floor(call.seconds / 60)}:${String(call.seconds % 60).padStart(2, "0")} min` : "Not answered"}</small></span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="op-help">Calls go through the Movera line: rider and driver never see each other's real number. Calls are not recorded.</p>
      </div>
      <div>
        <h4 className="op-sub">Messages in the app {chat.length ? <span className="dx-count">{chat.filter((line) => line.from !== "system").length}</span> : null}</h4>
        {!chat.length ? <p className="dx-calm">No messages on this trip.</p> : revealed ? (
          <ol className="op-chat" aria-label="Messages between rider and driver">
            {chat.map((line) => (
              <li key={line.at + line.text} className={line.from}>
                {line.from === "system" ? <small>{line.text}</small> : <><span>{line.text}</span><small>{line.from === "rider" ? riderName : driverName} · {time(line.at)}</small></>}
              </li>
            ))}
          </ol>
        ) : (
          <div className="op-locked">
            <Lock size={18} aria-hidden="true" />
            <p>{allowed ? "Messages are private. Show them only when you need them, for example for a complaint." : "Your role cannot see messages between riders and drivers."}</p>
            {allowed ? reveal : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ admin actions */

type ActionProps = { trip: DemoRecord; ops: TripOps; split: MoneySplit; money: (minor: number) => string; country: MarketId; riderId: string; onNotice: (text: string) => void };

function useEntry(ops: TripOps) {
  const { agent } = useSession();
  return (input: NewEntry, split?: MoneySplit) => {
    return addEntry(ops, input, agent?.id ?? "", new Date().toISOString(), split);
  };
}

export function AdminActions({ trip, ops, split, money, country, riderId, onNotice }: ActionProps) {
  const { agent } = useSession();
  const role = agent?.role ?? "viewer";
  const make = useEntry(ops);
  const { policy: refundPolicy } = useRefundPolicy();
  const on = ops.settings.actions;
  const minor = market(country).minorUnits;
  const symbol = { SE: "kr", FR: "€", TN: "DT" }[country];
  const [refund, setRefund] = useState("");
  const [pay, setPay] = useState("");
  const [note, setNote] = useState("");
  const [flagWhy, setFlagWhy] = useState("");
  const [caseKind, setCaseKind] = useState<"ticket" | "incident">("ticket");
  const [caseText, setCaseText] = useState("");
  const flagged = isFlagged(ops, trip.id);
  const blocked = ops.entries.some((entry) => entry.tripId === trip.id && entry.kind === "block" && entry.status === "done");
  const refundable = Math.max(0, split.riderPaid - split.tip);
  const refundMinor = Math.round(Number(refund.replace(",", ".")) * minor) || 0;
  const payMinor = Math.round(Number(pay.replace(",", ".")) * minor) || 0;
  const refundTry = withStatus(make({ tripId: trip.id, kind: "refund", text: `Refund ${money(refundMinor)}`, amountMinor: refundMinor }, split), needsApproval("refund", refundMinor, country, refundPolicy));
  const payTry = withStatus(make({ tripId: trip.id, kind: "pay", text: `Driver pay ${payMinor > 0 ? "+" : "−"}${money(Math.abs(payMinor))}`, amountMinor: payMinor }, split), needsApproval("pay", payMinor, country, refundPolicy));
  const noteTry = make({ tripId: trip.id, kind: "note", text: note.trim() });
  const flagTry = make({ tripId: trip.id, kind: flagged ? "unflag" : "flag", text: flagWhy.trim() || (flagged ? "Checked" : "") });
  const caseTry = make({ tripId: trip.id, kind: "case", text: caseText.trim(), target: caseKind });
  const blockTry = make({ tripId: trip.id, kind: "block", text: `${trip.name} and the driver will not be matched again`, target: "both" });
  const receiptTry = make({ tripId: trip.id, kind: "receipt", text: `Receipt sent again to ${trip.name}` });
  const limit = `${refundPolicy.aboveMajor[country]} ${symbol}`;
  const any = Object.values(on).some(Boolean);
  const save = (result: { ops: TripOps; entry: Entry; error?: string }) => ({ sliceKey: TRIP_OPS_KEY, value: result.ops, expectedSliceRev: ops.draftRev, targetId: trip.id, scope: trip.zoneId, confirmTarget: false });

  if (!any) return <p className="dx-calm">All admin actions are turned off in Trip settings.</p>;
  return (
    <div className="op-actions-grid" data-testid="trip-admin-actions">
      {on.refund ? (
        <div className="op-action green">
          <h4><RotateCcw size={15} aria-hidden="true" /> Refund the rider</h4>
          <p className="op-help">Up to {money(refundable)}. Over {limit}, a second admin approves.</p>
          <div className="op-inline">
            <label className="op-money"><input aria-label="Refund amount" inputMode="decimal" value={refund} placeholder="0" onChange={(event) => setRefund(event.target.value)} /><span>{symbol}</span></label>
            <button data-command="admin.trip.view" type="button" className="dash-btn small ghost" disabled={!refundable} onClick={() => setRefund(String(refundable / minor))}>Full amount</button>
            <CommandButton command="admin.trip.partRefund" className="dash-btn small" {...save(refundTry)} before={money(split.riderPaid)} after={refundTry.error ? "" : `${refundTry.entry.status === "waiting" ? "waiting: " : ""}refund ${money(refundMinor)}`} disabled={!can(role, "payments.refund") || Boolean(refundTry.error)} title={!can(role, "payments.refund") ? "Your role cannot refund." : refundTry.error} onDone={() => { setRefund(""); onNotice(refundTry.entry.status === "waiting" ? `Refund of ${money(refundMinor)} waits for a second admin.` : `${money(refundMinor)} refunded to ${trip.name}.`); }}>{needsApproval("refund", refundMinor, country, refundPolicy) ? "Ask a second admin" : "Give money back"}</CommandButton>
          </div>
          {refund && refundTry.error ? <p className="dx-warn">{refundTry.error}</p> : null}
        </div>
      ) : null}
      {on.pay ? (
        <div className="op-action blue">
          <h4><Wallet size={15} aria-hidden="true" /> Change the driver's pay</h4>
          <p className="op-help">Use + to add, − to take away. Over {limit}, a second admin approves.</p>
          <div className="op-inline">
            <label className="op-money"><input aria-label="Driver pay change" inputMode="decimal" value={pay} placeholder="+0" onChange={(event) => setPay(event.target.value)} /><span>{symbol}</span></label>
            <CommandButton command="admin.trip.pay" className="dash-btn small" {...save(payTry)} before={money(split.driverGets)} after={payTry.error ? "" : money(split.driverGets + payMinor)} disabled={!can(role, "trips.intervene") || Boolean(payTry.error)} title={!can(role, "trips.intervene") ? "Your role cannot change driver pay." : payTry.error} onDone={() => { setPay(""); onNotice(payTry.entry.status === "waiting" ? "The pay change waits for a second admin." : "Driver pay changed."); }}>{needsApproval("pay", payMinor, country, refundPolicy) ? "Ask a second admin" : "Change pay"}</CommandButton>
          </div>
          {pay && payTry.error ? <p className="dx-warn">{payTry.error}</p> : null}
        </div>
      ) : null}
      {on.note ? (
        <div className="op-action amber">
          <h4><StickyNote size={15} aria-hidden="true" /> Note for other admins</h4>
          <textarea aria-label="Trip note" rows={2} value={note} placeholder="What happened, what you did" onChange={(event) => setNote(event.target.value)} />
          <CommandButton command="admin.trip.note" className="dash-btn small" {...save(noteTry)} before="" after={note.trim()} disabled={Boolean(noteTry.error)} onDone={() => { setNote(""); onNotice("Note saved."); }}>Save note</CommandButton>
        </div>
      ) : null}
      {on.flag ? (
        <div className="op-action pink">
          <h4><Flag size={15} aria-hidden="true" /> {flagged ? "Flagged for a closer look" : "Flag the trip"}</h4>
          <input aria-label={flagged ? "Why remove the flag" : "Why flag"} value={flagWhy} placeholder={flagged ? "Optional: what you found" : "Why? For example: rider says the route was too long"} onChange={(event) => setFlagWhy(event.target.value)} />
          <CommandButton command="admin.trip.flag" className="dash-btn small" {...save(flagTry)} before={flagged ? "flagged" : "not flagged"} after={flagged ? "not flagged" : "flagged"} disabled={Boolean(flagTry.error)} title={flagTry.error} onDone={() => { setFlagWhy(""); onNotice(flagged ? "Flag removed." : "Trip flagged."); }}>{flagged ? "Remove flag" : "Flag trip"}</CommandButton>
        </div>
      ) : null}
      {on.case ? (
        <div className="op-action violet">
          <h4>{caseKind === "ticket" ? <Headset size={15} aria-hidden="true" /> : <Siren size={15} aria-hidden="true" />} Open a case</h4>
          <span className="dx-choice" role="radiogroup" aria-label="Case type">
            <label className={caseKind === "ticket" ? "on" : undefined}><input type="radio" name={`case-${trip.id}`} checked={caseKind === "ticket"} onChange={() => setCaseKind("ticket")} />Support ticket</label>
            <label className={caseKind === "incident" ? "on" : undefined}><input type="radio" name={`case-${trip.id}`} checked={caseKind === "incident"} onChange={() => setCaseKind("incident")} />Safety incident</label>
          </span>
          <input aria-label="What is the case about" value={caseText} placeholder="What is it about?" onChange={(event) => setCaseText(event.target.value)} />
          <CommandButton command="admin.trip.openCase" className="dash-btn small" {...save(caseTry)} before="" after={`${caseKind}: ${caseText.trim()}`} disabled={Boolean(caseTry.error)} onDone={() => { setCaseText(""); onNotice(`${caseKind === "ticket" ? "Support ticket" : "Incident"} opened for ${trip.id}.`); }}>Open {caseKind === "ticket" ? "ticket" : "incident"}</CommandButton>
        </div>
      ) : null}
      {on.block || on.receipt || on.contact ? (
        <div className="op-action grey">
          <h4>More</h4>
          <div className="op-inline wrap">
            {on.contact ? <Link className="dash-btn small ghost" to={`/riders/${riderId}?tab=messages`}><MessageSquare size={13} aria-hidden="true" /> Message rider</Link> : null}
            {on.contact && trip.driverId ? <Link className="dash-btn small ghost" to={`/drivers/${trip.driverId}?tab=messages`}><MessageSquare size={13} aria-hidden="true" /> Message driver</Link> : null}
            {on.receipt ? <CommandButton command="admin.trip.receipt" className="dash-btn small ghost" {...save(receiptTry)} before="" after="receipt sent" disabled={split.state === "none" || split.state === "estimate"} title={split.state === "estimate" ? "The trip is not finished." : undefined} onDone={() => onNotice(`Receipt sent again to ${trip.name}.`)}><Receipt size={13} aria-hidden="true" /> Resend receipt</CommandButton> : null}
            {on.block && trip.driverId ? <CommandButton command="admin.trip.block" className="dash-btn small danger-ghost" {...save(blockTry)} before="can be matched" after="never matched again" disabled={blocked || !can(role, "trips.intervene")} title={blocked ? "Already blocked." : undefined} onDone={() => onNotice("This rider and driver will not be matched again.")}><Ban size={13} aria-hidden="true" /> {blocked ? "Not matched again" : "Do not match again"}</CommandButton> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ approvals and history */

export function Waiting({ trip, ops, money, onNotice }: { trip: DemoRecord; ops: TripOps; money: (minor: number) => string; onNotice: (text: string) => void }) {
  const { agent } = useSession();
  const waiting = ops.entries.filter((entry) => entry.tripId === trip.id && entry.status === "waiting");
  if (!waiting.length) return null;
  return (
    <section className="op-waiting" aria-label="Waiting for a second admin">
      {waiting.map((entry) => {
        const approve = decide(ops, entry.id, agent?.id ?? "", true, new Date().toISOString());
        const decline = decide(ops, entry.id, agent?.id ?? "", false, new Date().toISOString());
        const mine = entry.actorId === agent?.id;
        return (
          <div key={entry.id} className="dx-approval">
            <span className="dx-approval-text"><b>{entry.kind === "refund" ? `Refund ${money(entry.amountMinor ?? 0)}` : `Driver pay ${money(entry.amountMinor ?? 0)}`} waits for a second admin</b><small>Asked by {agentName(entry.actorId)}{mine ? " (you). Another admin must decide." : ""}</small></span>
            <CommandButton command="admin.trip.decide" className="dash-btn small" sliceKey={TRIP_OPS_KEY} value={approve.ops} expectedSliceRev={ops.draftRev} targetId={trip.id} scope={trip.zoneId} confirmTarget={false} before="waiting" after="approved" disabled={Boolean(approve.error)} title={approve.error} onDone={() => onNotice("Approved.")}><Check size={13} aria-hidden="true" /> Approve</CommandButton>
            <CommandButton command="admin.trip.decide" className="dash-btn small ghost" sliceKey={TRIP_OPS_KEY} value={decline.ops} expectedSliceRev={ops.draftRev} targetId={trip.id} scope={trip.zoneId} confirmTarget={false} before="waiting" after="declined" disabled={Boolean(decline.error)} title={decline.error} onDone={() => onNotice("Declined.")}>Decline</CommandButton>
          </div>
        );
      })}
    </section>
  );
}

const ENTRY_TEXT: Record<Entry["kind"], string> = { note: "Note", flag: "Flagged", unflag: "Flag removed", refund: "Refund", pay: "Driver pay", block: "Do not match again", receipt: "Receipt sent again", case: "Case opened" };

export function entryLine(entry: Entry, money: (minor: number) => string): string {
  const amount = entry.amountMinor ? ` ${entry.amountMinor < 0 ? "−" : ""}${money(Math.abs(entry.amountMinor))}` : "";
  const state = entry.status === "waiting" ? " (waiting for a second admin)" : entry.status === "declined" ? ` (declined by ${agentName(entry.decidedBy ?? "")})` : entry.decidedBy ? ` (approved by ${agentName(entry.decidedBy)})` : "";
  const kind = entry.kind === "case" ? (entry.target === "incident" ? "Incident opened" : "Support ticket opened") : ENTRY_TEXT[entry.kind];
  return `${kind}${amount}${entry.kind === "refund" || entry.kind === "pay" || entry.kind === "block" || entry.kind === "receipt" ? "" : entry.text ? `: ${entry.text}` : ""}${state}`;
}
