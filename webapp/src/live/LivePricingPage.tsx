import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/httpClient";
import { ZONES } from "../api/seed";
import { NoAccess } from "../ui/kit";
import { Modal } from "../ui/Modal";
import { tr, trx } from "../i18n";
import { PriceTable } from "../pricing/PriceTable";
import { BUILT_IN_CATEGORIES, PRICE_ROWS, type CategoryDef, type CategoryPrice } from "../pricing/zonePricing";
import { useLiveSession } from "./LiveSessionContext";
import { marketOf, priceChanges, pricesOf, withPrices, type ConfigDraft, type PricingDocument } from "./pricingDoc";
import { DateText, ErrorLine, isVersionMismatch } from "./ui";

type Publication = { version: number; publishedAt: string };
type Pending = { approvalId: string; status: string };

/**
 * Live Pricing: the zone's pricing document from the server (GET /admin/config/pricing?zoneId, settings.read), edited in
 * the demo price table, saved as a draft (PUT, settings.edit) and published (POST …/publish, settings.publish; a
 * second admin approves unless the admin is approval-exempt).
 */
export function LivePricingPage() {
  const { client, can, admin } = useLiveSession();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const scoped = admin && Array.isArray(admin.scope.zones) ? admin.scope.zones : null;
  const zoneIds = scoped ?? ZONES.map(([id]) => id);
  const zoneId = params.get("zone") ?? zoneIds[0] ?? "Z001";
  const key = ["live", "config", "pricing", zoneId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => client.json<ConfigDraft<PricingDocument>>(`/admin/config/pricing?zoneId=${encodeURIComponent(zoneId)}`),
    enabled: can("settings.read"),
    retry: false,
  });
  const loaded = useMemo(() => (query.data ? pricesOf(query.data.document) : null), [query.data]);
  const [prices, setPrices] = useState<Record<string, CategoryPrice> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  useEffect(() => setPrices(loaded), [loaded]);

  if (!can("settings.read")) return <NoAccess />;
  const canEdit = can("settings.edit");
  const canPublish = can("settings.publish");
  const draft = query.data;
  const doc = draft?.document;
  const categories: CategoryDef[] = doc
    ? Object.keys(doc.categories).map((id) => BUILT_IN_CATEGORIES.find((item) => item.id === id) ?? { id, label: id, line: "", seats: 4, builtIn: false, archived: null })
    : [];
  const rowLabel = (id: string, field: keyof CategoryPrice) => `${trx(categories.find((item) => item.id === id)?.label ?? id)} · ${field === "enabled" ? tr("On") : trx(PRICE_ROWS.find((row) => row.field === field)?.label ?? field)}`;
  const changes = loaded && prices ? priceChanges(loaded, prices, rowLabel) : [];
  const unpublished = draft ? draft.version !== draft.liveVersion || changes.length > 0 : false;

  /** PUT the edited rows; returns the new draft version. */
  async function save(): Promise<number> {
    if (!draft || !doc || !prices) throw new Error(tr("Something failed."));
    if (changes.length === 0) return draft.version;
    const next = await client.json<ConfigDraft<PricingDocument>>("/admin/config/pricing", {
      method: "PUT",
      body: JSON.stringify({ expectedVersion: draft.version, zoneId, document: withPrices(doc, prices) }),
    });
    queryClient.setQueryData(key, next);
    return next.version;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{tr("Pricing")}</h2>
          <p>{tr("Prices per zone from the Movera server. Save keeps a draft; Publish makes the prices live for riders and drivers.")}</p>
        </div>
        <div className="actions">
          <label className="live-zone-pick">
            {tr("Zone")}
            <select value={zoneId} onChange={(event) => { setNotice(null); setParams({ zone: event.target.value }); }}>
              {zoneIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        </div>
      </div>
      {query.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
      {query.error instanceof ApiError && query.error.status === 404 ? <p className="state-line">{tr("This zone has no prices on the server yet.")}</p> : query.error ? <ErrorLine error={query.error} onRetry={() => void query.refetch()} /> : null}
      {draft && doc && prices ? (
        <section className="panel" data-testid="live-pricing">
          <p className="live-muted" data-testid="pricing-versions">
            {tr("Draft version {0} · live version {1}", [draft.version, draft.liveVersion])} · <DateText value={draft.updatedAt} withTime />
            {unpublished ? ` · ${tr("Not published yet")}` : ""}
          </p>
          {notice ? <p className="state-line" role="status">{notice}</p> : null}
          {saveError ? <ErrorLine error={saveError} /> : null}
          <PriceTable
            zoneName={zoneId}
            currency={marketOf(doc)}
            categories={categories}
            book={{ prices }}
            published={{ prices: loaded ?? prices }}
            problems={[]}
            canEdit={canEdit && !saving}
            onChange={(categoryId, patch) => setPrices((current) => (current ? { ...current, [categoryId]: { ...current[categoryId]!, ...patch } } : current))}
          />
          <div className="actions live-pricing-actions">
            {canEdit ? (
              <button
                data-command="admin.server.pricingSave"
                type="button"
                className="secondary-btn"
                disabled={saving || changes.length === 0}
                onClick={async () => {
                  setSaving(true);
                  setSaveError(null);
                  try {
                    await save();
                    setNotice(tr("Draft saved. Riders still see the live prices until you publish."));
                  } catch (error) {
                    if (isVersionMismatch(error)) {
                      await query.refetch();
                      setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
                    } else setSaveError(error);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {tr("Save draft")}
              </button>
            ) : null}
            {canPublish ? (
              <button data-command="admin.server.pricingPublish" type="button" className="primary-btn" disabled={saving || !unpublished} onClick={() => setPublishOpen(true)}>
                {tr("Publish")}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      <PublishDialog
        open={publishOpen}
        zoneId={zoneId}
        changes={changes}
        onClose={() => setPublishOpen(false)}
        onPublish={async (note) => {
          try {
            const version = await save();
            const answer = await client.post<Publication | Pending>("/admin/config/pricing/publish", { expectedVersion: version, zoneId, ...(note ? { note } : {}) });
            setNotice("approvalId" in answer ? tr("The prices wait for a second admin to approve.") : tr("Prices published: live version {0}.", [answer.version]));
            await queryClient.invalidateQueries({ queryKey: key });
          } catch (error) {
            if (isVersionMismatch(error)) {
              await query.refetch();
              setNotice(tr("Someone else changed this record. It was reloaded; check it and try again."));
            }
            throw error;
          }
        }}
      />
    </>
  );
}

function PublishDialog({ open, zoneId, changes, onClose, onPublish }: { open: boolean; zoneId: string; changes: string[]; onClose: () => void; onPublish: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setBusy(false);
      sending.current = false;
    }
  }, [open]);
  return (
    <Modal open={open} title={tr("Publish prices for {0}", [zoneId])} onClose={onClose}>
      <form
        className="live-dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          if (sending.current) return;
          sending.current = true;
          setBusy(true);
          setError(null);
          try {
            await onPublish(note.trim());
            onClose();
          } catch (caught) {
            setError(caught);
            sending.current = false;
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>{tr("New quotes in {0} use these prices as soon as they are live. Trips already booked keep their price.", [zoneId])}</p>
        {changes.length > 0 ? (
          <ul className="live-change-list" data-testid="publish-changes">
            {changes.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <p className="live-muted">{tr("The saved draft is published as it is.")}</p>
        )}
        <label>
          {tr("Note (optional)")}
          <textarea value={note} maxLength={1000} rows={2} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error ? <ErrorLine error={error} /> : null}
        <div className="actions">
          <button data-command="admin.server.dialogConfirm" type="submit" className="primary-btn" disabled={busy}>{busy ? tr("Sending.") : tr("Publish")}</button>
          <button data-command="admin.server.dialogCancel" type="button" className="secondary-btn" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}
