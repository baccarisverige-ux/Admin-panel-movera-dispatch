import { useState } from "react";
import { Home } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { tr } from "../i18n/core";
import { useLiveSession } from "./LiveSessionContext";
import { cleanAddress, type DriverAddress } from "./driverAddress";

/**
 * Contract v0.18.166 (contract.json#signupV2; owner 2026-11-26 "Oui, ajouter l'adresse (Recommandé)", DAC7 and
 * invoices): the sign-up details the driver typed on "Vos informations": home address (Edit, with a reason kept in
 * the audit), Swedish personnummer and taxi licence number. Masked values come as the server sends them.
 */
export function LiveDriverSignUp({ driverId, address, personalNumber, taxiLicenseNumber }: { driverId: string; address?: DriverAddress; personalNumber?: string; taxiLicenseNumber?: string }) {
  const { can } = useLiveSession();
  const allowed = can("drivers.activate");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DriverAddress>({ street: "", postalCode: "", city: "" });
  const [notice, setNotice] = useState("");
  const open = () => { setForm(address && !address.street.includes("•") ? address : { street: "", postalCode: address?.postalCode ?? "", city: address?.city ?? "" }); setEditing(true); };
  const field = (key: keyof DriverAddress, label: string) => (
    <label className="fd-inline-field">{label}{" "}<input value={form[key]} maxLength={key === "street" ? 200 : key === "city" ? 100 : 20} data-testid={`driver-address-${key}`} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
  );
  return (
    <section className="fd-box" id="driver-address" data-testid="driver-signup-details">
      <h3><Home size={15} aria-hidden="true" /> {tr("Home address")}</h3>
      {address ? <p data-testid="driver-address-value">{address.street}<br />{address.postalCode} {address.city}</p> : <p className="vh-help" data-testid="driver-address-missing">{tr("No address yet.")}</p>}
      {personalNumber ? <p data-testid="driver-personal-number">{tr("Personal identity number")}: <b>{personalNumber}</b></p> : null}
      {taxiLicenseNumber ? <p data-testid="driver-taxi-number">{tr("Taxi licence number")}: <b>{taxiLicenseNumber}</b></p> : null}
      {!editing ? (
        <button type="button" className="dash-btn small ghost" data-command="admin.driver.address" disabled={!allowed} title={allowed ? undefined : tr("Your role cannot do that.")} onClick={open}>{address ? tr("Edit") : tr("Add address")}</button>
      ) : (
        <div className="fd-inline">
          {field("street", tr("Street"))} {field("postalCode", tr("Postal code"))} {field("city", tr("City"))}{" "}
          <CommandButton
            command="admin.driver.address"
            className="dash-btn small"
            targetId={driverId}
            confirmTarget={false}
            value={{ address: form }}
            summary={tr("Change the home address")}
            disabled={!cleanAddress(form) || !allowed}
            onDone={() => { setNotice(tr("Address saved.")); setEditing(false); }}
            onError={(error) => setNotice(error instanceof Error ? error.message : "")}
          >
            {tr("Save address")}
          </CommandButton>{" "}
          <button type="button" className="dash-btn small ghost" data-command="admin.ui.drawerClose" onClick={() => setEditing(false)}>{tr("Cancel")}</button>
        </div>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
