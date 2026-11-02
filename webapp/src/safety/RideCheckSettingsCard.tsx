import { useState } from "react";
import { Link } from "react-router";
import { ShieldCheck } from "lucide-react";
import { useSlice } from "../api/hooks";
import { can } from "../auth/permissions";
import { useSession } from "../auth/SessionContext";
import { Card, Num, Row } from "../dispatch/fields";
import { CommandButton } from "../ui/CommandButton";
import {
  RIDE_CHECK_SETTINGS_KEY,
  emptyRideCheckSettings,
  normalizeRideCheckSettings,
  rideCheckSettingsIssues,
  saveRideCheckSettings,
  type RideCheckSettings,
  type RideCheckThresholds,
} from "./rideCheckSettings";
import { tr, trn } from "../i18n";

/** The shared Ride check thresholds, read from the one store. */
export function useRideCheckSettings() {
  const slice = useSlice<RideCheckSettings>(RIDE_CHECK_SETTINGS_KEY, emptyRideCheckSettings());
  return { settings: normalizeRideCheckSettings(slice.value), loading: slice.loading };
}

/**
 * The one editor for the Ride check thresholds. Shown on the Dashboard, in Dispatch → Live and in
 * Dispatch → Rules → Safety; every copy edits the same saved values.
 */
export function RideCheckSettingsCard({ where }: { where: "dashboard" | "dispatch" | "rules" }) {
  const { agent } = useSession();
  const slice = useSlice<RideCheckSettings>(RIDE_CHECK_SETTINGS_KEY, emptyRideCheckSettings());
  const stored = normalizeRideCheckSettings(slice.value);
  const [draft, setDraft] = useState<RideCheckThresholds | null>(null);
  const shown = draft ?? stored;
  const editable = Boolean(agent && can(agent.role, "safety.edit"));
  const dirty = Boolean(draft) && draft!.longStopMinutes !== stored.longStopMinutes;
  const issues = rideCheckSettingsIssues(shown);
  const next = saveRideCheckSettings(stored, shown);
  const patch = (value: Partial<RideCheckThresholds>) => setDraft({ ...shown, ...value });
  const disabled = !editable || slice.loading;
  return (
    <Card
      title={tr("Ride check triggers")}
      tone="green"
      icon={<ShieldCheck size={18} />}
      help={tr("When the driver and rider apps ask \"Is everything OK?\". Same for every zone; the switches per zone are in Dispatch → Rules → Safety.")}
    >
      <Row label={tr("Unexpected long stop")} help={tr("The car stands still mid-trip, not at a planned stop and not in traffic. Ride check starts.")}>
        <Num label={tr("Unexpected long stop")} before="for more than" value={shown.longStopMinutes} unit="min" min={1} disabled={disabled} onChange={(longStopMinutes) => patch({ longStopMinutes })} />
      </Row>
      {!editable ? <p className="dx-readonly">{tr("Only the safety team can change these settings.")}</p> : (
        <div className="rc-settings-save">
          <span className="dx-publish-text">
            <b>{dirty ? tr("Changes not saved") : tr("Everything is saved")}</b>
            {issues.length ? <small role="alert" className="rc-settings-error">{issues.join(" ")}</small> : <small>{tr("The driver and rider apps use the new values on the next trip.")}</small>}
          </span>
          <button data-command="admin.rideCheck.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>{tr("Undo")}</button>
          <CommandButton command="admin.rideCheck.settings" className="dash-btn small" targetId="ride check settings" confirmTarget={false} before={`${stored.longStopMinutes} min`} after={`${shown.longStopMinutes} min`} sliceKey={RIDE_CHECK_SETTINGS_KEY} value={next.value} expectedSliceRev={stored.draftRev} disabled={!dirty || issues.length > 0} onDone={() => setDraft(null)}>{tr("Save")}</CommandButton>
        </div>
      )}
      {where !== "rules" ? <p className="dx-note rc-note"><span>{trn("Other Ride check switches: {0}. Every check is in {1}.", <Link to="/dispatch?tab=safety">{tr("Dispatch → Rules → Safety")}</Link>, <Link to="/incidents?view=ridechecks">{tr("Incidents → Ride checks")}</Link>)}</span></p> : null}
    </Card>
  );
}
