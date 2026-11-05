import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BonusAreaMap } from "../drivers/BonusAreaMap";
import type { MarketId } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { tr, trn } from "../i18n";
import type { ServerZone } from "../zones/live";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { QUEUE_DEFAULTS, QUEUE_RANGES, queueAreaBody, queueAreaPath, type QueueAreaInput } from "./airportQueue.ts";
import { queueAreaKey, useQueueArea } from "./useAirportQueue";

/**
 * Fix job 9 (contract v0.18.39 §63): Zones › airport zone › Queue area. The admin draws the waiting area on the map
 * (or takes the airport outline), turns the queue on or off and sets its numbers; Save sends the whole area.
 */
export function LiveQueueArea({ zone, disabled }: { zone: ServerZone; disabled: boolean }) {
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const area = useQueueArea(zone.zoneId);
  const [draft, setDraft] = useState<QueueAreaInput>({ ...QUEUE_DEFAULTS, polygon: [] });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  useEffect(() => {
    if (area.data) setDraft({ polygon: area.data.polygon, on: area.data.on, leaveGraceMin: area.data.leaveGraceMin, offerSeconds: area.data.offerSeconds, maxQueueOffers: area.data.maxQueueOffers, keepPlaceAfterDecline: area.data.keepPlaceAfterDecline });
  }, [area.data]);
  if (!live || zone.kind !== "airport") return null;
  const set = (patch: Partial<QueueAreaInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setState("idle");
  };
  async function save() {
    setState("saving");
    try {
      await live!.client.put(queueAreaPath(zone.zoneId), queueAreaBody(draft));
      await queryClient.invalidateQueries({ queryKey: queueAreaKey(zone.zoneId) });
      setState("saved");
    } catch {
      setState("failed");
    }
  }
  const country = (["SE", "FR", "TN"].includes(zone.country) ? zone.country : "SE") as MarketId;
  return (
    <section className="zd-stack" aria-label={tr("Airport queue area")}>
      <h3>{tr("Airport queue area")}</h3>
      <p className="fine">{tr("Drivers inside this area wait in line. The first in line gets the airport trips first.")}</p>
      {area.isLoading ? <p className="state-line">{tr("Loading.")}</p> : null}
      {area.isError ? <p className="state-line">{tr("Could not load the queue area.")}</p> : null}
      <label className={draft.on ? "zd-toggle on" : "zd-toggle"}>
        <input type="checkbox" aria-label={tr("Airport queue on")} checked={draft.on} disabled={disabled} onChange={(event) => set({ on: event.target.checked })} />
        <span className="zd-switch" aria-hidden="true"><i /></span>
        <span><b>{tr("Airport queue on")}</b><small>{tr("Off until the area is drawn and saved.")}</small></span>
      </label>
      <BonusAreaMap country={country} areas={draft.polygon.length ? [{ id: "queue", name: tr("Queue area"), ring: draft.polygon }] : []} onChange={(next) => set({ polygon: next[0]?.ring ?? [] })} />
      <p className="fine">{draft.polygon.length ? trn("Queue area: {0} points", draft.polygon.length) : tr("No queue area drawn yet.")}</p>
      <div className="cat-actions">
        <button data-command="admin.zone.copyQueue" type="button" className="dash-btn small ghost" disabled={disabled} onClick={() => set({ polygon: zone.polygon.map((p) => [p[0], p[1]] as [number, number]) })}>{tr("Use the airport outline")}</button>
      </div>
      <div className="zd-fields">
        <NumberField label={tr("Leave the queue after (outside the area)")} unit="min" value={draft.leaveGraceMin} min={QUEUE_RANGES.leaveGraceMin[0]} max={QUEUE_RANGES.leaveGraceMin[1]} disabled={disabled} onChange={(leaveGraceMin) => set({ leaveGraceMin })} />
        <NumberField label={tr("Time to answer a queue offer")} unit="s" value={draft.offerSeconds} min={QUEUE_RANGES.offerSeconds[0]} max={QUEUE_RANGES.offerSeconds[1]} disabled={disabled} onChange={(offerSeconds) => set({ offerSeconds })} />
        <NumberField label={tr("Queue offers before the nearest driver")} value={draft.maxQueueOffers} min={QUEUE_RANGES.maxQueueOffers[0]} max={QUEUE_RANGES.maxQueueOffers[1]} disabled={disabled} onChange={(maxQueueOffers) => set({ maxQueueOffers })} />
      </div>
      <label className={draft.keepPlaceAfterDecline ? "zd-toggle on" : "zd-toggle"}>
        <input type="checkbox" aria-label={tr("A driver who declines keeps his place")} checked={draft.keepPlaceAfterDecline} disabled={disabled} onChange={(event) => set({ keepPlaceAfterDecline: event.target.checked })} />
        <span className="zd-switch" aria-hidden="true"><i /></span>
        <span><b>{tr("A driver who declines keeps his place")}</b><small>{tr("Off: he goes to the back of the queue.")}</small></span>
      </label>
      <div className="cat-actions">
        <button data-command="admin.zone.save" type="button" className="dash-btn small" disabled={disabled || draft.polygon.length < 3 || state === "saving"} onClick={() => void save()}>{tr("Save queue area")}</button>
        {state === "saved" ? <span className="fine">{tr("Saved.")}</span> : null}
        {state === "failed" ? <span className="fine">{tr("Could not save. Try again.")}</span> : null}
      </div>
    </section>
  );
}
