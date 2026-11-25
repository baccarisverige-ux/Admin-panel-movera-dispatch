import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router";
import type { DemoRecord } from "../api/seed.ts";
import { tr } from "../i18n/core.ts";
import { carHasNoCountry } from "./rules.ts";

export { carHasNoCountry };

/**
 * v0.18.161 (contract.json#adminListFilters.carZones.noCountry; owner 2026-11-25 "Show as errors and must check what
 * happen"): a live car whose country the server does not know (Vehicle.country null) is a data error: red, with the
 * car id and a button to its owner (its fleet, else its driver), in every car list and on the car page.
 */
export function CarNoCountryError({ record, compact = false }: { record: Pick<DemoRecord, "id" | "fleetId" | "driverId" | "liveNoCountry">; compact?: boolean }) {
  const navigate = useNavigate();
  if (!carHasNoCountry(record)) return null;
  const owner = record.fleetId ? `/fleets/${record.fleetId}` : record.driverId ? `/drivers/${record.driverId}` : null;
  return (
    <span className={compact ? "vh-rule-bad" : "vh-rule-bad vh-warn"} {...(compact ? {} : { role: "alert" })} data-testid="car-no-country-error">
      <AlertTriangle size={14} aria-hidden="true" />{" "}{tr("Error: this car has no country. Check what happened.")}{" "}
      {tr("Car {0}", [record.id])}{" "}
      {owner ? (
        <button
          type="button"
          className="dash-btn small ghost"
          data-command="admin.vehicle.view"
          onClick={(event) => {
            event.stopPropagation();
            navigate(owner);
          }}
        >
          {record.fleetId ? tr("Open the fleet") : tr("Open the driver")}
        </button>
      ) : tr("No owner")}
    </span>
  );
}
