import { useMemo, useState, type ReactNode } from "react";
import { Circle, Copy, Crosshair, FileUp, Flame, Grid3x3, Hand, MapPinned, PenLine, Pentagon, Sparkles, Square, Trash2 } from "lucide-react";
import type { MarketId } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { ZoneCanvas } from "../pages/ZoneCanvas";
import { citiesOf, PLACES } from "../zones/cities";
import { useZoneUi, type DrawTool, type ZoneFocus, type ZoneLayers } from "../zones/bookStore";
import { circleRing, displayName, firstShapeFromFile, joinShapes, ringAreaKm, suggestedShape } from "../zones/releases";
import type { BonusArea } from "./bonus";
import { tr, trn, trx, trSentences } from "../i18n";

type Method = "place" | "copy" | "districts" | "file" | null;

const TOOLS: { tool: DrawTool; label: string; icon: ReactNode }[] = [
  { tool: "render", get label() { return tr("Move map"); }, icon: <Hand size={17} /> },
  { tool: "polygon", get label() { return tr("Draw shape"); }, icon: <Pentagon size={17} /> },
  { tool: "rectangle", get label() { return tr("Rectangle"); }, icon: <Square size={17} /> },
  { tool: "circle", get label() { return tr("Circle"); }, icon: <Circle size={17} /> },
  { tool: "freehand", get label() { return tr("Free hand"); }, icon: <PenLine size={17} /> },
];

const HINT: Partial<Record<DrawTool, string>> = {
  polygon: "Click point by point. Click the first point or press Enter to finish.",
  rectangle: "Click one corner, then the opposite corner.",
  circle: "Click the centre, move out, click again.",
  freehand: "Press and draw. Let go to finish.",
};

/** Draw one or more bonus areas: tools on the map, or from a place, a zone, districts, a file or busy streets. */
export function BonusAreaMap({ country, areas, onChange }: { country: MarketId; areas: BonusArea[]; onChange: (next: BonusArea[]) => void }) {
  const ui = useZoneUi();
  const [tool, setTool] = useState<DrawTool>("render");
  const [focus, setFocus] = useState<ZoneFocus | null>(null);
  const [method, setMethod] = useState<Method>(null);
  const [heat, setHeat] = useState(false);
  const [place, setPlace] = useState("");
  const [km, setKm] = useState(1.5);
  const [picked, setPicked] = useState<string[]>([]);
  const [cityId, setCityId] = useState(citiesOf(country)[0]?.id ?? "");
  const [notice, setNotice] = useState(tr("Pick a tool, then draw the area on the map."));
  const [fitTo, setFitTo] = useState<[number, number][] | undefined>(undefined);
  const cities = citiesOf(country);
  const city = cities.find((item) => item.id === cityId) ?? cities[0];
  const zones = useMemo(() => ui.book.draft.filter((zone) => zone.country === country && !zone.archived && (zone.kind === "operating" || zone.kind === "airport")), [ui.book.draft, country]);
  const fitIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const zone of zones) counts.set(zone.city, (counts.get(zone.city) ?? 0) + 1);
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return zones.filter((zone) => zone.city === main && zone.kind === "operating").map((zone) => zone.id);
  }, [zones]);
  const layers: ZoneLayers = { drivers: false, trips: false, requests: false, demandHour: false, demand7d: heat, pickups: false, queue: false, boosts: false, events: false, gaps: false, before: false, districts: method === "districts", satellite: false };

  function add(ring: [number, number][], name: string) {
    if (ring.length < 3) return;
    onChange([...areas, { id: `A${Date.now().toString(36)}${areas.length}`, name: name || `Area ${areas.length + 1}`, ring }]);
    setFitTo(ring);
    setNotice(tr("{0} added. {1} km².", [name || `Area ${areas.length + 1}`, ringAreaKm(ring).toFixed(2)]));
  }

  function pickTool(next: DrawTool) {
    setTool(next);
    setMethod(null);
    setNotice(HINT[next] ?? tr("Move the map. Pick a tool to draw."));
  }

  function pickCity(id: string) {
    setCityId(id);
    const next = cities.find((item) => item.id === id);
    if (next) setFocus({ lat: next.center[0], lng: next.center[1], nonce: (focus?.nonce ?? 0) + 1 });
  }

  return (
    <div className="db-map">
      <div className="db-map-head">
        <div className="zn-city-jump" role="group" aria-label={tr("City")}>
          {cities.map((item) => <button data-command="admin.drivers.bonusDraw" key={item.id} type="button" aria-pressed={item.id === city?.id} className={item.id === city?.id ? "zn-chip on" : "zn-chip"} onClick={() => pickCity(item.id)}>{item.name}</button>)}
        </div>
        <label className={heat ? "db-heat on" : "db-heat"}>{trn("{0}{1} Where riders ask", <input type="checkbox" aria-label={tr("Show where riders ask for rides")} checked={heat} onChange={(event) => setHeat(event.target.checked)} />, <Flame size={14} aria-hidden="true" />)}</label>
      </div>

      <div className="db-methods" role="group" aria-label={tr("More ways to make an area")}>
        <button data-command="admin.drivers.bonusDraw" type="button" aria-pressed={method === "place"} className={method === "place" ? "zn-method on" : "zn-method"} onClick={() => { setTool("render"); setMethod(method === "place" ? null : "place"); }}><MapPinned size={16} /><b>{tr("Around a place")}</b><small>{tr("Address + distance")}</small></button>
        <button data-command="admin.drivers.bonusDraw" type="button" aria-pressed={method === "copy"} className={method === "copy" ? "zn-method on" : "zn-method"} onClick={() => { setTool("render"); setMethod(method === "copy" ? null : "copy"); }}><Copy size={16} /><b>{tr("Copy a zone")}</b><small>{tr("Same shape as a zone")}</small></button>
        <button data-command="admin.drivers.bonusDraw" type="button" aria-pressed={method === "districts"} className={method === "districts" ? "zn-method on" : "zn-method"} onClick={() => { setTool("render"); setMethod(method === "districts" ? null : "districts"); setPicked([]); }}><Grid3x3 size={16} /><b>{tr("Districts")}</b><small>{tr("Join neighbourhoods")}</small></button>
        <button data-command="admin.drivers.bonusDraw" type="button" aria-pressed={method === "file"} className={method === "file" ? "zn-method on" : "zn-method"} onClick={() => { setTool("render"); setMethod(method === "file" ? null : "file"); }}><FileUp size={16} /><b>{tr("Import file")}</b><small>{tr("GeoJSON or KML")}</small></button>
        <button data-command="admin.drivers.bonusDraw" type="button" className="zn-method" onClick={() => {
          if (!city) return;
          const result = suggestedShape(city);
          if (result.error) setNotice(result.error);
          else add(result.points, `Busy area ${city.name}`);
        }}><Sparkles size={16} /><b>{tr("Busy streets")}</b><small>{tr("Where riders ask most")}</small></button>
      </div>

      {method === "place" && city ? (
        <div className="zn-option zn-row">
          <label className="field">{trn("Place{0}", <select aria-label={tr("Bonus place")} value={place} onChange={(event) => setPlace(event.target.value)}>
              <option value="">{tr("Pick a place")}</option>
              {PLACES.filter((item) => cities.some((entry) => entry.id === item.city)).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>)}</label>
          <label className="field">{trn("Distance around{0}", <NumberField label={tr("Bonus distance around")} value={km} unit="km" max={30} onChange={(value) => setKm(Math.max(0.2, value))} />)}</label>
          <button data-command="admin.drivers.bonusDraw" type="button" className="dash-btn small" disabled={!place} onClick={() => {
            const hit = PLACES.find((item) => item.name === place);
            if (hit) add(circleRing(hit.lat, hit.lng, km), hit.name.split(",")[0] ?? hit.name);
          }}>{tr("Add area")}</button>
        </div>
      ) : null}
      {method === "copy" ? (
        <div className="zn-option zn-row">
          <label className="field">{trn("Zone{0}", <select aria-label={tr("Zone to copy for the bonus")} defaultValue="" onChange={(event) => {
              const zone = zones.find((item) => item.id === event.target.value);
              if (zone) add(zone.points.map((item) => [...item] as [number, number]), displayName(zone));
              event.target.value = "";
            }}>
              <option value="">{tr("Pick a zone")}</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{displayName(zone)}</option>)}
            </select>)}</label>
        </div>
      ) : null}
      {method === "districts" && city ? (
        <div className="zn-option">
          <div className="zn-chips">
            {city.districts.map((item) => (
              <label key={item.id} className={picked.includes(item.id) ? "check-chip on" : "check-chip"}>
                <input type="checkbox" checked={picked.includes(item.id)} onChange={() => setPicked(picked.includes(item.id) ? picked.filter((id) => id !== item.id) : [...picked, item.id])} />{item.name}
              </label>
            ))}
          </div>
          <button data-command="admin.drivers.bonusDraw" type="button" className="dash-btn small" disabled={!picked.length} onClick={() => {
            const result = joinShapes(city.districts.filter((item) => picked.includes(item.id)).map((item) => item.ring));
            if (result.error) setNotice(result.error);
            else {
              add(result.points, city.districts.filter((item) => picked.includes(item.id)).map((item) => item.name).join(" + "));
              setPicked([]);
            }
          }}>{tr("Add the districts as one area")}</button>
        </div>
      ) : null}
      {method === "file" ? (
        <div className="zn-option">
          <label className="dash-btn small ghost zn-file">{trn("{0} Choose a GeoJSON or KML file{1}", <FileUp size={13} aria-hidden="true" />, <input type="file" aria-label={tr("Bonus area file")} accept=".geojson,.json,.kml,application/geo+json,application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void file.text().then((raw) => {
                const result = firstShapeFromFile(raw);
                if (result.error) setNotice(result.error);
                else add(result.points, file.name.replace(/\.[^.]+$/, ""));
              });
            }} />)}</label>
        </div>
      ) : null}

      <div className="zn-map-wrap db-map-wrap">
        <div className="zn-toolbar" role="toolbar" aria-label={tr("Bonus drawing tools")}>
          {TOOLS.map((item) => (
            <button data-command="admin.drivers.bonusDraw" key={item.tool} type="button" className={tool === item.tool ? "zn-tool on" : "zn-tool"} aria-pressed={tool === item.tool} aria-label={trx(item.label)} title={trx(item.label)} onClick={() => pickTool(item.tool)}>
              {item.icon}<span>{trx(item.label)}</span>
            </button>
          ))}
        </div>
        <ZoneCanvas
          zones={zones}
          selectedId=""
          mode={tool}
          layers={layers}
          focus={focus}
          selectionNonce={0}
          fitIds={fitIds}
          viewKey={country}
          overlays={{ fitTo, areas: areas.map((area) => ({ ring: area.ring, name: area.name })), districts: method === "districts" && city ? city.districts.map((item) => ({ ring: item.ring, name: item.name, picked: picked.includes(item.id) })) : undefined }}
          onDrawn={(points, intent) => {
            if (intent === "outer") add(points, "");
            setTool("render");
          }}
          onEdited={() => undefined}
          onCancel={() => pickTool("render")}
        />
        <p className="zn-map-notice" role="status" aria-live="polite">{trSentences(notice)}</p>
      </div>

      <ul className="db-areas" aria-label={tr("Bonus areas")}>
        {areas.length === 0 ? <li className="db-area empty">{trn("{0} No area yet. Draw one on the map or use a way above.", <Crosshair size={14} aria-hidden="true" />)}</li> : areas.map((area, index) => (
          <li key={area.id} className="db-area">
            <i aria-hidden="true">{index + 1}</i>
            <input aria-label={tr("Area {0} name", [index + 1])} value={area.name} onChange={(event) => onChange(areas.map((item) => (item.id === area.id ? { ...item, name: event.target.value } : item)))} />
            <small>{trn("{0} km²", ringAreaKm(area.ring).toFixed(2))}</small>
            <button data-command="admin.drivers.bonusDraw" type="button" className="dash-btn small ghost" onClick={() => setFitTo([...area.ring])}>{tr("Show")}</button>
            <button data-command="admin.drivers.bonusDraw" type="button" className="icon-ghost" aria-label={tr("Remove {0}", [area.name])} onClick={() => onChange(areas.filter((item) => item.id !== area.id))}><Trash2 size={14} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
