import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { largeStoreChanges, restoreRevision, SLICE_KEY, type PricingStore } from "./zonePricing";
import { zoneById } from "../markets/markets";

type Props = {
  store: PricingStore;
  zoneId: string;
  agentId: string | null;
  canEdit: boolean;
  locale: string;
  timeZone: string;
  onRestored: (message: string) => void;
};

/** Every publish as a revision, newest first. Restoring adds a new revision; nothing is rewritten. */
export function HistoryPanel({ store, zoneId, agentId, canEdit, locale, timeZone, onRestored }: Props) {
  const [onlyZone, setOnlyZone] = useState(true);
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
  const rows = store.history.filter((item) => !onlyZone || item.zoneIds.includes(zoneId));
  return (
    <>
      <div className="history-head">
        <label className="mini-switch">
          <input type="checkbox" checked={onlyZone} onChange={(event) => setOnlyZone(event.target.checked)} aria-label={`Only ${zoneById(zoneId)?.name ?? zoneId}`} />
          <span aria-hidden="true"><i /></span>
          Only {zoneById(zoneId)?.name ?? zoneId}
        </label>
        <small>Current pricing revision {store.draftRev}</small>
      </div>
      {rows.length === 0 ? <p className="state-line">No published change yet. Prices are the Movera defaults.</p> : (
        <ol className="history-list" aria-label="Pricing history">
          {rows.map((revision) => {
            const restore = agentId ? restoreRevision(store, revision.rev, agentId, new Date().toISOString()) : { store, error: "Sign in again." };
            const live = revision.rev === store.history[0]?.rev;
            return (
              <li key={revision.rev} className={live ? "live" : undefined}>
                <div className="history-dot" aria-hidden="true"><History size={14} /></div>
                <div className="history-body">
                  <div className="history-title">
                    <strong>Revision {revision.rev}</strong>
                    {live ? <span className="badge-live">Live now</span> : null}
                    <small>{format.format(Date.parse(revision.at))} · {revision.actorId} · {revision.reason}</small>
                  </div>
                  <ul className="change-list">
                    {revision.changes.slice(0, 8).map((line) => <li key={line}>{line}</li>)}
                    {revision.changes.length > 8 ? <li className="more">+{revision.changes.length - 8} more changes</li> : null}
                  </ul>
                </div>
                {!live ? (
                  <CommandButton
                    command="admin.pricing.restore"
                    className="dash-btn small ghost"
                    targetId={`pricing-rev-${revision.rev}`}
                    confirmTarget={false}
                    scope="all"
                    before={`pricing rev ${store.draftRev}`}
                    after={`restore pricing rev ${revision.rev} as ${restore.store.draftRev}`}
                    expectedSliceRev={store.draftRev}
                    sliceKey={SLICE_KEY}
                    value={restore.store}
                    disabled={!canEdit || Boolean(restore.error)}
                    title={restore.error}
                    largeChanges={restore.error ? undefined : largeStoreChanges(store, restore.store)}
                    onDone={() => onRestored(`Pricing revision ${revision.rev} restored as revision ${restore.store.draftRev}.`)}
                  >
                    <RotateCcw size={13} aria-hidden="true" /> Restore
                  </CommandButton>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
