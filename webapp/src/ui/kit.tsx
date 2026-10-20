import { useState, type FormEvent, type ReactNode } from "react";
import { can, type Role } from "../auth/permissions";
import { CommandButton } from "./CommandButton";
import { useDialogFocus } from "./useDialogFocus";
import { tr, trn, trx } from "../i18n";

export function StatusDot({ tone, children }: { tone: "green" | "amber" | "red" | "muted"; children: ReactNode }) {
  return (
    <span className={`status-dot ${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function Money({ ore }: { ore: number }) {
  return <span>{new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(ore / 100)}</span>;
}

export function DateTime({ iso }: { iso: string }) {
  return <time dateTime={iso}>{new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(iso))}</time>;
}

export function Duration({ seconds }: { seconds: number }) {
  const minutes = Math.floor(seconds / 60);
  return <span>{trn("{0} min {1} s", minutes, seconds % 60)}</span>;
}

export function EmptyState({ title }: { title: string }) {
  return <p className="state-line">{trx(title)}</p>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="state-line">{trn("Something failed. {0}", <CommandButton command="admin.ui.retry" className="link-action" type="button" onDone={onRetry}>{tr("Retry")}</CommandButton>)}</p>
  );
}

export function NoAccess() {
  return (
    <div className="page-heading">
      <div>
        <h2>{tr("No access")}</h2>
        <p>{tr("Your role cannot open this page.")}</p>
      </div>
    </div>
  );
}

export function Can({ role, permission, children }: { role: Role; permission: string; children: ReactNode }) {
  if (!can(role, permission)) return null;
  return children;
}

export function Timeline({ items }: { items: { at: string; text: string }[] }) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.at}>
          <DateTime iso={item.at} /> {item.text}
        </li>
      ))}
    </ol>
  );
}

export function PhonePreview({ app, children }: { app: "rider" | "driver"; children: ReactNode }) {
  return (
    <div className={`phone-preview ${app}`}>
      <strong>{app === "rider" ? tr("Rider") : tr("Driver")}</strong>
      <div>{children}</div>
    </div>
  );
}

export function DiffView({ before, after }: { before: string; after: string }) {
  return (
    <div className="diff-view">
      <p>{trn("Before: {0}", before)}</p>
      <p>{trn("After: {0}", after)}</p>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return <p className="toast">{text}</p>;
}

export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <aside className="drawer" role="dialog" aria-label={title}>
      <CommandButton command="admin.ui.drawerClose" className="link-action" type="button" onDone={onClose}>{tr("Close")}</CommandButton>
      <h3>{trx(title)}</h3>
      {children}
    </aside>
  );
}

export function DetailLayout({ title, status, actions, tabs, children }: { title: string; status: ReactNode; actions: ReactNode; tabs: ReactNode; children: ReactNode }) {
  return (
    <article className="panel">
      <header className="detail-head">
        <h2>{trx(title)}</h2>
        {status}
        {actions}
      </header>
      {tabs}
      {children}
    </article>
  );
}

export function DocumentViewer() {
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const [kind, setKind] = useState<"image" | "pdf">("image");
  const base = import.meta.env.BASE_URL;
  const style = { transform: `scale(${zoom}) rotate(${turn * 90}deg)`, transformOrigin: "top left" };
  return (
    <div className="doc-viewer">
      <div className="actions">
        <CommandButton command="admin.doc.image" className="secondary-btn" type="button" onDone={() => setKind("image")}>{tr("Image")}</CommandButton>
        <CommandButton command="admin.doc.pdf" className="secondary-btn" type="button" onDone={() => setKind("pdf")}>PDF</CommandButton>
        <CommandButton command="admin.doc.zoomIn" className="secondary-btn" type="button" onDone={() => setZoom((value) => Math.min(2, value + 0.25))}>{tr("Zoom in")}</CommandButton>
        <CommandButton command="admin.doc.zoomOut" className="secondary-btn" type="button" onDone={() => setZoom((value) => Math.max(0.5, value - 0.25))}>{tr("Zoom out")}</CommandButton>
        <CommandButton command="admin.doc.rotate" className="secondary-btn" type="button" onDone={() => setTurn((value) => value + 1)}>{tr("Rotate")}</CommandButton>
      </div>
      {kind === "image" ? (
        <img src={`${base}license.png`} alt={tr("Taxi driver license")} style={style} />
      ) : (
        <iframe title={tr("Taxi driver license PDF")} src={`${base}license.pdf`} style={{ ...style, width: 280, height: 360, border: 0 }} />
      )}
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  record: string;
  reasons: string[];
  typed: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

/** Mounted only while open, so every opening starts with an empty typed id and the first reason. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return props.open ? <ConfirmDialogCard {...props} /> : null;
}

function ConfirmDialogCard({ record, reasons, typed, onConfirm, onClose }: ConfirmDialogProps) {
  const [reason, setReason] = useState(reasons[0] ?? "Other");
  const [text, setText] = useState("");
  const root = useDialogFocus(true, onClose);
  const confirmed = typed.length === 0 || text === typed;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    onConfirm(reason);
  }
  return (
    <div ref={root} tabIndex={-1} className="modal open" role="presentation">
      <form className="modal-card" role="dialog" aria-modal="true" aria-label={tr("Confirm")} onSubmit={submit}>
        <h3>{tr("Confirm")}</h3>
        <p>{trn("This acts on {0}.", record)}</p>
        <label>{trn("Reason{0}", <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>)}</label>
        {typed ? (
          <label>{trn("Type {0} to confirm{1}", typed, <input value={text} onChange={(event) => setText(event.target.value)} />)}</label>
        ) : null}
        <CommandButton command="admin.confirm.submit" className="primary-btn" type="submit" disabled={!confirmed}>{tr("Confirm")}</CommandButton>
        <CommandButton command="admin.confirm.cancel" className="secondary-btn" type="button" onDone={onClose}>{tr("Cancel")}</CommandButton>
      </form>
    </div>
  );
}

export function useDirty(initial: string) {
  const [value, setValue] = useState(initial);
  return { value, setValue, dirty: value !== initial };
}
