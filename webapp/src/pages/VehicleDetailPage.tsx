import { useEffect, useMemo, useState } from "react";
import { NotFoundRecord } from "../ui/NotFoundRecord";
import { Link, useNavigate, useParams } from "react-router";
import { AlertTriangle, ArrowLeft, Banknote, Camera, CarFront, CheckCircle2, FileText, ListChecks, XCircle } from "lucide-react";
import { useRecords, useSlice } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { vehicleBlock, type Vehicle } from "../drivers/gate";
import {
  driverOps,
  emptyDriverOpsBook,
  updateVehicleOps,
  vehicleOps,
  type DriverOpsBook,
  type VehicleOps,
} from "../drivers/ops";
import { can } from "../auth/permissions";
import { HealthPill } from "../fleet/ui";
import { formatMoney } from "../markets/markets";
import { CATEGORY_LABELS, PHOTO_SIDES, VEHICLE_RULES_KEY, carDocs, carEarnings, checks, countryOfZone, emptyVehicleRules, fits, normalizeVehicleRules, photosOf, setPhoto, shouldHold, type VehicleRules } from "../vehicles/rules";
import { CommandButton } from "../ui/CommandButton";

export function VehicleDetailPage() {
  const { id = "" } = useParams();
  const { agent } = useSession();
  const vehicles = useRecords("vehicles", null);
  const drivers = useRecords("drivers", null);
  const fleets = useRecords("fleets", null);
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const rulesSlice = useSlice<VehicleRules>(VEHICLE_RULES_KEY, emptyVehicleRules());
  const rules = normalizeVehicleRules(rulesSlice.value);
  const trips = useRecords("trips", null);
  const navigate = useNavigate();
  const [now] = useState(() => Date.now());
  const record = vehicles.data?.find((item) => item.id === id);
  const profile = record ? vehicleOps(store.value, record) : null;

  const [year, setYear] = useState("2022");
  const [seats, setSeats] = useState("4");
  const [fuel, setFuel] = useState<Vehicle["fuel"]>("hybrid");
  const [category, setCategory] = useState<Vehicle["category"]>("economy");
  const [fleetId, setFleetId] = useState("");
  const [inspectionExpiresAt, setInspectionExpiresAt] = useState("");
  const [insuranceExpiresAt, setInsuranceExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [driverId, setDriverId] = useState("");
  const [notice, setNotice] = useState("Vehicle changes are not live until a command is confirmed.");

  useEffect(() => {
    if (!profile || !record) return;
    setYear(String(profile.year));
    setSeats(String(profile.seats));
    setFuel(profile.fuel);
    setCategory(profile.category);
    setFleetId(profile.fleetId);
    setInspectionExpiresAt(profile.inspectionExpiresAt);
    setInsuranceExpiresAt(profile.insuranceExpiresAt);
    setNote(profile.note);
    setDriverId(record.driverId ?? "");
  }, [profile?.vehicleId, profile?.year, profile?.seats, profile?.fuel, profile?.category, profile?.fleetId, profile?.inspectionExpiresAt, profile?.insuranceExpiresAt, profile?.note, record?.driverId]);

  const driverOptions = useMemo(() => {
    const fleetScope = agent?.scope.fleetPartnerId;
    return (drivers.data ?? []).filter((driver) => !fleetScope || driver.fleetId === fleetScope);
  }, [agent?.scope.fleetPartnerId, drivers.data]);

  if (vehicles.isLoading || drivers.isLoading || fleets.isLoading || store.loading) return <p className="state-line">Loading vehicle.</p>;
  if (!record || !profile) {
    return <NotFoundRecord kind="Vehicle" id={id} list="/vehicles" listLabel="vehicles" />;
  }
  if (agent?.scope.fleetPartnerId && record.fleetId !== agent.scope.fleetPartnerId) {
    return (
      <div className="page-heading">
        <div>
          <h2>No access</h2>
          <p>This vehicle belongs to another fleet partner.</p>
          <Link to="/vehicles">Back to vehicles</Link>
        </div>
      </div>
    );
  }

  const draftPatch: Partial<Omit<VehicleOps, "vehicleId">> = {
    year: Number(year) || profile.year,
    seats: Number(seats) || profile.seats,
    fuel,
    category,
    fleetId,
    inspectionExpiresAt,
    insuranceExpiresAt,
    note,
  };
  const nextBook = updateVehicleOps(store.value, record, draftPatch);
  const nextProfile = vehicleOps(nextBook, record);
  const ruleIssue = vehicleBlock({
    year: nextProfile.year,
    seats: nextProfile.seats,
    fuel: nextProfile.fuel,
    category: nextProfile.category,
  });
  const savedStatus =
    record.status === "on_hold"
      ? "on_hold"
      : ruleIssue || nextProfile.registrationStatus !== "approved"
        ? "ineligible"
        : "eligible";
  const selectedDriver = driverOptions.find((driver) => driver.id === driverId);

  const country = countryOfZone(record.zoneId);
  const countryRules = rules.countries[country];
  const driver = drivers.data?.find((item) => item.id === record.driverId);
  const dops = driver ? driverOps(store.value, { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status }) : null;
  const docs = carDocs(profile, dops ? { vehicle_insurance: dops.documents.vehicle_insurance, vehicle_registration: dops.documents.vehicle_registration } : {}, now, countryRules.warnDays);
  const photos = photosOf(rules, record.id);
  const car = { year: profile.year, seats: profile.seats, fuel: profile.fuel, category: profile.category };
  const fitsList = fits(car, countryRules);
  const list = checks(car, docs, photos, countryRules, profile.category);
  const earnings = carEarnings(trips.data ?? [], record.driverId);
  const hold = shouldHold(docs, countryRules) && record.status !== "on_hold";
  const money = (minor: number) => formatMoney(minor, country);
  const canEdit = Boolean(agent && can(agent.role, "vehicles.edit"));

  return (
    <div className="dx-page vh-page">
      <header className="dx-head">
        <button data-command="admin.vehicle.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/vehicles"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <div className="dx-head-text">
          <h2>{record.plate ?? record.id}</h2>
          <p>
            {record.id} · {record.make ?? "Vehicle"} {record.model ?? ""} · {record.status} · zone {record.zoneId}.
            {record.driverId ? ` Driver ${record.driverId}.` : " Unassigned."}
          </p>
        </div>
        <Link className="dash-btn small ghost" to="/vehicles">Back to vehicles</Link>
      </header>

      <p className="state-line">{notice} {store.message}</p>
      {hold ? <p className="vh-warn"><AlertTriangle size={14} aria-hidden="true" /> Insurance or inspection has expired. Vehicle rules say this car should be on hold.</p> : null}

      <section className="vh-hero" aria-label="Car">
        <span className="vh-car-icon" aria-hidden="true"><CarFront size={30} /></span>
        <span className="vh-hero-text">
          <b>{record.make ?? "Vehicle"} {record.model ?? ""} · {profile.year}</b>
          <small>{profile.seats} seats · {profile.fuel} · {profile.fleetId || record.fleetId ? `Fleet ${profile.fleetId || record.fleetId}` : "Independent"}</small>
          <span>Driver {driver ? <Link to={`/drivers/${driver.id}`}>{driver.name}</Link> : "not linked"}</span>
        </span>
        <span className="vh-fits" aria-label="Categories it fits">
          {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((id) => <span key={id} className={fitsList.includes(id) ? "on" : undefined} title={fitsList.includes(id) ? "Fits" : "Does not fit"}>{CATEGORY_LABELS[id]}</span>)}
        </span>
      </section>

      <div className="vh-grid">
        <section className="vh-section" aria-label="Checks">
          <h3><ListChecks size={16} aria-hidden="true" /> Can it drive?</h3>
          <ul className="vh-checks">
            {list.map((item) => <li key={item.label} className={item.ok ? "ok" : "bad"}>{item.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}<b>{item.label}</b><small>{item.detail}</small></li>)}
          </ul>
        </section>
        <section className="vh-section" aria-label="Papers">
          <h3><FileText size={16} aria-hidden="true" /> Papers</h3>
          <ul className="vh-docs">
            {docs.map((doc) => <li key={doc.id}><span><b>{doc.label}</b>{doc.expiresAt ? <small>Until {doc.expiresAt}</small> : null}</span><HealthPill health={doc.health}>{doc.text}</HealthPill></li>)}
          </ul>
          <p className="vh-help">Warnings start {countryRules.warnDays} days before papers expire.</p>
        </section>
        <section className="vh-section" aria-label="Trips and earnings">
          <h3><Banknote size={16} aria-hidden="true" /> Trips and earnings</h3>
          <dl className="vh-facts">
            <div><dt>Trips</dt><dd>{earnings.trips}</dd></div>
            <div><dt>Completed</dt><dd>{earnings.completed}</dd></div>
            <div><dt>Riders paid</dt><dd>{money(earnings.grossMinor)}</dd></div>
          </dl>
          {earnings.lastTripId ? <Link className="vh-help" to={`/trips/${earnings.lastTripId}`}>Latest trip {earnings.lastTripId}</Link> : <p className="vh-help">No trips with this car yet.</p>}
        </section>
      </div>

      <section className="vh-section" aria-label="Photos">
        <h3><Camera size={16} aria-hidden="true" /> Photos</h3>
        <div className="vh-photos">
          {PHOTO_SIDES.map((side) => {
            const photo = photos[side.id];
            return (
              <div key={side.id} className={`vh-photo ${photo.status}`}>
                <span className="vh-photo-img" aria-hidden="true"><Camera size={22} /></span>
                <b>{side.label}</b>
                <small>{photo.status === "approved" ? `Approved${photo.by ? ` by ${photo.by}` : ""}` : photo.status === "rejected" ? `Rejected: ${photo.note || "no reason"}` : "Waiting review"}</small>
                <span className="vh-photo-actions">
                  <CommandButton command="admin.vehicle.photo" className="dash-btn small ghost" targetId={record.id} scope={record.zoneId} confirmTarget={false} before={photo.status} after="approved" sliceKey={VEHICLE_RULES_KEY} value={setPhoto(rules, record.id, side.id, "approved", agent?.id ?? "", new Date().toISOString(), "")} expectedSliceRev={rules.draftRev} disabled={!canEdit || photo.status === "approved"} aria-label={`Approve ${side.label}`} onDone={() => setNotice(`${side.label} approved.`)}>Approve</CommandButton>
                  <CommandButton command="admin.vehicle.photo" className="dash-btn small danger-ghost" targetId={record.id} scope={record.zoneId} confirmTarget={false} before={photo.status} after="rejected" sliceKey={VEHICLE_RULES_KEY} value={setPhoto(rules, record.id, side.id, "rejected", agent?.id ?? "", new Date().toISOString(), note || "Upload a clearer photo")} expectedSliceRev={rules.draftRev} disabled={!canEdit || photo.status === "rejected"} aria-label={`Reject ${side.label}`} onDone={() => setNotice(`${side.label} rejected. The driver is asked for a new photo.`)}>Reject</CommandButton>
                </span>
              </div>
            );
          })}
        </div>
        <p className="vh-help">The reason for a rejection is the private fleet note below, or "Upload a clearer photo".</p>
      </section>

      <article className="panel vh-panel">
        <h3>Compliance and eligibility</h3>
        <div className="field-grid">
          <label>
            Year
            <input type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label>
            Seats
            <input type="number" value={seats} onChange={(event) => setSeats(event.target.value)} />
          </label>
          <label>
            Fuel
            <select value={fuel} onChange={(event) => setFuel(event.target.value as Vehicle["fuel"])}>
              <option value="petrol">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="electric">Electric</option>
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as Vehicle["category"])}>
              <option value="economy">Movera</option>
              <option value="comfort">Comfort</option>
              <option value="premium">Premium</option>
              <option value="priority">Priority</option>
              <option value="xl">Movera XL</option>
              <option value="electric">Electric</option>
              <option value="pet">Pet</option>
            </select>
          </label>
          <label>
            Fleet partner
            <select value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
              <option value="">Independent</option>
              {(fleets.data ?? []).map((fleet) => (
                <option key={fleet.id} value={fleet.id}>{fleet.id} · {fleet.name}</option>
              ))}
            </select>
          </label>
          <label>
            Inspection expires
            <input type="date" value={inspectionExpiresAt} onChange={(event) => setInspectionExpiresAt(event.target.value)} />
          </label>
          <label>
            Insurance expires
            <input type="date" value={insuranceExpiresAt} onChange={(event) => setInsuranceExpiresAt(event.target.value)} />
          </label>
          <label>
            Private fleet note
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        <p className="state-line">
          Rule check: {ruleIssue ?? "passed"}. Registration: {profile.registrationStatus}. Saving this form will set the simulated vehicle state to {savedStatus}.
        </p>
        <CommandButton
          command="admin.vehicle.update"
          className="primary-btn"
          type="button"
          targetId={record.id}
          confirmTarget={false}
          entityState={record.status}
          scope={record.zoneId}
          before={`${profile.year}/${profile.category}/${record.status}`}
          after={`${nextProfile.year}/${nextProfile.category}/${savedStatus}`}
          collection="vehicles"
          patch={{ status: savedStatus, fleetId: fleetId || null }}
          expectedSliceRev={store.value.draftRev}
          sliceKey="driverOps"
          value={nextBook}
          onDone={() => setNotice("Vehicle compliance profile saved.")}
        >
          Save vehicle compliance
        </CommandButton>
      </article>

      <article className="panel vh-panel">
        <h3>Registration review</h3>
        <p>Current state: {profile.registrationStatus}.</p>
        <div className="actions">
          {(["approved", "rejected", "in_review"] as const).map((status) => {
            const book = updateVehicleOps(store.value, record, { registrationStatus: status });
            const updated = vehicleOps(book, record);
            const issue = vehicleBlock({ year: updated.year, seats: updated.seats, fuel: updated.fuel, category: updated.category });
            const collectionStatus = status === "approved" && !issue && record.status !== "on_hold" ? "eligible" : record.status === "on_hold" ? "on_hold" : "ineligible";
            return (
              <CommandButton
                command="admin.vehicle.reviewRegistration"
                key={status}
                className="secondary-btn"
                type="button"
                targetId={record.id}
                confirmTarget={false}
                scope={record.zoneId}
                before={profile.registrationStatus}
                after={status}
                collection="vehicles"
                patch={{ status: collectionStatus }}
                expectedSliceRev={store.value.draftRev}
                sliceKey="driverOps"
                value={book}
                onDone={() => setNotice(`Registration marked ${status}.`)}
              >
                {status}
              </CommandButton>
            );
          })}
        </div>
      </article>

      <article className="panel vh-panel">
        <h3>Driver assignment</h3>
        <label>
          Linked driver
          <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <option value="">Unassigned</option>
            {driverOptions.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.id} · {driver.name}</option>
            ))}
          </select>
        </label>
        <CommandButton
          command="admin.vehicle.link"
          className="secondary-btn"
          type="button"
          targetId={record.id}
          confirmTarget={false}
          scope={record.zoneId}
          before={record.driverId ?? "unassigned"}
          after={driverId || "unassigned"}
          collection="vehicles"
          patch={{ driverId: driverId || null, name: selectedDriver?.name ?? record.name }}
          onDone={() => setNotice(driverId ? `Vehicle linked to ${driverId}.` : "Vehicle unassigned.")}
        >
          Save driver assignment
        </CommandButton>
      </article>

      <article className="panel vh-panel">
        <h3>Service state</h3>
        <div className="actions">
          <CommandButton
            command="admin.vehicle.hold"
            className="secondary-btn"
            type="button"
            targetId={record.id}
            entityState={record.status}
            scope={record.zoneId}
            before={record.status}
            after="on_hold"
            collection="vehicles"
            patch={{ status: "on_hold" }}
            disabled={record.status === "on_hold"}
            onDone={() => setNotice("Vehicle placed on hold.")}
          >
            Put on hold
          </CommandButton>
          <CommandButton
            command="admin.vehicle.activate"
            className="primary-btn"
            type="button"
            targetId={record.id}
            entityState={record.status}
            scope={record.zoneId}
            before={record.status}
            after="eligible"
            collection="vehicles"
            patch={{ status: "eligible" }}
            disabled={Boolean(ruleIssue) || profile.registrationStatus !== "approved" || record.status === "eligible"}
            title={ruleIssue ?? (profile.registrationStatus !== "approved" ? "Registration must be approved." : undefined)}
            onDone={() => setNotice("Vehicle returned to service.")}
          >
            Return to service
          </CommandButton>
        </div>
      </article>
    </div>
  );
}
