import { CheckCircle2, Clock, History, ShieldCheck, Undo2, UserCheck, X } from "lucide-react";
import type { Market } from "../markets/markets";
import { zoneById } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { zoneResults } from "./demo";
import { approve, decline, DISPATCH_KEY, undoTo, type DispatchBook, type ZoneDispatch } from "./rules";
import { tr, trn, uiLocale } from "../i18n";

type Props = {
  book: DispatchBook;
  market: Market;
  agentId: string;
  canEdit: boolean;
  canApprove: boolean;
  rulesOf: (zoneId: string) => ZoneDispatch;
  onNotice: (text: string) => void;
};

/** Waiting approvals at the top, then every published version with undo. */
export function Approvals({ book, agentId, canApprove, onNotice, compact = false }: { book: DispatchBook; agentId: string; canApprove: boolean; onNotice: (text: string) => void; compact?: boolean }) {
  if (!book.approvals.length) return null;
  const at = new Date().toISOString();
  return (
    <section className={compact ? "dx-approvals compact" : "dx-approvals"} aria-label={tr("Waiting for a second admin")}>
      <h3>{trn("{0} Waiting for a second admin {1}", <ShieldCheck size={15} aria-hidden="true" />, <span className="dx-count">{book.approvals.length}</span>)}</h3>
      <ul>
        {book.approvals.map((item) => {
          const result = approve(book, item.id, agentId, at);
          const mine = item.by === agentId;
          return (
            <li key={item.id}>
              <span className="dx-approval-text">
                <b>{trn("{0} by {1}", item.kind === "control" ? tr("Live switch") : tr("Rules change"), item.by)}</b>
                <small>{item.lines.slice(0, 3).join(" · ")}{item.lines.length > 3 ? tr(" · +{0} more", [item.lines.length - 3]) : ""}</small>
              </span>
              <span className="dx-approval-actions">
                <CommandButton command="admin.dispatch.approve" className="dash-btn small" targetId={item.id} confirmTarget={false} scope={item.zoneIds.length === 1 ? item.zoneIds[0] : "all"} before="waiting" after="approved" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={result.book} disabled={!canApprove || mine || Boolean(result.error)} title={mine ? tr("A second admin must approve. You asked for this change.") : undefined} onDone={() => onNotice(tr("Approved: {0}", [item.lines[0]]))}>{trn("{0} Approve", <CheckCircle2 size={13} aria-hidden="true" />)}</CommandButton>
                <CommandButton command="admin.dispatch.decline" className="dash-btn small ghost" targetId={item.id} confirmTarget={false} scope={item.zoneIds.length === 1 ? item.zoneIds[0] : "all"} before="waiting" after="turned down" expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={decline(book, item.id)} disabled={!canApprove && !mine} onDone={() => onNotice(mine ? tr("Your change was taken back.") : tr("Turned down: {0}", [item.lines[0]]))}>
                  <X size={13} aria-hidden="true" /> {mine ? tr("Take back") : tr("Turn down")}
                </CommandButton>
              </span>
              {mine ? <small className="dx-approval-note">{trn("{0} Ask another admin with approval rights to approve it.", <UserCheck size={11} aria-hidden="true" />)}</small> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HistoryView({ book, market, agentId, canEdit, canApprove, rulesOf, onNotice }: Props) {
  const time = (iso: string) => new Intl.DateTimeFormat(uiLocale(), { timeZone: market.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const versions = book.versions.filter((version) => !version.zoneIds.length || version.zoneIds.some((id) => market.zones.some((zone) => zone.id === id)));
  const now = new Date().toISOString();
  return (
    <div className="dx-history">
      <Approvals book={book} agentId={agentId} canApprove={canApprove} onNotice={onNotice} />
      <section className="dash-card" aria-labelledby="dx-history-title">
        <div className="card-head"><h3 id="dx-history-title">{trn("{0} Published versions", <History size={16} aria-hidden="true" />)}</h3></div>
        {versions.length === 0 ? <p className="dx-calm">{tr("Nothing published yet. Every publish shows here, and you can undo it.")}</p> : (
          <ol className="dx-versions" aria-label={tr("Versions")}>
            {versions.map((version, index) => {
              const undo = undoTo(book, version.rev, agentId, now);
              const zoneId = version.zoneIds[0];
              const after = zoneId ? zoneResults(zoneId, version.live[zoneId] ?? rulesOf(zoneId)) : null;
              const previous = zoneId ? book.versions[book.versions.indexOf(version) + 1]?.live[zoneId] : undefined;
              const before = zoneId && previous ? zoneResults(zoneId, previous) : null;
              return (
                <li key={version.rev} className={index === 0 ? "dx-version latest" : "dx-version"}>
                  <span className="dx-version-head">
                    <b>{trn("Version {0}", version.rev)}</b>
                    {index === 0 ? <span className="dx-tag live">{tr("Live")}</span> : null}
                    <small>{trn("{0} {1} · by {2}{3}", <Clock size={11} aria-hidden="true" />, time(version.at), version.actorId, version.approvedBy ? tr(" · approved by {0}", [version.approvedBy]) : "")}</small>
                  </span>
                  {version.note ? <p className="dx-version-note">{version.note}</p> : null}
                  <ul className="dx-version-lines">{version.lines.slice(0, 8).map((line) => <li key={line}>{line}</li>)}{version.lines.length > 8 ? <li>{trn("+{0} more", version.lines.length - 8)}</li> : null}</ul>
                  {before && after && zoneId ? <p className="dx-compare">{trn("{0}: time to find a driver {1} s → {2} · no driver {3}% → {4}", zoneById(zoneId)?.name, before.findSec, <b>{trn("{0} s", after.findSec)}</b>, before.noDriverPct, <b>{after.noDriverPct}%</b>)}</p> : null}
                  <CommandButton command="admin.dispatch.undo" className="dash-btn small ghost" targetId={`version ${version.rev}`} confirmTarget={false} scope={version.zoneIds.length === 1 ? version.zoneIds[0] : "all"} before={`version ${version.rev}`} after={`undo as ${book.draftRev + 1}`} expectedSliceRev={book.draftRev} sliceKey={DISPATCH_KEY} value={undo.book} disabled={!canEdit || Boolean(undo.error) || version.note.startsWith("Undo")} onDone={() => onNotice(tr("Version {0} undone. The rules from before it are live again.", [version.rev]))}>
                    <Undo2 size={13} aria-hidden="true" /> {index === 0 ? tr("Undo this version") : tr("Go back to before this version")}
                  </CommandButton>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
