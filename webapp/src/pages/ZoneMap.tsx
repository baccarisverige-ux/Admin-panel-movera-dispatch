import { logExport } from "../reports/activityLog";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  Archive,
  Ban,
  Car,
  ChevronUp,
  Circle,
  CircleCheck,
  Crosshair,
  Download,
  ExternalLink,
  Hand,
  Layers,
  Map as MapIcon,
  Merge,
  PenLine,
  Pentagon,
  Redo2,
  RotateCw,
  Ruler,
  Satellite,
  Scissors,
  Search,
  Spline,
  Square,
  SquareSplitHorizontal,
  Trash2,
  Undo2,
  Upload,
  Users,
} from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import type { MarketId } from "../markets/markets";
import { cityById, citiesOf, PLACES } from "../zones/cities";
import { zoneStore, useZoneUi, type DrawTarget, type DrawTool, type ZoneLayers } from "../zones/bookStore";
import {
  cityGaps,
  displayName,
  effectiveZonesAt,
  lineKm,
  priorityZones,
  ringSizeKm,
  validateZones,
  zoneAreaKm,
  zoneHealth,
  zoneRuleSummary,
  zoneStatus,
  zoneTypeLabel,
  zonesToGeoJSON,
  ZONE_COLOR,
  ZONE_TYPES,
  type ZoneShape,
} from "../zones/releases";
import { CommandButton } from "../ui/CommandButton";
import { mapProviderLabel, ZoneCanvas, type MapOverlays } from "./ZoneCanvas";
import { ZoneWizard, type WizardOverlay } from "./ZoneWizard";
import { tr, trn, trx, trSentences } from "../i18n";

type ToolSpec = { tool: DrawTool; target?: DrawTarget; label: string; key: string; icon: ReactNode; needsZone?: boolean };

const TOOLS: ToolSpec[] = [
  { tool: "render", get label() { return tr("Move map"); }, key: "V", icon: <Hand size={17} /> },
  { tool: "polygon", get label() { return tr("Draw shape"); }, key: "P", icon: <Pentagon size={17} />, needsZone: true },
  { tool: "rectangle", get label() { return tr("Rectangle"); }, key: "R", icon: <Square size={17} />, needsZone: true },
  { tool: "circle", get label() { return tr("Circle"); }, key: "C", icon: <Circle size={17} />, needsZone: true },
  { tool: "freehand", get label() { return tr("Free hand"); }, key: "F", icon: <PenLine size={17} />, needsZone: true },
  { tool: "select", get label() { return tr("Edit points"); }, key: "E", icon: <Spline size={17} />, needsZone: true },
  { tool: "hole", get label() { return tr("Cut hole"); }, key: "H", icon: <Scissors size={17} />, needsZone: true },
  { tool: "point", get label() { return tr("Pickup point"); }, key: "K", icon: <Crosshair size={17} />, needsZone: true },
  { tool: "line", target: "nostop", get label() { return tr("No-stop street"); }, key: "L", icon: <Ban size={17} />, needsZone: true },
  { tool: "line", target: "measure", get label() { return tr("Measure"); }, key: "M", icon: <Ruler size={17} /> },
];

const LAYERS: { id: keyof ZoneLayers; label: string }[] = [
  { id: "drivers", get label() { return tr("Online drivers"); } },
  { id: "trips", get label() { return tr("Trips"); } },
  { id: "requests", get label() { return tr("Open requests"); } },
  { id: "demandHour", get label() { return tr("Demand · last hour"); } },
  { id: "demand7d", get label() { return tr("Demand · 7 days"); } },
  { id: "pickups", get label() { return tr("Pickup points"); } },
  { id: "queue", get label() { return tr("Airport queues"); } },
  { id: "boosts", get label() { return tr("Boosts"); } },
  { id: "events", get label() { return tr("Events"); } },
  { id: "districts", get label() { return tr("Districts"); } },
  { id: "gaps", get label() { return tr("Gaps (no zone)"); } },
  { id: "before", get label() { return tr("Published shape"); } },
];

const HINT: Partial<Record<DrawTool, string>> = {
  polygon: "Click point by point. Click the first point or press Enter to finish.",
  rectangle: "Click one corner, then the opposite corner.",
  circle: "Click the centre, move out, click again.",
  freehand: "Press and draw. Let go to finish.",
  select: "Drag the points. Click a middle point to add one.",
  hole: "Draw the part to cut out, inside the zone.",
  point: "Click where riders get picked up.",
  get line() { return tr("Click along the street. Press Enter to finish."); },
};

export function statusTone(status: string): string {
  return status === "Published" ? "good" : status === "Archived" ? "muted" : status === "In review" ? "violet" : "amber";
}

export function ZoneMap({ country, wizard, onWizard }: { country: MarketId; wizard: { city?: string } | null; onWizard: (next: { city?: string } | null) => void }) {
  const { agent } = useSession();
  const ui = useZoneUi();
  const canEdit = Boolean(agent && can(agent.role, "zones.edit"));
  const [query, setQuery] = useState("");
  const [probe, setProbe] = useState("");
  const [mergeSource, setMergeSource] = useState("");
  const [layersOpen, setLayersOpen] = useState(false);
  const [wizardOverlay, setWizardOverlay] = useState<WizardOverlay>({});
  const zones = useMemo(() => ui.book.draft.filter((zone) => zone.country === country), [ui.book.draft, country]);
  const selected = zones.find((zone) => zone.id === ui.selectedId);
  const issues = useMemo(() => validateZones(ui.book.draft), [ui.book.draft]);
  const selectedIssues = selected ? issues.filter((issue) => issue.zoneId === selected.id) : [];
  const published = selected ? ui.book.published.find((zone) => zone.id === selected.id) : undefined;
  const cities = citiesOf(country);
  const gapCells = useMemo(() => (ui.layers.gaps ? cities.flatMap((city) => cityGaps(ui.book.draft, city, 20).cells) : []), [ui.layers.gaps, cities, ui.book.draft]);
  // Fit the view to the city with the most zones.
  const fitIds = useMemo(() => {
    const operating = zones.filter((zone) => zone.kind === "operating" && !zone.archived);
    const counts = new Map<string, number>();
    for (const zone of operating) counts.set(zone.city, (counts.get(zone.city) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return operating.filter((zone) => zone.city === main).map((zone) => zone.id);
  }, [zones]);
  const priorities = priorityZones(zones);
  const mergeOptions = zones.filter((zone) => !zone.archived && zone.id !== ui.selectedId && zone.kind === selected?.kind);
  const hits = (() => {
    const [latRaw, lngRaw] = probe.split(",");
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!probe.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return effectiveZonesAt(ui.book.draft, lat, lng);
  })();
  const activeTool = TOOLS.find((item) => item.tool === ui.tool && (item.target ?? "zone") === (ui.target === "sketch" ? "zone" : ui.target)) ?? TOOLS[0];

  useEffect(() => {
    zoneStore.ensureCountry(country);
  }, [country]);

  function applyTool(spec: ToolSpec) {
    if (spec.needsZone && !selected && !wizard) {
      zoneStore.notify("Pick a zone on the map or in the list first.");
      return;
    }
    // While making a new zone, drawing tools shape the new zone, not the selected one.
    const target: DrawTarget = spec.target ?? (wizard ? "sketch" : "zone");
    zoneStore.setTool(spec.tool, target);
    if (spec.tool !== "render") zoneStore.notify(HINT[spec.tool] ?? "");
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.closest("input, textarea, select, [contenteditable]") || event.target.isContentEditable);
      if (event.key === "Escape") {
        zoneStore.cancelTool();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || !canEdit) return;
      const key = event.key.toUpperCase();
      if (key === "Z") {
        if (event.shiftKey) zoneStore.redo();
        else zoneStore.undo();
        return;
      }
      const spec = TOOLS.find((item) => item.key === key);
      if (spec) applyTool(spec);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const overlays: MapOverlays = {
    sketch: wizard ? ui.sketch : undefined,
    gaps: gapCells,
    districts: wizardOverlay.districts ?? cities.flatMap((city) => city.districts.map((item) => ({ ring: item.ring, name: item.name, picked: false }))),
    outline: wizardOverlay.outline,
    before: selected && published && JSON.stringify(published.points) !== JSON.stringify(selected.points) ? published.points : undefined,
    lines: zones.flatMap((zone) => zone.noStopLines),
    measure: ui.measure.length ? ui.measure : undefined,
  };

  function exportGeo() {
    const blob = new Blob([JSON.stringify(zonesToGeoJSON(zones), null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zones-${country.toLowerCase()}.geojson`;
    link.click();
    logExport(agent?.id, `Zones of ${country} (GeoJSON)`);
    URL.revokeObjectURL(url);
  }

  const size = selected ? ringSizeKm(selected.points) : { width: 0, height: 0 };
  const health = selected ? zoneHealth(selected) : null;
  const status = selected ? zoneStatus(selected, ui.book) : "";

  return (
    <section className="zn-workspace" aria-label={tr("Zone map")}>
      <div className="zn-map-card">
        <div className="zn-map-top">
          <form className="zn-search" role="search" onSubmit={(event) => { event.preventDefault(); zoneStore.search(query); }}>
            <Search size={15} aria-hidden="true" />
            <input aria-label={tr("Search the map")} list="zn-places" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Search an address or place")} />
            <datalist id="zn-places">{PLACES.filter((place) => cityById(place.city)?.country === country).map((place) => <option key={place.name} value={place.name} />)}</datalist>
            <button data-command="admin.zone.search" type="submit" className="dash-btn small">{tr("Go")}</button>
          </form>
          <div className="zn-city-jump" role="group" aria-label={tr("Go to city")}>
            {cities.map((city) => (
              <button data-command="admin.zone.search" key={city.id} type="button" className="zn-chip" onClick={() => zoneStore.focusOn(city.center[0], city.center[1], `Moved to ${city.name}.`)}>{city.name}</button>
            ))}
          </div>
        </div>

        <div className="zn-map-wrap">
          <div className="zn-toolbar" role="toolbar" aria-label={tr("Drawing tools")}>
            {TOOLS.map((spec) => (
              <button
                key={`${spec.tool}-${spec.target ?? ""}`}
                data-command="admin.zone.tool"
                type="button"
                className={activeTool === spec ? "zn-tool on" : "zn-tool"}
                aria-pressed={activeTool === spec}
                aria-label={spec.label}
                title={`${spec.label} (${spec.key})`}
                disabled={!canEdit && spec.tool !== "render" && spec.target !== "measure"}
                onClick={() => applyTool(spec)}
              >
                {spec.icon}
                <span>{spec.label}</span>
                <kbd>{spec.key}</kbd>
              </button>
            ))}
            <i className="zn-tool-sep" aria-hidden="true" />
            <button data-command="admin.zone.undo" type="button" className="zn-tool" aria-label={tr("Undo")} title={tr("Undo (Z)")} disabled={ui.past.length === 0} onClick={() => zoneStore.undo()}><Undo2 size={17} /><span>{tr("Undo")}</span><kbd>Z</kbd></button>
            <button data-command="admin.zone.redo" type="button" className="zn-tool" aria-label={tr("Redo")} title={tr("Redo (Shift Z)")} disabled={ui.future.length === 0} onClick={() => zoneStore.redo()}><Redo2 size={17} /><span>{tr("Redo")}</span><kbd>⇧Z</kbd></button>
          </div>

          <ZoneCanvas
            zones={ui.book.draft}
            selectedId={wizard ? "" : ui.selectedId}
            mode={ui.tool}
            layers={ui.layers}
            focus={ui.focus}
            selectionNonce={ui.selectionNonce}
            overlays={overlays}
            fitIds={fitIds}
            viewKey={country}
            onPick={(id) => { if (!wizard) zoneStore.select(id); }}
            onCancel={() => zoneStore.cancelTool()}
            onDrawn={(points, intent) => {
              if (!agent) return;
              if (ui.target === "measure") {
                zoneStore.setMeasure(points);
                zoneStore.notify(`Distance: ${lineKm(points).toFixed(2)} km.`);
                return;
              }
              if (ui.target === "nostop") {
                if (selected) zoneStore.addLine(selected.id, points, agent.id);
                return;
              }
              if (ui.target === "sketch") {
                if (intent === "outer") zoneStore.setSketch(points, "Shape ready. Check it on the right.");
                return;
              }
              if (intent === "hole") zoneStore.cut(ui.selectedId, points, agent.id);
              else if (intent === "point") zoneStore.place(ui.selectedId, points, agent.id);
              else if (intent === "outer") zoneStore.replace(ui.selectedId, points, agent.id);
              zoneStore.setTool("render");
            }}
            onEdited={(points) => {
              if (agent && ui.target === "zone") zoneStore.edit(ui.selectedId, points, agent.id);
            }}
          />

          <div className="zn-map-corner">
            <div className="zn-basemap" role="group" aria-label={tr("Map style")}>
              <button data-command="admin.zone.basemap" type="button" aria-pressed={!ui.layers.satellite} className={!ui.layers.satellite ? "on" : undefined} onClick={() => { if (ui.layers.satellite) zoneStore.toggleLayer("satellite"); }}>{trn("{0} Streets", <MapIcon size={14} aria-hidden="true" />)}</button>
              <button data-command="admin.zone.basemap" type="button" aria-pressed={ui.layers.satellite} className={ui.layers.satellite ? "on" : undefined} onClick={() => { if (!ui.layers.satellite) zoneStore.toggleLayer("satellite"); }}>{trn("{0} Satellite", <Satellite size={14} aria-hidden="true" />)}</button>
            </div>
            <button data-command="admin.zone.layer" type="button" className={layersOpen ? "zn-layers-btn on" : "zn-layers-btn"} aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>{trn("{0} Layers", <Layers size={15} aria-hidden="true" />)}</button>
            {layersOpen ? (
              <div className="zn-layers" role="group" aria-label={tr("Map layers")}>
                {LAYERS.map((layer) => (
                  <label key={layer.id} className={ui.layers[layer.id] ? "zn-layer on" : "zn-layer"}>
                    <input type="checkbox" checked={ui.layers[layer.id]} onChange={() => zoneStore.toggleLayer(layer.id)} />
                    {trx(layer.label)}
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <p className="zn-map-notice" role="status" aria-live="polite">{trSentences(ui.notice)}</p>
        </div>

        <div className="zn-map-foot">
          <ul className="zone-legend" aria-label={tr("Zone colors")}>
            {ZONE_TYPES.filter((type) => type.id !== "pickup").map((type) => (
              <li key={type.id}><i className="zone-swatch" style={{ background: ZONE_COLOR[type.id] }} />{trx(type.label)}</li>
            ))}
          </ul>
          <div className="zn-io">
            <button data-command="admin.zone.import" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => document.getElementById("zone-import")?.click()}>{trn("{0} Import GeoJSON", <Upload size={13} aria-hidden="true" />)}</button>
            <input id="zone-import" hidden type="file" accept="application/geo+json,application/json,.geojson,.json" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !agent) return;
              void file.text().then((raw) => zoneStore.importGeo(raw, agent.id));
            }} />
            <button data-command="admin.zone.importKml" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => document.getElementById("zone-kml-import")?.click()}>{trn("{0} Import KML", <Upload size={13} aria-hidden="true" />)}</button>
            <input id="zone-kml-import" hidden type="file" accept=".kml,application/vnd.google-earth.kml+xml,application/xml,text/xml" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || !agent) return;
              void file.text().then((raw) => zoneStore.importKml(raw, agent.id));
            }} />
            <button data-command="admin.zone.export" type="button" className="dash-btn small ghost" onClick={exportGeo}>{trn("{0} Export GeoJSON", <Download size={13} aria-hidden="true" />)}</button>
            <small className="fine">{trn("Map: {0} · drawing: Terra Draw", mapProviderLabel())}</small>
          </div>
        </div>
      </div>

      <aside className="zn-side">
        {wizard ? (
          <ZoneWizard country={country} startCity={wizard.city} onClose={() => { zoneStore.clearSketch(); setWizardOverlay({}); onWizard(null); }} onOverlay={setWizardOverlay} />
        ) : selected ? (
          <div className="zn-panel" aria-label={tr("Selected zone {0}", [displayName(selected)])}>
            <div className="zn-sel-head" style={{ ["--zc" as string]: selected.color || ZONE_COLOR[selected.kind] }}>
              <span className="zn-sel-type"><i />{zoneTypeLabel(selected.kind)}</span>
              <h3>{displayName(selected)}</h3>
              <p><b>{selected.code}</b> · <span className={`zn-status ${statusTone(status)}`}>{status}</span></p>
            </div>
            <dl className="zn-sel-stats">
              <div><dt>{tr("Area")}</dt><dd>{trn("{0} km²", zoneAreaKm(selected).toFixed(2))}</dd></div>
              <div><dt>{tr("Size")}</dt><dd>{trn("{0} × {1} km", size.width.toFixed(1), size.height.toFixed(1))}</dd></div>
              <div><dt>{trn("{0} Drivers", <Car size={12} aria-hidden="true" />)}</dt><dd>{health?.drivers ?? 0}</dd></div>
              <div><dt>{trn("{0} Requests", <Users size={12} aria-hidden="true" />)}</dt><dd>{health?.requests ?? 0}</dd></div>
            </dl>
            {health?.alert ? <p className={`zn-alert ${health.tone}`}><AlertTriangle size={14} aria-hidden="true" /> {trx(health.alert)}</p> : null}
            <div className="zn-sel-actions">
              <Link className="dash-btn small" to={`/zones/${selected.id}`}>{trn("{0} Open zone page", <ExternalLink size={13} aria-hidden="true" />)}</Link>
              <CommandButton command="admin.zone.rotate" className="dash-btn small ghost" type="button" disabled={!canEdit || selected.kind === "pickup"} onDone={() => { if (agent) zoneStore.rotate(selected.id, 15, agent.id); }}>{trn("{0} Rotate 15°", <RotateCw size={13} aria-hidden="true" />)}</CommandButton>
              <CommandButton command="admin.zone.split" className="dash-btn small ghost" type="button" disabled={!canEdit || selected.kind === "pickup"} onDone={() => { if (agent) zoneStore.split(selected.id, agent.id); }}>{trn("{0} Split in two", <SquareSplitHorizontal size={13} aria-hidden="true" />)}</CommandButton>
              <CommandButton command="admin.zone.archive" className="dash-btn small ghost" type="button" disabled={!canEdit || selected.archived} onDone={() => { if (agent) zoneStore.archive(selected.id, agent.id); }}>{trn("{0} Archive", <Archive size={13} aria-hidden="true" />)}</CommandButton>
              <CommandButton command="admin.zone.delete" className="dash-btn small danger-ghost" type="button" targetId={selected.code} disabled={!canEdit} onDone={() => { if (agent) zoneStore.remove(selected.id, agent.id); }}>{trn("{0} Delete", <Trash2 size={13} aria-hidden="true" />)}</CommandButton>
            </div>
            {mergeOptions.length ? (
              <div className="zn-merge">
                <label className="field">{trn("Join with{0}", <select aria-label={tr("Merge source")} value={mergeSource} onChange={(event) => setMergeSource(event.target.value)}>
                    <option value="">{tr("Pick a zone")}</option>
                    {mergeOptions.map((zone) => <option key={zone.id} value={zone.id}>{displayName(zone)}</option>)}
                  </select>)}</label>
                <CommandButton command="admin.zone.merge" className="dash-btn small ghost" type="button" disabled={!canEdit || !mergeSource} onDone={() => { if (agent && mergeSource) { zoneStore.merge(selected.id, mergeSource, agent.id); setMergeSource(""); } }}>{trn("{0} Join", <Merge size={13} aria-hidden="true" />)}</CommandButton>
              </div>
            ) : null}

            <div className="zn-checks" aria-label={tr("Checks for this zone")}>
              <h4>{tr("Checks")}</h4>
              {selectedIssues.length === 0 ? <p className="zn-ok">{trn("{0} All good. No overlap, no crossing lines.", <CircleCheck size={14} aria-hidden="true" />)}</p> : (
                <ul>
                  {selectedIssues.map((issue) => <li key={issue.message} className={issue.level}><AlertTriangle size={13} aria-hidden="true" /> {trSentences(issue.message)}</li>)}
                </ul>
              )}
              <p className="fine" data-holes={selected.holes.length} data-pickups={selected.pickups.length}>{trn("Holes: {0} · Pickup points: {1} · No-stop streets: {2}", selected.holes.length, selected.pickups.length, selected.noStopLines.length)}</p>
            </div>

            <details className="zn-more">
              <summary>{tr("Test a point")}</summary>
              <label className="field">{trn("Latitude, longitude{0}", <input aria-label={tr("Test a point")} value={probe} onChange={(event) => setProbe(event.target.value)} placeholder={`${(cities[0]?.center ?? [0, 0]).join(", ")}`} />)}</label>
              {hits === null ? <small className="fine">{tr("Type a point to see which zone and rules apply.")}</small> : hits.length === 0 ? <p className="zn-alert bad">{tr("That point is in no zone.")}</p> : (
                <ol className="zn-hits" aria-label={tr("Effective zone rules")}>
                  {hits.map((zone) => <li key={zone.id}><b>{displayName(zone)}</b><small>{zoneRuleSummary(zone)}</small></li>)}
                </ol>
              )}
            </details>
            {priorities.length ? (
              <details className="zn-more">
                <summary>{tr("Which rule wins when zones overlap")}</summary>
                <ol className="zn-priority" aria-label={tr("Zone overlap priority")}>
                  {priorities.map((zone, index) => (
                    <li key={zone.id}>
                      <i style={{ background: zone.color || ZONE_COLOR[zone.kind] }} />
                      <span>{displayName(zone)}<small>{zoneTypeLabel(zone.kind)}</small></span>
                      <button data-command="admin.zone.priority" type="button" className="icon-ghost" aria-label={tr("Move {0} up", [zone.name])} disabled={!canEdit || index === 0} onClick={() => {
                        if (!agent) return;
                        const ids = priorities.map((item) => item.id);
                        [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
                        zoneStore.reorderPriority(ids, agent.id);
                      }}><ChevronUp size={14} aria-hidden="true" /></button>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="zn-panel empty">
            <h3>{tr("No zone picked")}</h3>
            <p>{tr("Click a zone on the map or in the list, or make a new one.")}</p>
          </div>
        )}
      </aside>
    </section>
  );
}

export function zoneCountLabel(zones: ZoneShape[]): string {
  const live = zones.filter((zone) => !zone.archived);
  return `${live.length} zone${live.length === 1 ? "" : "s"}`;
}
