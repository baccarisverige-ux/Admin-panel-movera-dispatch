import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, Globe } from "lucide-react";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { CommandButton } from "../ui/CommandButton";
import { tr, trx } from "../i18n/core";
import { useLiveSession } from "./LiveSessionContext";

/**
 * Contract v0.18.162 (contract.json#driverCountryFirst; owner 2026-11-25 "Yes": "If he chooses France, his information
 * goes in admin only in France"). The driver page's Country field is the only place an admin changes a driver's
 * country: Change → pick a country → the reason in the confirm step (kept in the audit, driver.country). The server
 * keeps the admin's own-country scope, the fleet rules and re-checks the cars. A driver with no country is a red error
 * with a "Set country" link to this field.
 */
/** The countries a driver can be moved to: those with a city (the server answers 400 country_not_open for the others). */
export const DRIVER_COUNTRIES = Object.entries((contract as { driverOnboarding: { countries: Record<string, { open: boolean; cities: unknown[] }> } }).driverOnboarding.countries).filter(([, c]) => c.cities.length > 0).map(([code]) => code);
const NAMES: Record<string, string> = { SE: "Sweden", FR: "France", TN: "Tunisia" };
export const countryName = (code: string) => trx(NAMES[code] ?? code) ?? code;

/** The red "Driver has no country" error (driver page and driver list), with its Set country link. */
export function DriverNoCountryError({ driverId, compact = false }: { driverId: string; compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <span className={compact ? "vh-rule-bad" : "vh-rule-bad vh-warn"} {...(compact ? {} : { role: "alert" })} data-testid="driver-no-country-error">
      <AlertTriangle size={14} aria-hidden="true" />{" "}{tr("Error: this driver has no country. Check what happened.")}{" "}
      <button type="button" className="dash-btn small ghost" data-command="admin.driver.country" onClick={(event) => { event.stopPropagation(); if (compact) navigate(`/drivers/${driverId}#driver-country`); else document.getElementById("driver-country")?.scrollIntoView({ block: "center" }); }}>{tr("Set country")}</button>
    </span>
  );
}

export function LiveDriverCountry({ driverId, country }: { driverId: string; country: string | undefined }) {
  const { can } = useLiveSession();
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState("");
  const [notice, setNotice] = useState("");
  const allowed = can("drivers.activate");
  // "Set country" from the driver list opens the page at this field.
  useEffect(() => { if (window.location.hash === "#driver-country") document.getElementById("driver-country")?.scrollIntoView({ block: "center" }); }, []);
  return (
    <section className="fd-box" id="driver-country" data-testid="driver-country">
      <h3><Globe size={15} aria-hidden="true" /> {tr("Country")}</h3>
      {country ? <p data-testid="driver-country-value"><b>{countryName(country)}</b> ({country})</p> : <DriverNoCountryError driverId={driverId} />}
      <p className="fine">{tr("The driver is seen in the admin only under this country. Only this field changes it; the reason is kept in the audit.")}</p>
      {!editing ? (
        <button type="button" className="dash-btn small ghost" data-command="admin.driver.country" disabled={!allowed} title={allowed ? undefined : tr("Your role cannot do that.")} onClick={() => setEditing(true)}>
          {country ? tr("Change") : tr("Set country")}
        </button>
      ) : (
        <div className="fd-inline">
          <label>
            {tr("New country")}{" "}
            <select value={pick} onChange={(event) => setPick(event.target.value)} data-testid="driver-country-pick">
              <option value="">{tr("Choose")}</option>
              {DRIVER_COUNTRIES.filter((code) => code !== country).map((code) => <option key={code} value={code}>{countryName(code)}</option>)}
            </select>
          </label>{" "}
          <CommandButton
            command="admin.driver.country"
            className="dash-btn small danger"
            targetId={driverId}
            confirmTarget={false}
            before={country ?? tr("No country")}
            after={pick}
            value={{ country: pick }}
            summary={tr("Change the country to {0}", [pick ? countryName(pick) : "-"])}
            details={[tr("The driver is set offline. His cars that break the new country's car rules go back to review.")]}
            disabled={!pick || !allowed}
            onDone={() => { setNotice(tr("Country saved.")); setEditing(false); setPick(""); }}
            onError={(error) => setNotice(error instanceof Error ? error.message : "")}
          >
            {tr("Save country")}
          </CommandButton>{" "}
          <button type="button" className="dash-btn small ghost" data-command="admin.ui.drawerClose" onClick={() => { setEditing(false); setPick(""); }}>{tr("Cancel")}</button>
        </div>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
