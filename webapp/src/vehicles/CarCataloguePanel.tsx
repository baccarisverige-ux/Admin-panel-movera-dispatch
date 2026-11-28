import { useEffect, useState } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { tr, trx } from "../i18n";
import { CAR_LABELS, SOURCE_LABEL, addMake, addModel, carErrorText, filterMakes, readCatalogue, setMake, setModel, type AdminCarCatalogue, type AdminCarMake } from "./carCatalogue";

/**
 * Fleet › Vehicle rules › Car catalogue (contract v0.18.178, contract.json#carCatalogue.admin; area c73): search, the
 * makes (models count, Hidden badge, source), open a make for its models, Add make / Add model, Hide / Show. No delete.
 * Read with drivers.read; changes need vehicles.edit. Live server only. `prefill` comes from a car's "Add to catalogue".
 */
export default function CarCataloguePanel({ canEdit, prefill = "" }: { canEdit: boolean; prefill?: string }) {
  const live = useLiveSessionMaybe();
  const [data, setData] = useState<AdminCarCatalogue | null>(null);
  const [q, setQ] = useState(prefill);
  const [open, setOpen] = useState<string | null>(null);
  const [newMake, setNewMake] = useState(prefill);
  const [newModel, setNewModel] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let alive = true;
    readCatalogue(live.client).then((c) => { if (alive) setData(c); }).catch(() => { if (alive) setMessage(tr("Could not save. Try again.")); });
    return () => { alive = false; };
  }, [live]);

  if (!live) return null;
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      setData(await readCatalogue(live.client));
      setMessage(tr("Saved."));
    } catch (error) {
      setMessage(trx(carErrorText(error)));
    }
  };
  const makes = filterMakes(data?.makes ?? [], q);
  const row = (m: AdminCarMake) => (
    <li key={m.makeId} data-make={m.makeId} className="cc-make">
      <button data-command="admin.vehicle.view" type="button" className="dash-btn small ghost" aria-expanded={open === m.makeId} onClick={() => setOpen(open === m.makeId ? null : m.makeId)}>
        <strong>{m.name}</strong> <span className="fine">{m.models.length} · {trx(SOURCE_LABEL[m.source])}</span>
      </button>
      {m.hidden ? <span className="badge">{tr(CAR_LABELS.hidden)}</span> : null}
      <button data-command="admin.vehicle.catalogueHide" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => void run(() => setMake(live.client, m.makeId, { hidden: !m.hidden }))}>{m.hidden ? tr(CAR_LABELS.show) : tr(CAR_LABELS.hide)}</button>
      {open === m.makeId ? (
        <ul className="cc-models">
          {m.models.map((d) => (
            <li key={d.modelId} data-model={d.modelId}>
              {d.name} <span className="fine">{trx(SOURCE_LABEL[d.source])}</span>
              {d.hidden ? <span className="badge">{tr(CAR_LABELS.hidden)}</span> : null}
              <button data-command="admin.vehicle.catalogueHide" type="button" className="dash-btn small" disabled={!canEdit} onClick={() => void run(() => setModel(live.client, d.modelId, { hidden: !d.hidden }))}>{d.hidden ? tr(CAR_LABELS.show) : tr(CAR_LABELS.hide)}</button>
            </li>
          ))}
          <li>
            <input type="text" aria-label={tr(CAR_LABELS.addModel)} maxLength={80} value={newModel} disabled={!canEdit} onChange={(e) => setNewModel(e.target.value)} />
            <button data-command="admin.vehicle.catalogueAdd" type="button" className="dash-btn small" disabled={!canEdit || !newModel.trim()} onClick={() => void run(async () => { await addModel(live.client, m.makeId, newModel); setNewModel(""); })}>{tr(CAR_LABELS.addModel)}</button>
          </li>
        </ul>
      ) : null}
    </li>
  );
  return (
    <section className="dx-card cc-panel" data-testid="car-catalogue" aria-label={tr(CAR_LABELS.title)}>
      <h3>{tr(CAR_LABELS.title)}</h3>
      <input type="search" aria-label={tr("Search makes")} placeholder={tr("Search makes")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cc-add">
        <input type="text" aria-label={tr(CAR_LABELS.addMake)} maxLength={80} value={newMake} disabled={!canEdit} onChange={(e) => setNewMake(e.target.value)} />
        <button data-command="admin.vehicle.catalogueAdd" type="button" className="dash-btn small" disabled={!canEdit || !newMake.trim()} onClick={() => void run(async () => { await addMake(live.client, newMake); setNewMake(""); })}>{tr(CAR_LABELS.addMake)}</button>
      </div>
      {message ? <p className="fine" role="status">{message}</p> : null}
      <ul className="cc-makes">{makes.map(row)}</ul>
      {data ? <p className="fine">{data.attribution}</p> : null}
    </section>
  );
}
