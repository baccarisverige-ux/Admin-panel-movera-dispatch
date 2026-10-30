import { useSyncExternalStore } from "react";
import { Layers, RotateCcw } from "lucide-react";
import { isStandardZone, market, marketOfZone, zoneById, type MarketId } from "../markets/markets";
import { countryOfStandard } from "./configDocs.ts";
import { CommandButton } from "../ui/CommandButton";
import { tr, trx } from "../i18n";
import { copyTargets, standardMarks, unpublishedMarks } from "./liveSettings.ts";
import type { ConfigDocName } from "./configDocs.ts";

/** Re-renders when the server's "Uses standard" marks change. */
export function useStandardMark(doc: ConfigDocName, zoneId: string): boolean | undefined {
  return useSyncExternalStore(standardMarks.subscribe, () => standardMarks.get(doc, zoneId), () => undefined);
}

/** G3: the parts of the zone's driver app document saved on the server but not live; undefined when not known. */
export function useUnpublished(doc: ConfigDocName, zoneId: string): string[] | undefined {
  return useSyncExternalStore(unpublishedMarks.subscribe, () => unpublishedMarks.get(doc, zoneId), () => undefined);
}

/** G3: says clearly when the zone's driver app settings have changes that drivers do not get yet. */
export function UnpublishedLine({ zoneId, canEdit }: { zoneId: string; canEdit: boolean }) {
  const keys = useUnpublished("driver_app_config", zoneId);
  if (keys === undefined) return null;
  if (!keys.length) return <p className="standard-bar" role="status" data-testid="unpublished-driver-app">{tr("Driver app: everything saved is live.")}</p>;
  return (
    <div className="standard-bar unpublished" role="status" data-testid="unpublished-driver-app">
      <span>{tr("Driver app: saved on the server but not live yet ({0}). Publish to send it to the drivers.", [keys.join(", ")])}</span>
      <CommandButton
        command="admin.config.publishAppDraft"
        className="dash-btn small"
        targetId={zoneId}
        before={tr("Not live")}
        after={tr("Live")}
        confirmTarget={false}
        disabled={!canEdit}
        summary={tr("The drivers in this zone get the saved driver app settings now: {0}.", [keys.join(", ")])}
      >
        {tr("Publish to drivers")}
      </CommandButton>
    </div>
  );
}

/** G3-D8: copies the driver app settings shown here to every other zone of the country (confirm lists them), then publishes. */
export function CopyToAllZones({ zoneId, zoneName, canEdit }: { zoneId: string; zoneName: string; canEdit: boolean }) {
  const zones = copyTargets(zoneId).map((id) => zoneById(id)?.name ?? id);
  // The copy takes the zone's saved draft: say so when it holds changes the drivers do not have yet.
  const pending = useUnpublished("driver_app_config", zoneId);
  if (!zones.length) return null;
  return (
    <div className="standard-bar" data-testid="copy-all-zones">
      <span>{tr("Each zone keeps driver app settings of its own. Copy these to every zone of the country when they should all be the same.")}</span>
      <CommandButton
        command="admin.config.copyAppToZones"
        className="dash-btn small"
        targetId={zoneId}
        before={tr("Own settings")}
        after={tr("Same as {0}", [zoneName])}
        confirmTarget={false}
        disabled={!canEdit}
        summary={<span data-testid="sure-copy"><strong>{tr("Are you sure?")}</strong> {tr("The settings of {0} will be copied into every zone of {1} and sent to their drivers. Each zone's current values are replaced. Zones affected: {2}.", [zoneName, trx(countryNameOf(zoneId)), zones.join(", ")])}{pending?.length ? <> <strong data-testid="sure-copy-pending">{tr("This zone has changes not yet sent to drivers; they will be copied and sent to all zones too.")}</strong></> : null}</span>}
      >
        {tr("Copy to all zones")}
      </CommandButton>
    </div>
  );
}

/** The small "Uses standard" chip on a zone pill (live panel only). */
export function UsesStandardChip({ doc, zoneId }: { doc: ConfigDocName; zoneId: string }) {
  const mark = useStandardMark(doc, zoneId);
  if (mark !== true) return null;
  return <em className="uses-standard" data-testid={`uses-standard-${zoneId}`} title={tr("This zone has no settings of its own and uses its country's Standard.")}>{tr("Uses standard")}</em>;
}

/**
 * Above the editor in the live panel (contract v0.8.0 §6.4): what the chosen zone uses, and "Go back to Standard"
 * for a zone with its own settings (confirm step; its own settings stay in History).
 */
export function StandardBar(props: { doc: ConfigDocName; docs: readonly ConfigDocName[]; zoneId: string; zoneName: string; country: MarketId; countryName: string; canEdit: boolean }) {
  return <>{standardBar(props, useStandardMark(props.doc, props.zoneId))}{props.docs.includes("driver_app_config") ? <><UnpublishedLine zoneId={props.zoneId} canEdit={props.canEdit} /><CopyToAllZones zoneId={props.zoneId} zoneName={props.zoneName} canEdit={props.canEdit} /></> : null}</>;
}

function standardBar({ docs, zoneId, zoneName, country, countryName, canEdit }: { doc: ConfigDocName; docs: readonly ConfigDocName[]; zoneId: string; zoneName: string; country: MarketId; countryName: string; canEdit: boolean }, mark: boolean | undefined) {
  if (isStandardZone(zoneId)) {
    return <p className="standard-bar standard" role="note" data-testid="standard-bar"><Layers size={14} aria-hidden="true" /> {tr("Standard for {0}: every zone without settings of its own uses these, at once.", [trx(countryName)])}</p>;
  }
  if (mark === undefined) return null;
  if (mark) {
    return <p className="standard-bar uses" role="note" data-testid="standard-bar"><Layers size={14} aria-hidden="true" /> {tr("{0} uses the Standard for {1}. Publishing a change here gives the zone settings of its own.", [zoneName, trx(countryName)])}</p>;
  }
  return (
    <div className="standard-bar own" data-testid="standard-bar">
      <span><Layers size={14} aria-hidden="true" /> {tr("{0} has settings of its own; it does not use the Standard.", [zoneName])}</span>
      <CommandButton
        command="admin.config.useStandard"
        className="dash-btn small ghost"
        targetId={zoneId}
        scope={country}
        before={tr("Own settings")}
        after={tr("Uses standard")}
        confirmTarget={false}
        value={{ docs }}
        disabled={!canEdit}
        summary={<span data-testid="sure-standard"><strong>{tr("Are you sure?")}</strong> {tr("{0} will stop using its own settings and follow the {1} Standard. Its own values will be deleted (an old copy stays in History). Zones affected: {0}.", [zoneName, trx(countryName)])}</span>}
      >
        <RotateCcw size={13} aria-hidden="true" /> {tr("Go back to Standard")}
      </CommandButton>
    </div>
  );
}

/** The publish dialog's line in the live panel: exactly which zones (and Standard) get the change. */
export function PublishTargetsLine({ zoneIds, doc = "driver_app_config" }: { zoneIds: readonly string[]; doc?: ConfigDocName }) {
  const names = zoneIds.map((id) => zoneById(id)?.name ?? id);
  const standards = zoneIds.filter((id) => countryOfStandard(id));
  return (
    <span data-testid="publish-targets">
      {names.length ? tr("Publishes to: {0}. No other zone changes.", [names.join(", ")]) : tr("Nothing is chosen at the top: choose the zones first.")}
      {standards.map((id) => <StandardPublishNote key={id} standardId={id} doc={doc} chosen={zoneIds} />)}
    </span>
  );
}

/** The country's name for a zone or a standard-<CC> key. */
function countryNameOf(id: string): string {
  const country = countryOfStandard(id);
  return country ? market(country as MarketId).name : marketOfZone(id)?.name ?? id;
}

/** G3-D9: publishing a country Standard: who gets it now and which zones with their own settings do not. */
function StandardPublishNote({ standardId, doc, chosen }: { standardId: string; doc: ConfigDocName; chosen: readonly string[] }) {
  const country = countryOfStandard(standardId) as MarketId;
  const zones = market(country).zones.filter((zone) => !chosen.includes(zone.id));
  const known = zones.some((zone) => standardMarks.get(doc, zone.id) !== undefined);
  const own = zones.filter((zone) => standardMarks.get(doc, zone.id) === false).map((zone) => zone.name);
  return (
    <span className="sure-standard-publish" data-testid="sure-standard-publish">
      {" "}<strong>{tr("Are you sure?")}</strong>{" "}
      {tr("Drivers in all {0} zones that follow the Standard get this change now.", [trx(market(country).name)])}{" "}
      {own.length ? tr("Zones with their own settings are NOT changed: {0}.", [own.join(", ")]) : known ? tr("No zone has settings of its own: every zone gets it.") : tr("Zones with their own settings are NOT changed.")}
    </span>
  );
}
