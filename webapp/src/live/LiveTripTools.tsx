import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Flag, Headset, ShieldCheck, Shuffle, StickyNote } from "lucide-react";
import { tr } from "../i18n";
import type { LiveTripFacts } from "../api/seed";
import { useLiveSession, useLiveSessionMaybe } from "./LiveSessionContext";
import { liveMoney } from "./format";
import { ErrorLine } from "./ui";
import type { AdminTripFlag, AdminTripNote, Page } from "./types";

/**
 * v0.18.9 (driver group 7, contract.json#onTrip.adminTrip.new; Rules decisions/admin-fake-by-group.md G7): the trip
 * page's admin tools on live, each a real server call — the server's ride check and route change, Flag (with the
 * Trips list "Flagged only" filter), notes for other admins, Open case (the admin chooses whether the person sees
 * it, default internal), Reveal phone with a reason (audited without the number). Returns null in a demo build.
 */
export function LiveTripTools({ tripId, facts, hasDriver }: { tripId: string; facts: LiveTripFacts | null; hasDriver: boolean }) {
  const live = useLiveSessionMaybe();
  if (!live) return null;
  return <Tools tripId={tripId} facts={facts} hasDriver={hasDriver} />;
}

const CASE_CATEGORIES = ["ride_dispute", "help", "lost_item", "payment", "account", "safety", "other"] as const;

function categoryLabel(id: string): string {
  if (id === "ride_dispute") return tr("Trip problem");
  if (id === "help") return tr("Help");
  if (id === "lost_item") return tr("Lost item");
  if (id === "payment") return tr("Payment");
  if (id === "account") return tr("Account");
  if (id === "safety") return tr("Safety");
  return tr("Other");
}

export function triggerText(trigger: string): string {
  if (trigger === "long_stop") return tr("The car has been standing still for a while.");
  if (trigger === "off_route") return tr("The car is far from the planned route.");
  if (trigger === "dropped_far") return tr("The trip ended far from the destination.");
  if (trigger === "possible_crash") return tr("Possible crash");
  return trigger;
}

function answerText(answer: string | undefined): string {
  if (answer === "ok") return tr("I'm OK");
  if (answer === "need_help") return tr("I need help");
  if (answer === "no_answer") return tr("No answer");
  return tr("Waiting for an answer");
}

function routeStatusText(status: string): string {
  if (status === "pending") return tr("Waiting for the driver");
  if (status === "accepted") return tr("Accepted");
  if (status === "refused") return tr("Refused by the driver");
  if (status === "expired") return tr("No answer: the old route stays");
  if (status === "withdrawn") return tr("Taken back by the rider");
  return status;
}

function Tools({ tripId, facts, hasDriver }: { tripId: string; facts: LiveTripFacts | null; hasDriver: boolean }) {
  const { client } = useLiveSession();
  const queryClient = useQueryClient();
  const path = `/admin/trips/${encodeURIComponent(tripId)}`;
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [flagWhy, setFlagWhy] = useState("");
  const [flag, setFlag] = useState<AdminTripFlag | null>(null);
  const [note, setNote] = useState("");
  const [about, setAbout] = useState<"rider" | "driver">("rider");
  const [category, setCategory] = useState<string>("ride_dispute");
  const [subject, setSubject] = useState("");
  const [caseText, setCaseText] = useState("");
  const [visible, setVisible] = useState(false);
  const [who, setWho] = useState<"rider" | "driver">("rider");
  const [revealWhy, setRevealWhy] = useState("");
  const [phone, setPhone] = useState<{ who: string; phone: string } | null>(null);
  const notes = useQuery({ queryKey: ["live", "trip-notes", tripId], queryFn: () => client.json<Page<AdminTripNote>>(`${path}/notes`) });
  const flagged = flag ? flag.flagged : Boolean(facts?.adminFlag?.flagged);
  const flagReason = flag ? flag.reason ?? null : facts?.adminFlag?.reason ?? null;
  const currency = facts?.currency ?? "SEK";

  const run = async (work: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      setNotice(await work());
      // G7 live fix: "Who did what" (the audit) shows this action at once.
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const check = facts?.rideCheck ?? null;
  const change = facts?.routeChange ?? null;
  return (
    <div className="op-actions-grid" data-testid="live-trip-tools">
      {check ? (
        <div className="op-action green" data-testid="trip-ride-check">
          <h4><ShieldCheck size={15} aria-hidden="true" /> {tr("Ride check")}</h4>
          <p>{triggerText(check.trigger)}</p>
          <p>{tr("Rider")}: <b>{answerText(check.answers.rider)}</b> · {tr("Driver")}: <b>{answerText(check.answers.driver)}</b></p>
          {check.alertedAt ? <p className="dx-warn">{tr("No answer in time: the safety team was alerted.")}</p> : null}
        </div>
      ) : null}
      {change ? (
        <div className="op-action blue" data-testid="trip-route-change">
          <h4><Shuffle size={15} aria-hidden="true" /> {tr("Route change")}</h4>
          <p>{routeStatusText(change.status)}</p>
          <p>{tr("New destination")}: {change.dropoff.address ?? `${change.dropoff.lat}, ${change.dropoff.lng}`}{change.stops.length ? ` · ${tr("Stops")}: ${change.stops.length}` : ""}</p>
          <p>{tr("New price")}: <b>{liveMoney({ amountMinor: change.totalMinor, currency })}</b> ({change.differenceMinor >= 0 ? "+" : "−"}{liveMoney({ amountMinor: Math.abs(change.differenceMinor), currency })})</p>
          {change.driverEarningsMinor !== null ? <p>{tr("Driver gets")}: <b>{liveMoney({ amountMinor: change.driverEarningsMinor, currency })}</b></p> : null}
        </div>
      ) : null}

      <div className="op-action pink">
        <h4><Flag size={15} aria-hidden="true" /> {flagged ? tr("Flagged for a closer look") : tr("Flag the trip")}</h4>
        {flagged && flagReason ? <p data-testid="trip-flag-reason">{flagReason}</p> : null}
        <input aria-label={flagged ? tr("Why remove the flag") : tr("Why flag")} value={flagWhy} maxLength={500} placeholder={flagged ? tr("Optional: what you found") : tr("Why? For example: rider says the route was too long")} onChange={(event) => setFlagWhy(event.target.value)} />
        <button data-command="admin.trip.flag" type="button" className="dash-btn small" disabled={busy} onClick={() => void run(async () => {
          const next = await client.post<AdminTripFlag>(`${path}/flag`, { flagged: !flagged, ...(flagWhy.trim() ? { reason: flagWhy.trim() } : {}) });
          setFlag(next ?? { flagged: !flagged });
          setFlagWhy("");
          void queryClient.invalidateQueries({ queryKey: ["records"] });
          return flagged ? tr("Flag removed.") : tr("Trip flagged.");
        })}>{flagged ? tr("Remove flag") : tr("Flag trip")}</button>
      </div>

      <div className="op-action amber">
        <h4><StickyNote size={15} aria-hidden="true" /> {tr("Note for other admins")}</h4>
        {notes.error ? <ErrorLine error={notes.error} onRetry={() => void notes.refetch()} /> : null}
        <ul className="op-history" aria-label={tr("Notes on this trip")}>
          {(notes.data?.items ?? []).map((item) => <li key={item.noteId}><time>{new Date(item.at).toLocaleString()}</time><b>{item.adminName ?? item.adminId}</b><span>{item.text}</span></li>)}
        </ul>
        <textarea aria-label={tr("Trip note")} rows={2} value={note} maxLength={2000} placeholder={tr("What happened, what you did")} onChange={(event) => setNote(event.target.value)} />
        <button data-command="admin.trip.note" type="button" className="dash-btn small" disabled={busy || !note.trim()} onClick={() => void run(async () => {
          await client.post(`${path}/notes`, { text: note.trim() });
          setNote("");
          await notes.refetch();
          return tr("Note saved.");
        })}>{tr("Save note")}</button>
      </div>

      <div className="op-action violet">
        <h4><Headset size={15} aria-hidden="true" /> {tr("Open a case")}</h4>
        <label>{tr("About")} <select aria-label={tr("Case about")} value={about} onChange={(event) => setAbout(event.target.value as "rider" | "driver")}>
          <option value="rider">{tr("Rider")}</option>
          <option value="driver" disabled={!hasDriver}>{tr("Driver")}</option>
        </select></label>
        <label>{tr("Category")} <select aria-label={tr("Case category")} value={category} onChange={(event) => setCategory(event.target.value)}>
          {CASE_CATEGORIES.map((id) => <option key={id} value={id}>{categoryLabel(id)}</option>)}
        </select></label>
        <input aria-label={tr("Case subject")} value={subject} maxLength={200} placeholder={tr("Subject")} onChange={(event) => setSubject(event.target.value)} />
        <textarea aria-label={tr("What is the case about")} rows={2} value={caseText} maxLength={5000} placeholder={tr("What is it about?")} onChange={(event) => setCaseText(event.target.value)} />
        <label className="dx-check"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> {tr("The person sees this case in their app")}</label>
        <p className="op-help">{visible ? tr("The rider or driver sees the case and your message in their help list.") : tr("Internal: only admins see this case.")}</p>
        <button data-command="admin.trip.openCase" type="button" className="dash-btn small" disabled={busy || !subject.trim() || !caseText.trim()} onClick={() => void run(async () => {
          const ticket = await client.post<{ ticketId: string }>(`${path}/case`, { about, category, subject: subject.trim(), text: caseText.trim(), visibleToPerson: visible });
          setSubject("");
          setCaseText("");
          setVisible(false);
          void queryClient.invalidateQueries({ queryKey: ["records", "tickets"] });
          return tr("Case {0} opened.", [ticket?.ticketId ?? ""]);
        })}>{tr("Open case")}</button>
      </div>

      <div className="op-action grey">
        <h4><Eye size={15} aria-hidden="true" /> {tr("Reveal phone")}</h4>
        <label>{tr("Whose number")} <select aria-label={tr("Whose number")} value={who} onChange={(event) => setWho(event.target.value as "rider" | "driver")}>
          <option value="rider">{tr("Rider")}</option>
          <option value="driver" disabled={!hasDriver}>{tr("Driver")}</option>
        </select></label>
        <input aria-label={tr("Why do you need the number")} value={revealWhy} maxLength={500} placeholder={tr("Why do you need the number?")} onChange={(event) => setRevealWhy(event.target.value)} />
        <button data-command="admin.trip.revealSensitive" type="button" className="dash-btn small" disabled={busy || !revealWhy.trim()} onClick={() => void run(async () => {
          const answer = await client.post<{ who: string; phone: string }>(`${path}/reveal-contact`, { who, reason: revealWhy.trim() });
          setPhone(answer ? { who: answer.who, phone: answer.phone } : null);
          setRevealWhy("");
          return tr("Shown. The reason is logged, the number is not.");
        })}>{tr("Show number")}</button>
        {phone ? <p data-testid="trip-revealed-phone"><b>{phone.who === "driver" ? tr("Driver") : tr("Rider")}:</b> <a href={`tel:${phone.phone}`}>{phone.phone}</a></p> : null}
      </div>

      {notice ? <p className="state-line" role="status" data-testid="live-trip-tools-notice">{notice}</p> : null}
      {error ? <ErrorLine error={error} /> : null}
    </div>
  );
}
