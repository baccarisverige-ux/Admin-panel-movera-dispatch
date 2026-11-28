import { useEffect, useState } from "react";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { tr, trx } from "../i18n";
import { SettingInfo } from "../ui/SettingInfo";
import { AREA_KIND_LABEL, DERIVED_INFO, DERIVED_LABEL, areaErrorText, areaPatch, readAreas, saveArea, type AdminArea } from "./areas";

/**
 * Zone › Areas (contract v0.18.172, contract.json#preferredAreas.admin; area c70): the areas of this zone a driver may
 * prefer, with search, kind, source, licence, an on/off switch and a name override. Read with zones.read; changes need
 * zones.edit. Live server only.
 */
export default function ZoneAreasPanel({ zoneId, canEdit }: { zoneId: string; canEdit: boolean }) {
  const live = useLiveSessionMaybe();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminArea[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!live) return;
    let alive = true;
    const timer = setTimeout(() => {
      readAreas(live.client, zoneId, q)
        .then((page) => { if (alive) { setItems(page.items); setNext(page.nextCursor); setMessage(null); } })
        .catch(() => { if (alive) setMessage(tr("Could not read the areas. Try again.")); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [live, zoneId, q]);

  if (!live) return null;

  async function change(area: AdminArea, nextValue: { active?: boolean; name?: string }) {
    const body = areaPatch(area, nextValue);
    if (!body || !live) return;
    try {
      const saved = await saveArea(live.client, area.areaId, body);
      setItems((list) => list.map((a) => (a.areaId === saved.areaId ? saved : a)));
      setMessage(tr("Saved."));
    } catch (error) {
      setMessage(trx(areaErrorText(error)));
    }
  }

  async function more() {
    if (!live || !next) return;
    const page = await readAreas(live.client, zoneId, q, next);
    setItems((list) => [...list, ...page.items]);
    setNext(page.nextCursor);
  }

  return (
    <div className="zd-areas" data-testid="zone-areas">
      <h3>{tr("Favourite areas")} <SettingInfo id="zones.areas.list" /></h3>
      <p className="fine">{tr("Drivers pick these areas in the app. Booked rides in their areas are shown first; they never change who may see a ride.")}</p>
      <input type="search" aria-label={tr("Search areas")} placeholder={tr("Search areas")} value={q} onChange={(e) => setQ(e.target.value)} />
      {message ? <p className="fine" role="status">{message}</p> : null}
      <table className="dash-table">
        <thead>
          <tr><th>{tr("Area")}</th><th>{tr("Kind")}</th><th>{tr("Source")}</th><th>{tr("On")} <SettingInfo id="zones.areas.active" /></th><th>{tr("Name shown to drivers")} <SettingInfo id="zones.areas.name" /></th></tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.areaId} data-area={a.areaId}>
              <td>
                <strong>{a.name}</strong>{a.parentName ? <span className="fine"> · {a.parentName}</span> : null}
                {a.derived ? <div className="fine" title={trx(DERIVED_INFO)}>{trx(DERIVED_LABEL)} — {trx(DERIVED_INFO)}</div> : null}
              </td>
              <td>{trx(AREA_KIND_LABEL[a.kind] ?? a.kind)}</td>
              <td className="fine">{a.source} ({a.sourceYear}) · {a.licence}</td>
              <td>
                {/* info-at: zones.areas.active */}
                <input type="checkbox" aria-label={tr("Area on")} checked={a.active} disabled={!canEdit} onChange={(e) => void change(a, { active: e.target.checked })} />
              </td>
              <td>
                {/* info-at: zones.areas.name */}
                <input type="text" aria-label={tr("Name shown to drivers")} maxLength={120} disabled={!canEdit}
                  value={names[a.areaId] ?? a.name}
                  onChange={(e) => setNames((n) => ({ ...n, [a.areaId]: e.target.value }))}
                  onBlur={(e) => void change(a, { name: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {next ? <button data-command="admin.zone.areas.more" type="button" className="btn" onClick={() => void more()}>{tr("Show more areas")}</button> : null}
    </div>
  );
}
