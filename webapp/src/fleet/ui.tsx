import { useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowDownRight, ArrowUpRight, FileText, MapPin, MessageSquare, Phone, Send } from "lucide-react";
import type { DocStatus } from "../drivers/gate";
import type { ThreadMessage } from "../drivers/ops";
import { CommandButton } from "../ui/CommandButton";
import { DOC_CHOICES, docHealth, docLabel, type DocHealth, type HealthCount } from "./documents";
import { statusLabel, type StatusFamily } from "../domain/labels";
import { uiLocale, trx, tr, trn } from "../i18n";

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  let hue = 0;
  for (const char of name) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return (
    <span className="fd-avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 45% 32%)` }} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

const HEALTH_LABEL: Record<DocHealth, string> = { valid: "valid", expiring: "expiring", invalid: "missing or wrong", review: "waiting review" };

export function HealthPill({ health, children }: { health: DocHealth; children: ReactNode }) {
  return <span className={`fd-health h-${health}`}><i aria-hidden="true" />{children}</span>;
}

/** Compact green / orange / red counters for a set of documents. */
export function DocSummary({ counts, total }: { counts: HealthCount; total: number }) {
  return (
    <span className="fd-docsum" title={tr("{0} valid, {1} expiring, {2} missing or wrong, {3} waiting review", [counts.valid, counts.expiring, counts.invalid, counts.review])}>
      <span className="h-valid"><i aria-hidden="true" />{counts.valid}/{total}</span>
      {counts.expiring ? <span className="h-expiring"><i aria-hidden="true" />{counts.expiring}</span> : null}
      {counts.invalid ? <span className="h-invalid"><i aria-hidden="true" />{counts.invalid}</span> : null}
      {counts.review ? <span className="h-review"><i aria-hidden="true" />{counts.review}</span> : null}
      <span className="sr-only">{(["valid", "expiring", "invalid", "review"] as const).map((key) => `${counts[key]} ${HEALTH_LABEL[key]}`).join(", ")}</span>
    </span>
  );
}

/** A driver's account uses the contract words (driverAccountStatus); riders and fleet owners keep the panel's. */
export function AccountChip({ status, family }: { status: string; family?: StatusFamily }) {
  const label = family ? statusLabel(status, family) : trx(status === "on_hold" ? "On hold" : status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " "));
  return <span className={`fd-account a-${status}`}><i aria-hidden="true" />{label}</span>;
}

export function Stat({ label, value, delta, inverse = false, warn = null, hint }: { label: string; value: string; delta?: number | null; inverse?: boolean; warn?: "red" | "amber" | null; hint?: string }) {
  const up = (delta ?? 0) >= 0;
  const good = inverse ? !up : up;
  return (
    <div className={warn ? `fd-stat warn-${warn}` : "fd-stat"}>
      <span className="fd-stat-label">{trx(label)}</span>
      <strong className="fd-stat-value">{value}</strong>
      <span className="fd-stat-foot">
        {delta === undefined ? null : delta === null || !Number.isFinite(delta) ? <span className="delta flat">{tr("No comparison")}</span> : (
          <span className={good ? "delta good" : "delta bad"}>
            {up ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}
            {up ? "+" : "−"}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint ? <small>{trx(hint)}</small> : null}
      </span>
    </div>
  );
}

export type DocRow = { id: string; status: DocStatus; expiresAt: string; fileName: string; reviewerId: string; note: string; exempt?: boolean };

export type DocSave = {
  command: string;
  before: string;
  after: string;
  value: unknown;
  needsReason: boolean;
};

type DocumentsProps = {
  label: string;
  rows: DocRow[];
  nowMs: number;
  /** The country's first expiry warning in days: documents show orange from then. */
  warnDays?: number;
  canEdit: boolean;
  targetId: string;
  scope: string;
  sliceKey: string;
  expectedSliceRev: number;
  /** Build the command for saving a document with the chosen status, expiry date and note. */
  build: (row: DocRow, draft: { status: DocStatus; expiresAt: string; note: string }) => DocSave | null;
  onSaved: (message: string) => void;
};

/** One row per document: colour, status picker, expiry date and note, saved on its own. */
export function DocumentsTable(props: DocumentsProps) {
  return (
    <ul className="fd-docs" aria-label={props.label}>
      {props.rows.map((row) => <DocumentRow key={`${row.id}-${row.status}-${row.expiresAt}-${row.note}`} row={row} {...props} />)}
    </ul>
  );
}

function DocumentRow({ row, nowMs, warnDays, canEdit, targetId, scope, sliceKey, expectedSliceRev, build, onSaved }: DocumentsProps & { row: DocRow }) {
  const [status, setStatus] = useState<DocStatus>(row.status);
  const [expiresAt, setExpiresAt] = useState(row.expiresAt);
  const [note, setNote] = useState(row.note);
  const shown = docHealth({ status, expiresAt }, nowMs, warnDays);
  const saved = docHealth(row, nowMs, warnDays);
  const changed = status !== row.status || expiresAt !== row.expiresAt || note.trim() !== row.note;
  const save = changed ? build(row, { status, expiresAt, note }) : null;
  const name = docLabel(row.id);

  if (row.exempt) {
    return (
      <li className="fd-doc exempt" data-testid={`doc-${row.id}`}>
        <span className="fd-doc-icon"><FileText size={18} aria-hidden="true" /></span>
        <div className="fd-doc-main"><strong>{name}</strong><small>{tr("Provided by the fleet")}</small></div>
        <HealthPill health="valid">{tr("Not needed")}</HealthPill>
      </li>
    );
  }

  return (
    <li className={`fd-doc doc-${saved.health}`} data-testid={`doc-${row.id}`}>
      <span className="fd-doc-icon"><FileText size={18} aria-hidden="true" /></span>
      <div className="fd-doc-main">
        <strong>{name}</strong>
        <small>{row.fileName}{row.reviewerId ? tr(" · reviewed by {0}", [row.reviewerId]) : tr(" · not reviewed")}{row.note ? ` · ${row.note}` : ""}</small>
      </div>
      <HealthPill health={shown.health}>{trx(shown.label)}</HealthPill>
      <label className="fd-doc-field">
        <span>{tr("Status")}</span>
        <select aria-label={tr("{0} status", [name])} value={status} disabled={!canEdit} onChange={(event) => setStatus(event.target.value as DocStatus)}>
          {DOC_CHOICES.map((choice) => <option key={choice.status} value={choice.status}>{trx(choice.label)}</option>)}
        </select>
      </label>
      <label className="fd-doc-field">
        <span>{tr("Expires")}</span>
        <input type="date" aria-label={tr("{0} expiry date", [name])} value={expiresAt} disabled={!canEdit} onChange={(event) => setExpiresAt(event.target.value)} />
      </label>
      {status === "rejected" || status === "needed" || note ? (
        <label className="fd-doc-field wide">
          <span>{trn("Note to the {0}", sliceKey === "driverOps" ? tr("driver") : tr("owner"))}</span>
          <input aria-label={tr("{0} note", [name])} value={note} disabled={!canEdit} placeholder={status === "rejected" ? tr("What is wrong?") : tr("What is needed?")} onChange={(event) => setNote(event.target.value)} />
        </label>
      ) : null}
      <div className="fd-doc-actions">
        {save ? (
          <CommandButton
            command={save.command}
            className="dash-btn small"
            type="button"
            targetId={targetId}
            confirmTarget={false}
            scope={scope}
            before={save.before}
            after={save.after}
            expectedSliceRev={expectedSliceRev}
            sliceKey={sliceKey}
            value={save.value}
            aria-label={tr("Save {0}", [name])}
            onDone={() => onSaved(`${name} saved: ${docHealth({ status, expiresAt }, nowMs, warnDays).label}.`)}
          >{tr("Save")}</CommandButton>
        ) : null}
      </div>
    </li>
  );
}

type MessagesProps = {
  messages: ThreadMessage[];
  contactName: string;
  command: string;
  targetId: string;
  scope: string;
  sliceKey: string;
  expectedSliceRev: number;
  build: (text: string) => unknown;
  templates: string[];
  onSent: () => void;
  locale: string;
  timeZone: string;
};

export function MessagesPanel({ messages, contactName, command, targetId, scope, sliceKey, expectedSliceRev, build, templates, onSent, timeZone }: MessagesProps) {
  const [draft, setDraft] = useState("");
  const format = new Intl.DateTimeFormat(uiLocale(), { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone });
  return (
    <div className="fd-thread">
      <div className="fd-thread-log" aria-label={tr("Messages with {0}", [contactName])}>
        {messages.length === 0 ? <p className="state-line">{tr("No messages yet. Write the first one below.")}</p> : messages.map((message, index) => (
          <div key={`${message.at}-${index}`} className={`fd-bubble ${message.from}`}>
            <p>{message.text}</p>
            <small>{message.from === "admin" ? tr("Movera · {0}", [message.by]) : contactName} · {format.format(Date.parse(message.at))}</small>
          </div>
        ))}
      </div>
      <div className="fd-templates" role="group" aria-label={tr("Message templates")}>
        {templates.map((text) => <button key={text} type="button" data-command="admin.ui.quickAction" className="fd-template" onClick={() => setDraft(text)}>{text}</button>)}
      </div>
      <div className="fd-compose">
        <label className="sr-only" htmlFor={`compose-${targetId}`}>{tr("Message")}</label>
        <textarea id={`compose-${targetId}`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={tr("Write to {0}", [contactName])} rows={2} />
        <CommandButton
          command={command}
          className="dash-btn"
          type="button"
          targetId={targetId}
          confirmTarget={false}
          scope={scope}
          before="thread"
          after="message sent"
          expectedSliceRev={expectedSliceRev}
          sliceKey={sliceKey}
          value={build(draft)}
          disabled={!draft.trim()}
          onDone={() => {
            setDraft("");
            onSent();
          }}
        >{trn("{0} Send", <Send size={15} aria-hidden="true" />)}</CommandButton>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fd-field">
      <dt>{trx(label)}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export type Presence = "free" | "pickup" | "trip" | "stale" | "sos" | "offline";

const PRESENCE_LABEL: Record<Presence, string> = {
  free: "Online · free",
  pickup: "Online · to pickup",
  trip: "Online · on trip",
  stale: "Online · no GPS",
  sos: "SOS",
  offline: "Offline",
};

/** Whether the driver has the app open, and what they are doing. */
export function OnlinePill({ presence }: { presence: Presence }) {
  return <span className={`fd-online p-${presence}`}><i aria-hidden="true" />{trx(PRESENCE_LABEL[presence])}</span>;
}

type ContactProps = {
  kind: "driver" | "owner" | "rider";
  id: string;
  name: string;
  phone: string;
  zoneId: string;
  messageTo: string;
  mapTo?: string | null;
  compact?: boolean;
};

/** Call, message and (for online drivers) show on the map. Clicks never open the row behind. */
export function ContactActions({ kind, id, name, phone, zoneId, messageTo, mapTo, compact = false }: ContactProps) {
  const stop = (event: MouseEvent) => event.stopPropagation();
  const size = compact ? 15 : 16;
  return (
    <span className={compact ? "fd-contact compact" : "fd-contact"} onClick={stop}>
      <CommandButton
        command={kind === "driver" ? "admin.driver.call" : kind === "rider" ? "admin.rider.call" : "admin.fleetOwner.call"}
        className={compact ? "fd-icon-btn" : "dash-btn ghost"}
        type="button"
        targetId={id}
        confirmTarget={false}
        scope={zoneId}
        before="idle"
        after="call started"
        aria-label={tr("Call {0}", [name])}
        title={tr("Call {0}", [name])}
        onDone={() => {
          window.location.href = `tel:${phone.replace(/[^+\d]/g, "")}`;
        }}
      >
        <Phone size={size} aria-hidden="true" />{compact ? null : tr("Call")}
      </CommandButton>
      <Link className={compact ? "fd-icon-btn" : "dash-btn ghost"} to={messageTo} aria-label={tr("Message {0}", [name])} title={tr("Message {0}", [name])}>
        <MessageSquare size={size} aria-hidden="true" />{compact ? null : tr("Message")}
      </Link>
      {mapTo !== undefined ? (
        mapTo ? (
          <Link className={compact ? "fd-icon-btn" : "dash-btn ghost"} to={mapTo} aria-label={tr("See {0} on the map", [name])} title={tr("See on the map")}>
            <MapPin size={size} aria-hidden="true" />{compact ? null : tr("See on map")}
          </Link>
        ) : (
          <span className={compact ? "fd-icon-btn off" : "dash-btn ghost off"} title={tr("Offline: not on the map")} aria-label={tr("{0} is offline", [name])}>
            <MapPin size={size} aria-hidden="true" />{compact ? null : tr("Offline")}
          </span>
        )
      ) : null}
    </span>
  );
}
