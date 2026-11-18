import { useSyncExternalStore } from "react";
import { tr } from "../i18n";
import { watchedIds, whereText } from "../ui/confirmInfo";
import { scopeName as nameOf } from "../ui/scopeNames";
import type { ConfigDocName } from "./configDocs.ts";
import { standardMarks } from "./liveSettings.ts";

export type WhereProps = {
  /** The scopes this save would write (zones and standard-<CC>), as chosen at the top or edited on the page. */
  zoneIds: readonly string[];
  /** The server document that says whether a zone uses its Standard. */
  doc: ConfigDocName;
  /** false: every chosen zone is written even with its Standard (Pricing: each zone has prices of its own edit). */
  keepFollowers?: boolean | ((zoneId: string) => boolean);
  /** true: the admin may leave zones out here; the ticked ones are sent as the command's scope. */
  pick?: boolean;
};

/**
 * Plain sentences: where the setting lands for the ticked scopes (owner 2026-11-16 "Stay on Standard (Rec.)").
 * Supervisor MF-R2-1: re-rendered when the server says which zones use their Standard, for every zone of the country
 * (an unticked zone on the Standard changes too); a zone not known yet is named, never left out.
 */
export function WhereSentences({ zoneIds, doc, keepFollowers = true }: Pick<WhereProps, "zoneIds" | "doc" | "keepFollowers">) {
  useSyncExternalStore(standardMarks.subscribe, () => watchedIds(zoneIds).map((id) => String(standardMarks.get(doc, id))).join(","), () => "");
  return <span data-testid="where-lands">{whereText(zoneIds, (id) => standardMarks.get(doc, id), keepFollowers)}</span>;
}

/**
 * The zone pick inside a settings confirm dialog: the admin ticks the Standard and the zones again before Confirm
 * (owner 2026-11-16 "when confirm any setting must again pick zone"), and reads where the setting will land.
 */
export function WhereItLands({ zoneIds, doc, keepFollowers, pick, ticked, onTicked }: WhereProps & { ticked: readonly string[]; onTicked: (next: string[]) => void }) {
  const toggle = (id: string) => onTicked(ticked.includes(id) ? ticked.filter((item) => item !== id) : zoneIds.filter((item) => item === id || ticked.includes(item)));
  return (
    <fieldset className="where-lands" data-testid="where-pick">
      <legend>{pick ? tr("Tick again where to save it") : tr("Tick each place again to confirm it")}</legend>
      <div className="where-lands-list">
        {zoneIds.map((id) => (
          <label key={id} className="check-row"><input type="checkbox" checked={ticked.includes(id)} onChange={() => toggle(id)} /> {nameOf(id)}</label>
        ))}
      </div>
      {zoneIds.length > 1 ? <button type="button" data-command="admin.confirm.tickAll" className="dash-btn small ghost" onClick={() => onTicked(ticked.length === zoneIds.length ? [] : [...zoneIds])}>{ticked.length === zoneIds.length ? tr("Untick all") : tr("Tick all")}</button> : null}
      <p className="where-lands-text"><WhereSentences zoneIds={pick ? ticked : zoneIds} doc={doc} keepFollowers={keepFollowers} /></p>
      {!pick && ticked.length < zoneIds.length ? <p className="fine-print">{tr("To leave a zone out, cancel and discard its changes on the page.")}</p> : null}
    </fieldset>
  );
}
