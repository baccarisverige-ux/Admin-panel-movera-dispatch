import { useMemo, useState } from "react";
import { useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import type { BonusMapArea } from "../dashboard/DriversMap";
import type { ZoneBalance } from "../dashboard/insights";
import { BONUS_KEY, bonusState, emptyBonusBook, normalizeBonusBook, type BonusBook } from "../drivers/bonus";
import { BonusQuickPopup } from "../drivers/BonusQuickPopup";
import type { Market, MarketId } from "../markets/markets";
import { tr, trn } from "../i18n";
import { surgeRows } from "./rows";
import type { ZoneSurge } from "./surge";
import { SurgeControls } from "./SurgeControls";
import { SurgeQuickPopup } from "./SurgeQuickPopup";
import { useSurgePref } from "./useSurgePref";
import { useLiveMapSurge } from "../live/useLiveSurge";
import { SLICE_KEY, emptyPricingStore, normalizeStore } from "./zonePricing";

/**
 * The surge layer and the driver bonus areas for a live map, the same on the Dashboard and in Dispatch:
 * the data, the layer chips and the quick pop-ups that open when a zone or an area is clicked.
 */
export function useLiveMapExtras({ prefKey, country, market, zoneIds, balance, now }: { prefKey: string; country: MarketId; market: Market; zoneIds: readonly string[]; balance: readonly Pick<ZoneBalance, "zoneId" | "waiting" | "free">[]; now: number }) {
  const pricingSlice = useSlice<unknown>(SLICE_KEY, emptyPricingStore());
  const pricing = useMemo(() => normalizeStore(pricingSlice.value), [pricingSlice.value]);
  const surgePref = useSurgePref(prefKey, { shown: false, style: "zones" });
  const minute = Math.floor(now / 60_000) * 60_000;
  const zoneKey = (zoneIds.length ? zoneIds : market.zones.map((zone) => zone.id)).join(",");
  const balanceKey = balance.map((row) => `${row.zoneId}:${row.waiting}:${row.free}`).join("|");
  // Worked out per minute, but at the real time: a surge started this minute shows at once.
  const surge: ZoneSurge[] = useMemo(
    () => surgeRows(pricing, zoneKey.split(","), new Map(balance.map((row) => [row.zoneId, { waiting: row.waiting, free: row.free }])), Date.now()).map((row) => row.surge),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pricing, zoneKey, balanceKey, minute],
  );
  // Live (contract.json#driverSurgeMap): the server's surge now, in the driver map's colours.
  const liveSurge = useLiveMapSurge(zoneKey.split(","), pricing);
  const bonusSlice = useSlice<BonusBook>(BONUS_KEY, emptyBonusBook());
  const bonusAreas: BonusMapArea[] = useMemo(() => normalizeBonusBook(bonusSlice.value).bonuses
    .filter((bonus) => bonus.country === country && bonus.kind === "area")
    .map((bonus) => ({ bonus, state: bonusState(bonus, minute, market.timeZone) }))
    .filter((item) => item.state === "live" || item.state === "today")
    .map(({ bonus, state }) => ({ id: bonus.id, label: state === "live" ? tr("Bonus now · {0}", [bonus.name]) : tr("{0} · from {1}", [bonus.name, bonus.start]), live: state === "live", rings: bonus.areas.map((area) => area.ring) })), [bonusSlice.value, country, minute, market.timeZone]);
  const [showBonus, setShowBonus] = useState(true);
  return { surge: liveSurge ? liveSurge.rows : surge, surgeLive: Boolean(liveSurge), surgeFailed: liveSurge?.state === "failed", surgePref, bonusAreas, showBonus, setShowBonus };
}

/** "Driver bonus areas" chip and the surge layer switch with its style picker. */
export function LiveMapLayerChips({ bonusCount, showBonus, onBonus, surgePref, surgeLive = false }: { bonusCount: number; showBonus: boolean; onBonus: (shown: boolean) => void; surgePref: ReturnType<typeof useSurgePref>; surgeLive?: boolean }) {
  return (
    <>
      <button data-command="admin.ui.mapLayer" type="button" aria-pressed={showBonus} className={showBonus ? "state-chip" : "state-chip off"} onClick={() => onBonus(!showBonus)}>{trn("{0}Driver bonus areas{1}", <i style={{ background: "#f2994a" }} />, <strong>{bonusCount}</strong>)}</button>
      <SurgeControls compact shown={surgePref.shown} style={surgePref.style} onShown={surgePref.setShown} onStyle={surgePref.setStyle} noStyle={surgeLive} />
    </>
  );
}

export type QuickTarget = { kind: "surge"; zoneId: string } | { kind: "bonus"; id: string } | null;

/** The pop-up for the clicked surge zone or bonus area, drawn on top of the map. */
export function LiveMapQuickPopup({ target, surge, country, market, withScope, onClose, onNotice }: { target: QuickTarget; surge: readonly ZoneSurge[]; country: MarketId; market: Market; withScope: (path: string) => string; onClose: () => void; onNotice: (text: string) => void }) {
  const { agent } = useSession();
  if (!target) return null;
  if (target.kind === "surge") {
    const zone = surge.find((row) => row.zoneId === target.zoneId);
    if (!zone) return null;
    const fullLink = agent && can(agent.role, "settings.read") ? withScope(`/pricing?zone=${zone.zoneId}&tab=surge`) : null;
    return <SurgeQuickPopup key={zone.zoneId} zone={zone} timeZone={market.timeZone} fullLink={fullLink} onClose={onClose} onNotice={onNotice} />;
  }
  const fullLink = agent && can(agent.role, "drivers.read") ? withScope("/drivers?view=bonuses") : null;
  return <BonusQuickPopup key={target.id} bonusId={target.id} country={country} fullLink={fullLink} onClose={onClose} onNotice={onNotice} />;
}
