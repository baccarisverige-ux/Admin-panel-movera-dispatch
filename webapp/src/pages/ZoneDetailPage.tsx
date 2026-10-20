import { useEffect, useState, type ReactNode } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Car,
  CircleCheck,
  CircleX,
  Clock,
  CreditCard,
  History,
  MapPin,
  Navigation,
  Plane,
  Route,
  Settings2,
  Shapes,
  Smartphone,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { market } from "../markets/markets";
import { Flag } from "../ui/Flag";
import { CommandButton } from "../ui/CommandButton";
import { cityById } from "../zones/cities";
import { zoneStore, useZoneUi } from "../zones/bookStore";
import {
  displayName,
  goLiveState,
  launchChecklist,
  lineKm,
  RIDE_CATEGORIES,
  RIDE_OPTIONS,
  ringSizeKm,
  validateZones,
  ZONE_COLOR,
  ZONE_PAYMENT_METHODS,
  ZONE_TYPES,
  zoneAreaKm,
  zoneHealth,
  zoneStatus,
  zoneTypeLabel,
  type CrossPrice,
  type ZoneShape,
} from "../zones/releases";
import { statusTone } from "./ZoneMap";

type TabId = "shape" | "settings" | "prices" | "dispatch" | "pickups" | "airport" | "hours" | "between" | "preview" | "history";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "shape", label: "Shape", icon: <Shapes size={15} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={15} /> },
  { id: "prices", label: "Prices and fees", icon: <Wallet size={15} /> },
  { id: "dispatch", label: "Dispatch", icon: <Navigation size={15} /> },
  { id: "pickups", label: "Pickup points", icon: <MapPin size={15} /> },
  { id: "airport", label: "Airport", icon: <Plane size={15} /> },
  { id: "hours", label: "Hours and go live", icon: <CalendarClock size={15} /> },
  { id: "between", label: "Rides between zones", icon: <Route size={15} /> },
  { id: "preview", label: "In the apps", icon: <Smartphone size={15} /> },
  { id: "history", label: "History", icon: <History size={15} /> },
];

const CATEGORY_LABEL: Record<string, string> = { economy: "Movera", comfort: "Comfort", premium: "Premium", priority: "Priority", xl: "XL", electric: "Electric", pet: "Pet" };
const OPTION_LABEL: Record<string, string> = { baby_seat: "Baby seat", child_seat: "Child seat", booster_seat: "Booster seat", extra_bags: "Extra bags", pet: "Pet" };
const PAYMENT_LABEL: Record<string, string> = { card: "Card", swish: "Swish", klarna: "Klarna", apple: "Apple Pay", google: "Google Pay", paypal: "PayPal", cash: "Cash", wallet: "Movera wallet" };

function TextField({ label, value, onCommit, type = "text", disabled, placeholder }: { label: string; value: string; onCommit: (value: string) => void; type?: string; disabled?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <label className="field">
      {label}
      <input aria-label={label} type={type} value={text} disabled={disabled} placeholder={placeholder} onChange={(event) => setText(event.target.value)} onBlur={() => { if (text !== value) onCommit(text); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

/** A number saved when the box loses focus, so one change is one undo step. */
function NumberBox({ label, value, unit, onCommit, disabled, step = "any" }: { label: string; value: number; unit?: string; onCommit: (value: number) => void; disabled?: boolean; step?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="field">
      {label}
      <span className="num-field">
        <input aria-label={label} inputMode="decimal" value={text} disabled={disabled} data-step={step} onChange={(event) => setText(event.target.value.replace(/[^\d.,-]/g, ""))} onBlur={() => {
          const parsed = Number(text.replace(",", "."));
          if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
          else setText(String(value));
        }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
        {unit ? <i>{unit}</i> : null}
      </span>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className={checked ? "zd-toggle on" : "zd-toggle"}>
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="zd-switch" aria-hidden="true"><i /></span>
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

function Chips({ legend, all, labels, value, onChange, disabled }: { legend: string; all: string[]; labels: Record<string, string>; value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  return (
    <fieldset className="zd-chips">
      <legend>{legend} <small>{value.length} of {all.length} on</small></legend>
      <div className="check-chips">
        {all.map((id) => (
          <label key={id} className={value.includes(id) ? "check-chip on" : "check-chip"}>
            <input type="checkbox" aria-label={`${legend} ${labels[id] ?? id}`} checked={value.includes(id)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...value, id] : value.filter((item) => item !== id))} />
            {labels[id] ?? id}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The shape drawn small, with holes, pickup points and no-stop streets. */
function ShapePreview({ zone }: { zone: ZoneShape }) {
  const all = [...zone.points, ...zone.pickups.map((pickup) => [pickup.lat, pickup.lng] as [number, number]), ...zone.noStopLines.flat()];
  if (all.length < 1) return <div className="zd-shape empty">No shape yet. Draw it on the map.</div>;
  const lats = all.map(([lat]) => lat);
  const lngs = all.map(([, lng]) => lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const scaleX = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const w = Math.max((east - west) * scaleX, 1e-6);
  const h = Math.max(north - south, 1e-6);
  const box = 260;
  const k = (box - 30) / Math.max(w, h);
  const x = (lng: number) => 15 + (lng - west) * scaleX * k + ((box - 30) - w * k) / 2;
  const y = (lat: number) => 15 + (north - lat) * k + ((box - 30) - h * k) / 2;
  const path = (ring: [number, number][]) => `M${ring.map(([lat, lng]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("L")}Z`;
  const color = zone.color || ZONE_COLOR[zone.kind];
  return (
    <svg className="zd-shape" viewBox={`0 0 ${box} ${box}`} role="img" aria-label={`Shape of ${zone.name}`}>
      <defs><pattern id="zd-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e9edf0" strokeWidth="1" /></pattern></defs>
      <rect width={box} height={box} fill="url(#zd-grid)" />
      {zone.points.length >= 3 ? <path d={[path(zone.points), ...zone.holes.map(path)].join(" ")} fill={color} fillOpacity="0.28" fillRule="evenodd" stroke={color} strokeWidth="2.5" strokeLinejoin="round" /> : null}
      {zone.noStopLines.map((line, index) => <polyline key={index} points={line.map(([lat, lng]) => `${x(lng)},${y(lat)}`).join(" ")} fill="none" stroke="#d03b3b" strokeWidth="4" strokeLinecap="round" />)}
      {zone.pickups.map((pickup) => <circle key={pickup.id} cx={x(pickup.lng)} cy={y(pickup.lat)} r="5" fill="#111614" stroke="#fff" strokeWidth="2" />)}
      {zone.kind === "pickup" && zone.points[0] ? <circle cx={x(zone.points[0][1])} cy={y(zone.points[0][0])} r="7" fill="#111614" stroke="#fff" strokeWidth="2" /> : null}
    </svg>
  );
}

export function ZoneDetailPage() {
  const { zoneId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { agent } = useSession();
  const ui = useZoneUi();
  const canEdit = Boolean(agent && can(agent.role, "zones.edit"));
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "shape") as TabId;
  const [pickupName, setPickupName] = useState("");
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [pickupPhoto, setPickupPhoto] = useState("");
  const zone = ui.book.draft.find((item) => item.id === zoneId);

  function save(patch: Partial<ZoneShape>) {
    if (!agent || !zone) return;
    zoneStore.patch(zone.id, patch, agent.id);
  }

  function setTab(next: TabId) {
    const copy = new URLSearchParams(params);
    copy.set("tab", next);
    setParams(copy, { replace: true });
  }

  if (!zone) {
    // A deleted zone comes back with Undo or a roll back on the Zones page.
    return <NotFoundRecord kind="Zone" id={zoneId} list="/zones" listLabel="zones" />;
  }

  const issues = validateZones(ui.book.draft);
  const checklist = launchChecklist(zone, issues);
  const ready = checklist.filter((item) => item.required).every((item) => item.ok);
  const status = zoneStatus(zone, ui.book);
  const city = cityById(zone.city);
  const country = market(zone.country);
  const minor = country.minorUnits;
  const currency = { SE: "kr", FR: "€", TN: "DT" }[zone.country];
  const health = zoneHealth(zone);
  const size = ringSizeKm(zone.points);
  const scheduled = goLiveState(zone, Date.now()) === "scheduled";
  const parents = ui.book.draft.filter((item) => item.id !== zone.id && !item.archived && item.country === zone.country && (item.kind === "service" || item.kind === "operating" || item.kind === "airport"));
  const color = zone.color || ZONE_COLOR[zone.kind];

  return (
    <div className="zones zd">
      <header className="zd-hero" style={{ ["--zc" as string]: color }}>
        <Link className="zd-back" to={`/zones?country=${zone.country}`}><ArrowLeft size={14} aria-hidden="true" /> All zones</Link>
        <div className="zd-hero-main">
          <span className="zn-sel-type"><i />{zoneTypeLabel(zone.kind)}</span>
          <h2>{displayName(zone)}</h2>
          <p>
            <Flag id={zone.country} /> {country.name} · {city?.name ?? "No city"} · <b>{zone.code}</b> · <span className={`zn-status ${statusTone(status)}`} data-zone-status={status}>Status: {scheduled ? "Scheduled" : status}</span>
          </p>
        </div>
        <dl className="zd-hero-stats">
          <div><dt>Area</dt><dd>{zoneAreaKm(zone).toFixed(2)} km²</dd></div>
          <div><dt>Size</dt><dd>{size.width.toFixed(1)} × {size.height.toFixed(1)} km</dd></div>
          <div><dt><Car size={12} aria-hidden="true" /> Drivers</dt><dd>{health.drivers}</dd></div>
          <div><dt><Users size={12} aria-hidden="true" /> Requests</dt><dd>{health.requests}</dd></div>
        </dl>
        <div className="zd-hero-actions">
          <Link className="dash-btn small" to={`/zones?country=${zone.country}&zone=${zone.id}`}><Shapes size={13} aria-hidden="true" /> Edit on the map</Link>
          <CommandButton command="admin.zone.save" className={zone.active ? "dash-btn small ghost" : "dash-btn small"} type="button" disabled={!canEdit} onDone={() => save({ active: !zone.active })}>{zone.active ? "Switch off" : "Switch on"}</CommandButton>
          <CommandButton command="admin.zone.delete" className="dash-btn small danger-ghost" type="button" targetId={zone.code} disabled={!canEdit} onDone={() => { if (agent) zoneStore.remove(zone.id, agent.id); }}><Trash2 size={13} aria-hidden="true" /> Delete</CommandButton>
        </div>
      </header>

      {health.alert ? <p className={`zn-alert ${health.tone}`}><TriangleAlert size={14} aria-hidden="true" /> {health.alert}</p> : null}

      <section className={ready ? "zd-launch ready" : "zd-launch"} aria-label="Launch checklist">
        <div className="zd-launch-head">
          {ready ? <CircleCheck size={20} aria-hidden="true" /> : <TriangleAlert size={20} aria-hidden="true" />}
          <span><b>{ready ? "Ready to go live" : "Not ready to go live"}</b><small>{checklist.filter((item) => item.ok).length} of {checklist.length} checks pass{scheduled ? ` · starts ${new Intl.DateTimeFormat(country.locale, { dateStyle: "medium", timeStyle: "short" }).format(Date.parse(zone.goLiveAt))}` : ""}</small></span>
        </div>
        <ul>
          {checklist.map((item) => (
            <li key={item.id} className={item.ok ? "ok" : item.required ? "bad" : "warn"}>
              {item.ok ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />}
              <span><b>{item.label}</b><small>{item.hint}{!item.required && !item.ok ? " · recommended" : ""}</small></span>
            </li>
          ))}
        </ul>
      </section>

      <div className="dash-tabs zd-tabs" role="tablist" aria-label="Zone sections">
        {TABS.map((item) => (
          <button data-command="admin.zone.tab" key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : undefined} onClick={() => setTab(item.id)}>{item.icon}{item.label}</button>
        ))}
      </div>

      <section className="dash-card zd-body">
        {tab === "shape" ? (
          <div className="zd-grid">
            <div className="zd-col">
              <ShapePreview zone={zone} />
              <p className="fine">{zone.points.length} points · {zone.holes.length} holes · {zone.pickups.length} pickup points</p>
            </div>
            <div className="zd-col">
              <div className="zd-fields">
                <TextField label="Name" value={zone.name} disabled={!canEdit} onCommit={(name) => save({ name: city && !name.startsWith(`${city.name} · `) ? `${city.name} · ${name}` : name })} />
                <TextField label="Code" value={zone.code} disabled={!canEdit} onCommit={(code) => save({ code: code.toUpperCase() })} />
                <label className="field">Type
                  <select aria-label="Type" value={zone.kind} disabled={!canEdit} onChange={(event) => save({ kind: event.target.value as ZoneShape["kind"], color: ZONE_COLOR[event.target.value as ZoneShape["kind"]] })}>
                    {ZONE_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="field">Inside
                  <select aria-label="Parent" value={zone.parentId ?? ""} disabled={!canEdit} onChange={(event) => save({ parentId: event.target.value || null })}>
                    <option value="">Nothing</option>
                    {parents.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}
                  </select>
                </label>
                <label className="field">Colour<input type="color" aria-label="Colour" value={zone.color} disabled={!canEdit} onChange={(event) => save({ color: event.target.value })} /></label>
                <NumberBox label="Priority" value={zone.priority} disabled={!canEdit} onCommit={(priority) => save({ priority: Math.round(priority) })} />
              </div>
              <TextField label="Notes" value={zone.notes} disabled={!canEdit} onCommit={(notes) => save({ notes })} placeholder="Anything other admins should know" />
              <div className="zd-sub">
                <h4><Ban size={14} aria-hidden="true" /> No-stop streets</h4>
                {zone.noStopLines.length === 0 ? <p className="fine">None. Draw one on the map with the No-stop street tool (L).</p> : (
                  <ul className="zd-lines">
                    {zone.noStopLines.map((line, index) => (
                      <li key={index}>
                        <span>Street {index + 1} · {lineKm(line).toFixed(2)} km</span>
                        <button data-command="admin.zone.removeLine" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => save({ noStopLines: zone.noStopLines.filter((_, item) => item !== index) })}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="zd-stack">
            <div className="zd-toggles">
              <Toggle label="Zone on" hint="Off: riders cannot book here" checked={zone.active} disabled={!canEdit} onChange={(active) => save({ active })} />
              <Toggle label="Cash allowed" checked={zone.cash} disabled={!canEdit} onChange={(cash) => save({ cash })} />
              <Toggle label="PIN at pickup" hint="Rider tells the driver a code" checked={zone.pinRequired} disabled={!canEdit} onChange={(pinRequired) => save({ pinRequired })} />
            </div>
            <Chips legend="Ride categories" all={RIDE_CATEGORIES} labels={CATEGORY_LABEL} value={zone.categories} disabled={!canEdit} onChange={(categories) => save({ categories })} />
            <Chips legend="Ride options" all={RIDE_OPTIONS} labels={OPTION_LABEL} value={zone.options} disabled={!canEdit} onChange={(options) => save({ options })} />
            <Chips legend="Payment methods" all={ZONE_PAYMENT_METHODS} labels={PAYMENT_LABEL} value={zone.paymentMethods} disabled={!canEdit} onChange={(paymentMethods) => save({ paymentMethods })} />
            <div className="zd-fields">
              <TextField label="Oldest app version allowed" value={zone.minAppVersion} disabled={!canEdit} onCommit={(minAppVersion) => save({ minAppVersion })} />
              <TextField label="Paused until" type="datetime-local" value={zone.suspendedUntil} disabled={!canEdit} onCommit={(suspendedUntil) => save({ suspendedUntil })} />
              <TextField label="Why paused" value={zone.suspendReason} disabled={!canEdit} onCommit={(suspendReason) => save({ suspendReason })} />
            </div>
          </div>
        ) : null}

        {tab === "prices" ? (
          <div className="zd-stack">
            <p className="fine"><CreditCard size={13} aria-hidden="true" /> Prices per km and minute live in Pricing. Here: the price set and the extra fees of this zone, VAT included.</p>
            <div className="zd-fields">
              <TextField label="Price set" value={zone.priceSet} disabled={!canEdit} onCommit={(priceSet) => save({ priceSet })} />
              <NumberBox label="Zone fee" unit={currency} value={zone.zoneFeeOre / minor} disabled={!canEdit} onCommit={(value) => save({ zoneFeeOre: Math.round(value * minor) })} />
              <NumberBox label="Airport fee" unit={currency} value={zone.airportFeeOre / minor} disabled={!canEdit} onCommit={(value) => save({ airportFeeOre: Math.round(value * minor) })} />
              <TextField label="Boost rule" value={zone.boostRule} disabled={!canEdit} onCommit={(boostRule) => save({ boostRule })} placeholder="Friday 16:00–19:00 ×1.4" />
            </div>
            {zone.marketZoneId ? <Link className="dash-btn small ghost zd-link" to={`/pricing?country=${zone.country}&zone=${zone.marketZoneId}`}><Wallet size={13} aria-hidden="true" /> Open prices of this zone</Link> : <p className="fine">New zone: its prices come from the price set until it gets its own in Pricing.</p>}
          </div>
        ) : null}

        {tab === "dispatch" ? (
          <div className="zd-stack">
            <p className="fine">Live offer times, search distance and every other dispatch rule are set per zone in Dispatch, the one place to change them. The values here are the starting values of a new zone.{zone.marketZoneId ? <> <Link to={`/dispatch?country=${zone.country}&zone=${zone.marketZoneId}`}>Open this zone in Dispatch</Link></> : null}</p>
            <div className="zd-fields">
              <NumberBox label="Search radius" unit="km" value={zone.searchRadiusKm} disabled={!canEdit} onCommit={(searchRadiusKm) => save({ searchRadiusKm })} />
              <NumberBox label="Offer seconds" unit="s" value={zone.offerSeconds} disabled={!canEdit} onCommit={(offerSeconds) => save({ offerSeconds })} />
              <NumberBox label="Next trip within" unit="km" value={zone.nextTripKm} disabled={!canEdit} onCommit={(nextTripKm) => save({ nextTripKm })} />
              <NumberBox label="Max rider wait" unit="min" value={zone.maxWaitMin} disabled={!canEdit} onCommit={(maxWaitMin) => save({ maxWaitMin })} />
            </div>
            <Toggle label="Destination mode" hint="Drivers can ask for rides towards home" checked={zone.destinationMode} disabled={!canEdit} onChange={(destinationMode) => save({ destinationMode })} />
          </div>
        ) : null}

        {tab === "pickups" ? (
          <div className="zd-stack">
            {zone.pickups.length === 0 ? <p className="zn-empty">No pickup points yet. Add doors, station exits or mall entrances so riders know where to wait.</p> : (
              <ul className="zd-pickups" aria-label="Pickup points">
                {zone.pickups.map((pickup) => (
                  <li key={pickup.id}>
                    <MapPin size={16} aria-hidden="true" />
                    <span><b>{pickup.name}</b><small>{pickup.instructions || "No instructions"} · {pickup.lat.toFixed(5)}, {pickup.lng.toFixed(5)}{pickup.photoUrl ? " · photo" : ""}</small></span>
                    <button data-command="admin.zone.addPickup" type="button" className="dash-btn small ghost" disabled={!canEdit} onClick={() => save({ pickups: zone.pickups.filter((item) => item.id !== pickup.id) })}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="zd-add">
              <h4>Add a pickup point</h4>
              <div className="zd-fields">
                <label className="field">Pickup name<input aria-label="Pickup name" value={pickupName} onChange={(event) => setPickupName(event.target.value)} placeholder="Terminal 5, door 4" /></label>
                <label className="field">Pickup latitude<input aria-label="Pickup latitude" value={pickupLat} onChange={(event) => setPickupLat(event.target.value)} placeholder={String(zone.points[0]?.[0] ?? "")} /></label>
                <label className="field">Pickup longitude<input aria-label="Pickup longitude" value={pickupLng} onChange={(event) => setPickupLng(event.target.value)} placeholder={String(zone.points[0]?.[1] ?? "")} /></label>
                <label className="field">Pickup instructions<input aria-label="Pickup instructions" value={pickupNotes} onChange={(event) => setPickupNotes(event.target.value)} placeholder="Wait by the yellow sign" /></label>
                <label className="field">Pickup photo URL<input aria-label="Pickup photo URL" value={pickupPhoto} onChange={(event) => setPickupPhoto(event.target.value)} /></label>
              </div>
              <p className="fine">Or click the Pickup point tool (K) and click the map.</p>
              <CommandButton command="admin.zone.addPickup" className="dash-btn small" type="button" disabled={!canEdit || !pickupName.trim() || !Number.isFinite(Number(pickupLat)) || !Number.isFinite(Number(pickupLng)) || !pickupLat || !pickupLng} onDone={() => {
                if (!agent) return;
                zoneStore.addPickup(zone.id, { id: `pin-${zone.pickups.length + 1}-${pickupName.slice(0, 12) || "stop"}`, name: pickupName.trim(), lat: Number(pickupLat), lng: Number(pickupLng), instructions: pickupNotes, photoUrl: pickupPhoto.trim() }, agent.id);
                setPickupName("");
                setPickupNotes("");
                setPickupPhoto("");
              }}>Add pickup</CommandButton>
            </div>
            <Toggle label="Only these pickup points" hint="Riders must pick one of them" checked={zone.pickupOnly} disabled={!canEdit} onChange={(pickupOnly) => save({ pickupOnly })} />
          </div>
        ) : null}

        {tab === "airport" ? (
          <div className="zd-stack">
            {zone.kind !== "airport" ? <p className="fine">These settings are for airports. This zone is a {zoneTypeLabel(zone.kind).toLowerCase()}.</p> : null}
            <Toggle label="Driver queue" hint="Drivers wait in line for airport rides" checked={zone.queueOn} disabled={!canEdit} onChange={(queueOn) => save({ queueOn })} />
            <div className="zd-fields">
              <NumberBox label="Max time in queue" unit="min" value={zone.maxQueueMin} disabled={!canEdit} onCommit={(maxQueueMin) => save({ maxQueueMin })} />
              <NumberBox label="Queue fee" unit={currency} value={zone.queueFeeOre / minor} disabled={!canEdit} onCommit={(value) => save({ queueFeeOre: Math.round(value * minor) })} />
              <TextField label="Terminals" value={zone.terminals} disabled={!canEdit} onCommit={(terminals) => save({ terminals })} />
            </div>
            <p className="fine">Queue area: {zone.queuePolygon.length ? `${zone.queuePolygon.length} points` : "not set"} · Pickup area: {zone.pickupArea.length ? `${zone.pickupArea.length} points` : "not set"}</p>
            <div className="cat-actions">
              <CommandButton command="admin.zone.copyQueue" className="dash-btn small ghost" type="button" disabled={!canEdit} onDone={() => save({ queuePolygon: zone.points.map((item) => [...item] as [number, number]) })}>Use zone shape as queue area</CommandButton>
              <CommandButton command="admin.zone.copyPickupArea" className="dash-btn small ghost" type="button" disabled={!canEdit} onDone={() => save({ pickupArea: zone.points.map((item) => [...item] as [number, number]) })}>Use zone shape as pickup area</CommandButton>
            </div>
          </div>
        ) : null}

        {tab === "hours" ? (
          <div className="zd-stack">
            <div className="zn-seg zd-seg" role="radiogroup" aria-label="Opening hours">
              {([["always", "Always open"], ["weekly", "Set hours"], ["range", "From – to dates"]] as const).map(([id, label]) => (
                <button data-command="admin.zone.save" key={id} type="button" role="radio" aria-checked={zone.schedule === id} className={zone.schedule === id ? "on" : undefined} disabled={!canEdit} onClick={() => save({ schedule: id })}>{label}</button>
              ))}
            </div>
            {zone.schedule === "weekly" ? <TextField label="Hours" value={zone.hours} disabled={!canEdit} onCommit={(hours) => save({ hours })} placeholder="22:00–06:00" /> : null}
            {zone.schedule === "range" ? (
              <div className="zd-fields">
                <TextField label="From" type="date" value={zone.from} disabled={!canEdit} onCommit={(from) => save({ from })} />
                <TextField label="Until" type="date" value={zone.until} disabled={!canEdit} onCommit={(until) => save({ until })} />
              </div>
            ) : null}
            <div className="zd-sub">
              <h4><Clock size={14} aria-hidden="true" /> Go live at a set time</h4>
              <p className="fine">After publishing, the zone waits and starts by itself at this time. Empty: it starts when published.</p>
              <div className="zd-fields">
                <TextField label="Go live at" type="datetime-local" value={zone.goLiveAt} disabled={!canEdit} onCommit={(goLiveAt) => save({ goLiveAt })} />
              </div>
              {scheduled ? (
                <CommandButton command="admin.zone.stopLive" className="dash-btn small danger-ghost" type="button" disabled={!canEdit} onDone={() => save({ goLiveAt: "", active: false })}>Cancel the start and switch off</CommandButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "between" ? (
          <div className="zd-stack">
            <p className="fine">A ride starts in {zone.name.replace(`${city?.name} · `, "")} and ends in another zone. What happens?</p>
            <fieldset className="zn-fieldset">
              <legend>Price used</legend>
              <div className="zn-seg zd-seg" role="radiogroup" aria-label="Price used">
                {([["pickup", "This zone's price (pickup)"], ["dropoff", "Drop-off zone's price"], ["higher", "The higher price"]] as [CrossPrice, string][]).map(([id, label]) => (
                  <button data-command="admin.zone.save" key={id} type="button" role="radio" aria-checked={zone.crossPrice === id} className={zone.crossPrice === id ? "on" : undefined} disabled={!canEdit} onClick={() => save({ crossPrice: id })}>{label}</button>
                ))}
              </div>
            </fieldset>
            <div className="zd-toggles">
              <Toggle label="Drivers can leave the zone" hint="Off: rides must end inside this zone" checked={zone.leaveZone} disabled={!canEdit} onChange={(leaveZone) => save({ leaveZone })} />
              <Toggle label="Rides to other cities" hint={`From ${city?.name ?? "this city"} to another city`} checked={zone.otherCities} disabled={!canEdit} onChange={(otherCities) => save({ otherCities })} />
            </div>
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="zd-apps">
            <article className="zd-app">
              <h4><Smartphone size={14} aria-hidden="true" /> Rider app</h4>
              <div className="zd-phone">
                <b>{zone.active ? `Rides in ${zone.name.replace(`${city?.name} · `, "")}` : "Not available here right now"}</b>
                {zone.pickupOnly && zone.pickups.length ? <p>Pick where to meet your driver:</p> : null}
                {zone.pickups.slice(0, 3).map((pickup) => <span key={pickup.id} className="zd-pin"><MapPin size={12} aria-hidden="true" /> {pickup.name}{pickup.instructions ? ` · ${pickup.instructions}` : ""}</span>)}
                {zone.noStopLines.length ? <p>Pickup is not allowed on some streets here. The app moves the pin.</p> : null}
                {zone.zoneFeeOre ? <p>A {zone.kind === "airport" ? "airport" : "zone"} fee of {zone.zoneFeeOre / minor} {currency} is in the price.</p> : null}
                {zone.schedule === "weekly" ? <p>Open {zone.hours}</p> : null}
              </div>
            </article>
            <article className="zd-app">
              <h4><Car size={14} aria-hidden="true" /> Driver app</h4>
              <div className="zd-phone dark">
                <b>{zone.name.replace(`${city?.name} · `, "")}</b>
                {zone.queueOn ? <p>Airport queue on · max {zone.maxQueueMin} min</p> : null}
                {zone.pinRequired ? <p>Ask the rider for the PIN before starting.</p> : null}
                <p>{zone.leaveZone ? "You may drive riders out of the zone." : "Rides end inside this zone."}</p>
                {zone.kind === "restricted" ? <p>Do not enter this area.</p> : null}
                {zone.kind === "no_pickup" ? <p>No pickup or drop-off here.</p> : null}
              </div>
            </article>
          </div>
        ) : null}

        {tab === "history" ? (
          <ol className="zd-history" aria-label="Zone history">
            {ui.book.versions.map((version, index) => {
              const snap = version.find((item) => item.id === zone.id);
              return (
                <li key={index}>
                  <i>v{index + 1}</i>
                  <span><b>Version {index + 1}</b><small>{snap ? `${snap.points.length} points · ${zoneAreaKm(snap).toFixed(2)} km²` : "Not in this version"}</small></span>
                  {snap ? (
                    <CommandButton command="admin.zone.restoreVersion" className="dash-btn small ghost" type="button" disabled={!canEdit} onDone={() => { if (agent) zoneStore.restore(zone.id, index, agent.id); }}>Restore version {index + 1}</CommandButton>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </section>
      {ui.notice ? <p className="zn-version" role="status"><History size={13} aria-hidden="true" /> {ui.notice}</p> : null}
    </div>
  );
}
