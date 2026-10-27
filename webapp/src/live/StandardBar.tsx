import { useSyncExternalStore } from "react";
import { Layers, RotateCcw } from "lucide-react";
import { isStandardZone, type MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { tr, trx } from "../i18n";
import { standardMarks } from "./liveSettings.ts";
import type { ConfigDocName } from "./configDocs.ts";

/** Re-renders when the server's "Uses standard" marks change. */
export function useStandardMark(doc: ConfigDocName, zoneId: string): boolean | undefined {
  return useSyncExternalStore(standardMarks.subscribe, () => standardMarks.get(doc, zoneId), () => undefined);
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
export function StandardBar({ doc, docs, zoneId, zoneName, country, countryName, canEdit }: { doc: ConfigDocName; docs: readonly ConfigDocName[]; zoneId: string; zoneName: string; country: MarketId; countryName: string; canEdit: boolean }) {
  const mark = useStandardMark(doc, zoneId);
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
        summary={tr("{0} will use the Standard for {1} again. Its own settings stay in History.", [zoneName, trx(countryName)])}
      >
        <RotateCcw size={13} aria-hidden="true" /> {tr("Go back to Standard")}
      </CommandButton>
    </div>
  );
}
