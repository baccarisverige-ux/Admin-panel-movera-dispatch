import { useSyncExternalStore } from "react";
import { trx, tr } from "../i18n";
import { COUNTRY_LABEL } from "../i18n/countries";
import { zoneById } from "../markets/markets";
import { landing } from "../ui/confirmInfo";
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

const nameOf = (id: string) => (/^standard-/.test(id) ? tr("Standard {0}", [trx(COUNTRY_LABEL[id.slice(9) as keyof typeof COUNTRY_LABEL] ?? id.slice(9))]) : zoneById(id)?.name ?? id);

/** Plain sentences: where the setting lands for the ticked scopes (owner 2026-11-16 "Stay on Standard (Rec.)"). */
export function WhereSentences({ zoneIds, doc, keepFollowers = true }: Pick<WhereProps, "zoneIds" | "doc" | "keepFollowers">) {
  // Re-rendered when the server says which zones use their Standard.
  useSyncExternalStore(standardMarks.subscribe, () => zoneIds.map((id) => String(standardMarks.get(doc, id))).join(","), () => "");
  if (!zoneIds.length) return <span data-testid="where-lands">{tr("Nothing is ticked: nothing will be saved.")}</span>;
  const list = (names: string[]) => names.join(", ");
  return (
    <span data-testid="where-lands">
      {landing(zoneIds, (id) => standardMarks.get(doc, id), keepFollowers).map((item) => (
        <span key={item.country}>
          {item.standard ? `${tr("It is saved in {0}.", [nameOf(`standard-${item.country}`)])} ` : ""}
          {item.through.length ? `${tr("These zones use the Standard: they get it through the Standard and stay on it (no copy of their own): {0}.", [list(item.through)])} ` : ""}
          {item.direct.length ? `${tr("These zones have settings of their own: it is saved directly in each: {0}.", [list(item.direct)])} ` : ""}
          {item.detach.length ? `${tr("These zones use the Standard now: each gets settings of its own and stops following the Standard: {0}.", [list(item.detach)])} ` : ""}
          {item.notReached.length ? `${tr("These zones have settings of their own and are not ticked: they do NOT get it: {0}.", [list(item.notReached)])} ` : ""}
          {item.unknown.length ? `${tr("Not known yet whether these use the Standard: {0}.", [list(item.unknown)])} ` : ""}
        </span>
      ))}
      {tr("No other zone changes.")}
    </span>
  );
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

/** The scopes as names, for the "?" of a dialog without a zone pick. */
export const scopeNames = (scope: string | undefined): string => (scope ?? "").split(",").filter((id) => /^standard-[A-Z]{2}$/.test(id) || zoneById(id)).map(nameOf).join(", ");
