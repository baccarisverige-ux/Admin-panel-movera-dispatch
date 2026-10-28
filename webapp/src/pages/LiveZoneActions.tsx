import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn } from "../i18n";
import { LIVE_ZONES_KEY } from "../live/LiveZones";
import { namesProblem, NAME_MAX, type ServerZone, type ZoneNames } from "../zones/live";

/**
 * Contract v0.11.0 §21: open or close a server zone (POST /admin/zones/{zoneId}/open|close with expectedVersion), in
 * the confirm box. Never a delete: a closed zone takes no new rides; rides already booked go on.
 */
export function LiveOpenClose({ zone, name, disabled }: { zone: ServerZone; name: string; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const action = zone.open ? "close" : "open";
  return (
    <CommandButton
      command={`admin.zone.${action}`}
      className={zone.open ? "dash-btn small danger-ghost" : "dash-btn small publish"}
      type="button"
      targetId={zone.zoneId}
      confirmTarget={false}
      disabled={disabled}
      value={{ expectedVersion: zone.version }}
      summary={<span data-testid="zone-open-summary">{zone.open ? tr("Close {0}? Riders cannot book new rides here; rides already booked go on. The zone is not deleted and can be opened again.", [name]) : tr("Open {0}? Riders can book here at once.", [name])}</span>}
      onDone={() => void queryClient.invalidateQueries({ queryKey: LIVE_ZONES_KEY })}
    >
      {zone.open ? trn("{0} Close zone", <Lock size={13} aria-hidden="true" />) : trn("{0} Open zone", <LockOpen size={13} aria-hidden="true" />)}
    </CommandButton>
  );
}

const LANGS = [
  { id: "sv", get label() { return tr("Name in Swedish"); } },
  { id: "fr", get label() { return tr("Name in French"); } },
  { id: "en", get label() { return tr("Name in English"); } },
] as const;

/** The three names (sv, fr, en, all required); used by the new-zone steps and the zone page. */
export function NamesFields({ names, onChange, disabled }: { names: ZoneNames; onChange: (next: ZoneNames) => void; disabled?: boolean }) {
  return (
    <>
      {LANGS.map((lang) => (
        <label key={lang.id} className="field">
          {lang.label}
          <input aria-label={lang.label} value={names[lang.id]} maxLength={NAME_MAX} disabled={disabled} onChange={(event) => onChange({ ...names, [lang.id]: event.target.value })} />
        </label>
      ))}
    </>
  );
}

/** Zone page, live: the names and the type, saved with PUT /admin/zones/{zoneId} (expectedVersion). */
export function LiveZoneFields({ zone, disabled }: { zone: ServerZone; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [names, setNames] = useState<ZoneNames>(zone.names);
  const [kind, setKind] = useState<"operating" | "airport">(zone.kind === "airport" ? "airport" : "operating");
  useEffect(() => {
    setNames(zone.names);
    setKind(zone.kind === "airport" ? "airport" : "operating");
  }, [zone.version, zone.zoneId, zone.names, zone.kind]);
  const trimmed = { sv: names.sv.trim(), fr: names.fr.trim(), en: names.en.trim() };
  const changed = JSON.stringify(trimmed) !== JSON.stringify(zone.names) || kind !== zone.kind;
  const problem = namesProblem(names);
  return (
    <div className="zd-fields" data-testid="live-zone-fields">
      <NamesFields names={names} disabled={disabled} onChange={setNames} />
      <label className="field">{trn("Type{0}", <select aria-label={tr("Type")} value={kind} disabled={disabled} onChange={(event) => setKind(event.target.value === "airport" ? "airport" : "operating")}>
          <option value="operating">{tr("Operating zone")}</option>
          <option value="airport">{tr("Airport")}</option>
        </select>)}</label>
      <label className="field">{tr("Zone id")}<input aria-label={tr("Zone id")} value={zone.zoneId} disabled readOnly /></label>
      <div className="cat-actions">
        <CommandButton command="admin.zone.update" className="dash-btn small publish" type="button" targetId={zone.zoneId} confirmTarget={false} disabled={disabled || !changed || Boolean(problem)} title={problem ? tr(problem as Parameters<typeof tr>[0]) : undefined} value={{ expectedVersion: zone.version, names: trimmed, ...(kind !== zone.kind ? { kind } : {}) }} summary={tr("The names and type of {0} go to the server and the apps at once.", [zone.zoneId])} onDone={() => void queryClient.invalidateQueries({ queryKey: LIVE_ZONES_KEY })}>{tr("Save names and type")}</CommandButton>
        {changed ? <button data-command="admin.zone.undo" type="button" className="dash-btn small ghost" onClick={() => { setNames(zone.names); setKind(zone.kind === "airport" ? "airport" : "operating"); }}>{tr("Undo changes")}</button> : null}
      </div>
      {problem ? <p className="rd-form-error" role="alert">{tr(problem as Parameters<typeof tr>[0])}</p> : null}
    </div>
  );
}
