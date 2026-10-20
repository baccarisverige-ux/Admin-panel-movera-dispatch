import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  Car,
  Check,
  Circle,
  CircleCheck,
  Copy,
  FileUp,
  Grid3x3,
  MapPinned,
  PenLine,
  Pentagon,
  Scissors,
  Sparkles,
  Square,
  Users,
  X,
} from "lucide-react";
import { useSession } from "../auth/SessionContext";
import type { MarketId } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { CommandButton } from "../ui/CommandButton";
import { citiesOf, cityById, PLACES, type City } from "../zones/cities";
import { zoneStore, useZoneUi, type DrawTool } from "../zones/bookStore";
import {
  activityInside,
  circleRing,
  cityGaps,
  clipToCity,
  displayName,
  firstShapeFromFile,
  joinShapes,
  removeOverlaps,
  ringAreaKm,
  ringSizeKm,
  shapeChecks,
  suggestCode,
  suggestedShape,
  ZONE_COLOR,
  ZONE_TYPES,
  type ZoneKind,
  type ZoneShape,
} from "../zones/releases";
import { tr, trn, trx, trSentences } from "../i18n";

export type WizardOverlay = { districts?: { ring: [number, number][]; name: string; picked: boolean }[]; outline?: [number, number][] };

type Method = "city" | "districts" | "polygon" | "rectangle" | "circle" | "address" | "freehand" | "copy" | "import" | "suggest";

const METHODS: { id: Method; label: string; hint: string; icon: ReactNode; draw?: DrawTool }[] = [
  { id: "city", get label() { return tr("Whole city"); }, get hint() { return tr("The full city area"); }, icon: <Building2 size={18} /> },
  { id: "districts", get label() { return tr("Pick districts"); }, get hint() { return tr("Join neighbourhoods"); }, icon: <Grid3x3 size={18} /> },
  { id: "polygon", get label() { return tr("Draw shape"); }, get hint() { return tr("Click point by point"); }, icon: <Pentagon size={18} />, draw: "polygon" },
  { id: "rectangle", get label() { return tr("Rectangle"); }, get hint() { return tr("Drag a box"); }, icon: <Square size={18} />, draw: "rectangle" },
  { id: "circle", get label() { return tr("Circle"); }, get hint() { return tr("Centre and size"); }, icon: <Circle size={18} />, draw: "circle" },
  { id: "address", get label() { return tr("Address + distance"); }, get hint() { return tr("Around a place"); }, icon: <MapPinned size={18} /> },
  { id: "freehand", get label() { return tr("Free hand"); }, get hint() { return tr("Draw with mouse or finger"); }, icon: <PenLine size={18} />, draw: "freehand" },
  { id: "copy", get label() { return tr("Copy a zone"); }, get hint() { return tr("Start from another zone"); }, icon: <Copy size={18} /> },
  { id: "import", get label() { return tr("Import file"); }, get hint() { return tr("GeoJSON or KML"); }, icon: <FileUp size={18} /> },
  { id: "suggest", get label() { return tr("Suggested"); }, get hint() { return tr("Where riders book most"); }, icon: <Sparkles size={18} /> },
];

const KINDS: ZoneKind[] = ["operating", "airport", "boost", "event", "no_pickup", "restricted", "fleet"];

const KIND_HINT: Partial<Record<ZoneKind, string>> = {
  operating: "Riders can book here",
  airport: "Queue, fees and pickup doors",
  boost: "Extra pay for drivers",
  event: "Concerts, matches, fairs",
  no_pickup: "No pickup or drop-off",
  restricted: "Drivers may not enter",
  fleet: "A fleet owner's area",
};

type Step = 1 | 2 | 3 | 4;

/** Make a new zone in four steps: city, type and name, how to make the shape, check and save. */
export function ZoneWizard({ country, startCity, onClose, onOverlay }: { country: MarketId; startCity?: string; onClose: () => void; onOverlay: (overlay: WizardOverlay) => void }) {
  const { agent } = useSession();
  const ui = useZoneUi();
  const cities = citiesOf(country);
  const [cityId, setCityId] = useState(startCity && cityById(startCity)?.country === country ? startCity : "");
  const [step, setStep] = useState<Step>(cityId ? 2 : 1);
  const [kind, setKind] = useState<ZoneKind>("operating");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [km, setKm] = useState(2);
  const [copyId, setCopyId] = useState("");
  const [settingsFrom, setSettingsFrom] = useState("");
  const [schedule, setSchedule] = useState<ZoneShape["schedule"]>("always");
  const [hours, setHours] = useState("22:00–06:00");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [goLive, setGoLive] = useState<"publish" | "later">("publish");
  const [goLiveAt, setGoLiveAt] = useState("");
  const [error, setError] = useState("");
  const city = cityById(cityId);
  const sketch = ui.sketch;
  const countryZones = useMemo(() => ui.book.draft.filter((zone) => zone.country === country && !zone.archived), [ui.book.draft, country]);
  const cityZones = countryZones.filter((zone) => zone.city === cityId);
  const autoCode = city ? suggestCode(city, name || "New", ui.book.draft) : "";
  const finalCode = codeTouched ? code : autoCode;
  const checks = useMemo(() => (sketch.length >= 3 && city ? shapeChecks(sketch, city, kind, ui.book.draft) : []), [sketch, city, kind, ui.book.draft]);
  const inside = useMemo(() => activityInside(sketch), [sketch]);
  const areaKm = ringAreaKm(sketch);
  const size = ringSizeKm(sketch);
  const blocking = checks.filter((issue) => issue.level === "error");

  useEffect(() => {
    if (!city) {
      onOverlay({});
      return;
    }
    onOverlay({
      outline: city.outline,
      districts: method === "districts" ? city.districts.map((item) => ({ ring: item.ring, name: item.name, picked: picked.includes(item.id) })) : undefined,
    });
  }, [city, method, picked]);

  useEffect(() => {
    if (city) zoneStore.focusOn(city.center[0], city.center[1]);
  }, [cityId]);

  function chooseCity(next: City) {
    setCityId(next.id);
    setStep(2);
    zoneStore.clearSketch();
  }

  function shape(points: [number, number][], notice: string) {
    setError("");
    zoneStore.setSketch(points, notice);
  }

  function chooseMethod(next: Method) {
    if (!city) return;
    setMethod(next);
    setError("");
    const spec = METHODS.find((item) => item.id === next);
    if (spec?.draw) {
      zoneStore.clearSketch();
      zoneStore.setTool(spec.draw, "sketch");
      zoneStore.notify(`${spec.label}: draw the new zone on the map.`);
      return;
    }
    zoneStore.setTool("render");
    if (next === "city") shape(city.outline.map((point) => [...point] as [number, number]), `The whole of ${city.name} is the shape.`);
    if (next === "suggest") {
      const result = suggestedShape(city);
      if (result.error) setError(result.error);
      else shape(result.points, "Suggested shape around the busiest streets.");
    }
    if (next === "districts" || next === "address" || next === "copy" || next === "import") zoneStore.clearSketch();
  }

  function toggleDistrict(id: string) {
    if (!city) return;
    const next = picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id];
    setPicked(next);
    const result = joinShapes(city.districts.filter((item) => next.includes(item.id)).map((item) => item.ring));
    if (!next.length) zoneStore.clearSketch();
    else if (result.error) setError(result.error);
    else shape(result.points, `${next.length} district${next.length === 1 ? "" : "s"} joined.`);
    if (!name && next.length === 1) setName(city.districts.find((item) => item.id === id)?.name ?? "");
  }

  function aroundPlace(placeLabel: string, distance: number) {
    const place = PLACES.find((item) => item.name === placeLabel);
    if (!place) return;
    shape(circleRing(place.lat, place.lng, distance), `${distance} km around ${place.name}.`);
    if (!name) setName(place.name.split(",")[0] ?? "");
  }

  function save() {
    if (!agent || !city) return;
    const id = zoneStore.createIn({
      country,
      city: city.id,
      kind,
      name,
      code: finalCode,
      points: sketch,
      copyFrom: settingsFrom || (method === "copy" ? copyId : "") || undefined,
      schedule,
      hours: schedule === "weekly" ? hours : "00:00–24:00",
      from: schedule === "range" ? from : "",
      until: schedule === "range" ? until : "",
      goLiveAt: goLive === "later" ? goLiveAt : "",
    }, agent.id);
    if (id) onClose();
  }

  const saveError = !city ? "Pick the city." : !name.trim() ? "Give the zone a name." : sketch.length < 3 ? "Make the shape first." : blocking[0]?.message ?? (goLive === "later" && !goLiveAt ? "Pick when it goes live." : schedule === "range" && (!from || !until) ? "Pick the dates." : "");

  return (
    <div className="zn-panel zn-wizard" aria-label={tr("New zone")}>
      <div className="zn-wiz-head">
        <h3>{trn("New zone{0}", city ? tr(" in {0}", [city.name]) : "")}</h3>
        <button data-command="admin.zone.cancel" type="button" className="icon-ghost" aria-label={tr("Close new zone")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <ol className="zn-steps" aria-label={tr("Steps")}>
        {(["City", "Type and name", "Shape", "Check and save"] as const).map((label, index) => (
          <li key={label} className={step === index + 1 ? "on" : step > index + 1 ? "done" : undefined}>
            <button data-command="admin.zone.wizard" type="button" disabled={index + 1 > step} onClick={() => setStep((index + 1) as Step)}>
              <i>{step > index + 1 ? <Check size={11} aria-hidden="true" /> : index + 1}</i>{trx(label)}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="zn-step" aria-label={tr("Pick the city")}>
          <p className="zn-lead">{tr("Which city is the zone in? The name will start with the city.")}</p>
          <div className="zn-cities">
            {cities.map((item) => {
              const count = countryZones.filter((zone) => zone.city === item.id).length;
              const coverage = cityGaps(ui.book.draft, item, 12).coverage;
              return (
                <button data-command="admin.zone.wizard" key={item.id} type="button" className="zn-city" onClick={() => chooseCity(item)}>
                  <b>{item.name}</b>
                  <small>{item.code} · {count ? tr("{0} zone{1}", [count, count === 1 ? "" : "s"]) : tr("No zones yet")}</small>
                  <span className="zn-cover" aria-label={tr("{0}% covered", [coverage])}><i style={{ width: `${coverage}%` }} /></span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 2 && city ? (
        <section className="zn-step" aria-label={tr("Type and name")}>
          <div className="zn-kinds" role="radiogroup" aria-label={tr("Zone type")}>
            {KINDS.map((item) => (
              <button data-command="admin.zone.wizard" key={item} type="button" role="radio" aria-checked={kind === item} className={kind === item ? "zn-kind on" : "zn-kind"} style={{ ["--zc" as string]: ZONE_COLOR[item] }} onClick={() => setKind(item)}>
                <i aria-hidden="true" />
                <span><b>{trx(ZONE_TYPES.find((type) => type.id === item)?.label)}</b><small>{KIND_HINT[item]}</small></span>
              </button>
            ))}
          </div>
          <label className="field">{trn("Name{0}", <span className="zn-name">
              <em>{city.name} ·</em>
              <input aria-label={tr("Zone name")} value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("Kista Nord")} maxLength={40} />
            </span>)}</label>
          <label className="field">{trn("Code{0}{1}", <input aria-label={tr("Zone code")} value={finalCode} onChange={(event) => { setCodeTouched(true); setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")); }} maxLength={12} />, <small className="fine">{tr("Made from the city code. You can change it.")}</small>)}</label>
          <div className="zn-step-foot">
            <button data-command="admin.zone.wizard" type="button" className="dash-btn" disabled={!name.trim()} onClick={() => setStep(3)}>{tr("Next: the shape")}</button>
          </div>
        </section>
      ) : null}

      {step === 3 && city ? (
        <section className="zn-step" aria-label={tr("Make the shape")}>
          <div className="zn-methods" role="radiogroup" aria-label={tr("How to make it")}>
            {METHODS.map((item) => (
              <button data-command="admin.zone.wizard" key={item.id} type="button" role="radio" aria-checked={method === item.id} className={method === item.id ? "zn-method on" : "zn-method"} onClick={() => chooseMethod(item.id)}>
                {item.icon}
                <b>{trx(item.label)}</b>
                <small>{trx(item.hint)}</small>
              </button>
            ))}
          </div>

          {method === "districts" ? (
            <div className="zn-option" role="group" aria-label={tr("Districts")}>
              <p className="fine">{tr("Click the districts to join. They must touch.")}</p>
              <div className="zn-chips">
                {city.districts.map((item) => {
                  const used = cityZones.some((zone) => zone.kind === "operating" && zone.name.endsWith(item.name));
                  return (
                    <label key={item.id} className={picked.includes(item.id) ? "check-chip on" : "check-chip"}>
                      <input type="checkbox" checked={picked.includes(item.id)} onChange={() => toggleDistrict(item.id)} />{item.name}{used ? <small>{" "}{tr("· has a zone")}</small> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          {method === "address" ? (
            <div className="zn-option zn-row">
              <label className="field">{trn("Place{0}", <select aria-label={tr("Place")} value={placeName} onChange={(event) => { setPlaceName(event.target.value); aroundPlace(event.target.value, km); }}>
                  <option value="">{tr("Pick a place")}</option>
                  {PLACES.filter((item) => item.city === city.id).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                </select>)}</label>
              <label className="field">{trn("Distance around{0}", <NumberField label={tr("Distance around")} value={km} unit="km" max={50} onChange={(value) => { const next = Math.max(0.2, value); setKm(next); if (placeName) aroundPlace(placeName, next); }} />)}</label>
            </div>
          ) : null}
          {method === "copy" ? (
            <div className="zn-option">
              <label className="field">{trn("Zone to copy{0}", <select aria-label={tr("Zone to copy")} value={copyId} onChange={(event) => {
                  setCopyId(event.target.value);
                  setSettingsFrom(event.target.value);
                  const source = countryZones.find((zone) => zone.id === event.target.value);
                  if (source) shape(source.points.map((point) => [...point] as [number, number]), `Copied the shape of ${displayName(source)}. Change it after saving.`);
                }}>
                  <option value="">{tr("Pick a zone")}</option>
                  {countryZones.filter((zone) => zone.kind !== "service" && zone.kind !== "pickup").map((zone) => <option key={zone.id} value={zone.id}>{displayName(zone)}</option>)}
                </select>)}</label>
            </div>
          ) : null}
          {method === "import" ? (
            <div className="zn-option">
              <label className="dash-btn small ghost zn-file">{trn("{0} Choose a GeoJSON or KML file{1}", <FileUp size={13} aria-hidden="true" />, <input type="file" aria-label={tr("Shape file")} accept=".geojson,.json,.kml,application/geo+json,application/json,application/vnd.google-earth.kml+xml" onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void file.text().then((raw) => {
                    const result = firstShapeFromFile(raw);
                    if (result.error) setError(result.error);
                    else shape(result.points, `Shape from ${file.name}.`);
                  });
                }} />)}</label>
            </div>
          ) : null}
          {method && METHODS.find((item) => item.id === method)?.draw ? (
            <div className="zn-option zn-row">
              <p className="fine">{ui.tool !== "render" ? tr("Draw on the map now. Esc stops.") : sketch.length ? tr("Shape drawn.") : tr("Drawing stopped.")}</p>
              <button data-command="admin.zone.wizard" type="button" className="dash-btn small ghost" onClick={() => chooseMethod(method)}>{tr("Draw again")}</button>
            </div>
          ) : null}
          {error ? <p className="rd-form-error" role="alert">{trSentences(error)}</p> : null}

          {sketch.length >= 3 ? (
            <div className="zn-shape-sum" aria-label={tr("Shape")}>
              <span>{trn("{0} · {1} × {2} km", <b>{trn("{0} km²", areaKm.toFixed(2))}</b>, size.width.toFixed(1), size.height.toFixed(1))}</span>
              <div className="zn-row">
                <button data-command="admin.zone.snap" type="button" className="dash-btn small ghost" onClick={() => { const result = clipToCity(sketch, city); if (result.error) setError(result.error); else shape(result.points, `Cut to the ${city.name} border.`); }}>{trn("{0} Fit to city border", <Scissors size={13} aria-hidden="true" />)}</button>
                <button data-command="admin.zone.snap" type="button" className="dash-btn small ghost" onClick={() => { const result = removeOverlaps(sketch, ui.book.draft.filter((zone) => zone.country === country)); if (result.error) setError(result.error); else shape(result.points, "Overlaps with other zones removed. Zones now touch."); }}>{trn("{0} Remove overlaps", <Scissors size={13} aria-hidden="true" />)}</button>
              </div>
            </div>
          ) : null}
          <div className="zn-step-foot">
            <button data-command="admin.zone.wizard" type="button" className="dash-btn ghost" onClick={() => setStep(2)}>{tr("Back")}</button>
            <button data-command="admin.zone.wizard" type="button" className="dash-btn" disabled={sketch.length < 3} onClick={() => { zoneStore.setTool("render"); setStep(4); }}>{tr("Next: check and save")}</button>
          </div>
        </section>
      ) : null}

      {step === 4 && city ? (
        <section className="zn-step" aria-label={tr("Check and save")}>
          <div className="zn-summary">
            <i style={{ background: ZONE_COLOR[kind] }} aria-hidden="true" />
            <span><b>{city.name} · {name}</b><small>{trn("{0} · {1} · {2} km²", finalCode, trx(ZONE_TYPES.find((type) => type.id === kind)?.label), areaKm.toFixed(2))}</small></span>
          </div>
          <div className="zn-live-checks" aria-label={tr("Live checks")}>
            {checks.length === 0 ? <p className="zn-ok">{trn("{0} No overlap, inside {1}, lines do not cross.", <CircleCheck size={14} aria-hidden="true" />, city.name)}</p> : checks.map((issue) => (
              <p key={issue.message} className={issue.level === "error" ? "zn-alert bad" : "zn-alert busy"}><AlertTriangle size={14} aria-hidden="true" /> {trSentences(issue.message)}</p>
            ))}
          </div>
          <dl className="zn-inside" aria-label={tr("Inside the shape now")}>
            <div><dt>{trn("{0} Drivers online", <Car size={12} aria-hidden="true" />)}</dt><dd>{inside.drivers}</dd></div>
            <div><dt>{trn("{0} Open requests", <Users size={12} aria-hidden="true" />)}</dt><dd>{inside.requests}</dd></div>
            <div><dt>{tr("Trips now")}</dt><dd>{inside.trips}</dd></div>
            <div><dt>{tr("Requests · 7 days")}</dt><dd>{inside.demand7d}</dd></div>
          </dl>
          <label className="field">{trn("Copy prices and settings from{0}", <select aria-label={tr("Copy settings from")} value={settingsFrom} onChange={(event) => setSettingsFrom(event.target.value)}>
              <option value="">{tr("Movera default settings")}</option>
              {countryZones.filter((zone) => zone.kind === kind || zone.kind === "operating").filter((zone) => zone.kind !== "service").map((zone) => <option key={zone.id} value={zone.id}>{displayName(zone)}</option>)}
            </select>)}</label>
          <fieldset className="zn-fieldset">
            <legend>{tr("Opening hours")}</legend>
            <div className="zn-seg" role="radiogroup" aria-label={tr("Opening hours")}>
              {([["always", "Always open"], ["weekly", "Set hours"], ["range", "From – to dates"]] as const).map(([id, label]) => (
                <button data-command="admin.zone.wizard" key={id} type="button" role="radio" aria-checked={schedule === id} className={schedule === id ? "on" : undefined} onClick={() => setSchedule(id)}>{trx(label)}</button>
              ))}
            </div>
            {schedule === "weekly" ? <label className="field">{trn("Hours{0}", <input aria-label={tr("Hours")} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="22:00–06:00" />)}</label> : null}
            {schedule === "range" ? (
              <div className="zn-row">
                <label className="field">{trn("From{0}", <input type="date" aria-label={tr("From day")} value={from} onChange={(event) => setFrom(event.target.value)} />)}</label>
                <label className="field">{trn("Until{0}", <input type="date" aria-label={tr("Until day")} value={until} onChange={(event) => setUntil(event.target.value)} />)}</label>
              </div>
            ) : null}
          </fieldset>
          <fieldset className="zn-fieldset">
            <legend>{tr("Goes live")}</legend>
            <div className="zn-seg" role="radiogroup" aria-label={tr("Goes live")}>
              <button data-command="admin.zone.wizard" type="button" role="radio" aria-checked={goLive === "publish"} className={goLive === "publish" ? "on" : undefined} onClick={() => setGoLive("publish")}>{tr("When published")}</button>
              <button data-command="admin.zone.wizard" type="button" role="radio" aria-checked={goLive === "later"} className={goLive === "later" ? "on" : undefined} onClick={() => setGoLive("later")}>{tr("At a set time")}</button>
            </div>
            {goLive === "later" ? <label className="field">{trn("Start{0}", <input type="datetime-local" aria-label={tr("Go live at")} value={goLiveAt} onChange={(event) => setGoLiveAt(event.target.value)} />)}</label> : null}
          </fieldset>
          <p className="fine">{tr("Saved as a draft. Then send it for review: a second admin publishes it.")}</p>
          {saveError ? <p className="rd-form-error" role="alert">{saveError}</p> : null}
          <div className="zn-step-foot">
            <button data-command="admin.zone.wizard" type="button" className="dash-btn ghost" onClick={() => setStep(3)}>{tr("Back")}</button>
            <CommandButton command="admin.zone.create" className="dash-btn publish" type="button" disabled={Boolean(saveError)} title={saveError} onDone={save}>{tr("Save as draft")}</CommandButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
