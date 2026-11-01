import { isLiveData } from "../live/realData";
import { ruleProblemText } from "../live/format";
import { LiveVehicleDocuments } from "../live/LiveVehicleDocuments";
import { ONBOARDING_SETTINGS_KEY, emptySettingsBook, normalizeSettingsBook } from "../drivers/onboardingSettings";
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
import { CATEGORY_LABELS, PHOTO_SIDES, fuelLabel, VEHICLE_RULES_KEY, carDocs, carEarnings, checks, countryOfZone, effectiveVehicleRules, emptyVehicleRules, fits, liveCarDocs, photosOf, setPhoto, shouldHold, type VehicleRules } from "../vehicles/rules";
import { CommandButton } from "../ui/CommandButton";
import { tr, trn, trSentences, trx } from "../i18n";
import { categoryName } from "../riders/profile";
import { zoneById } from "../markets/markets";
import { statusLabel } from "../domain/labels";
import { approvalBlock, approvalChoices, initialApprovalPick, liveCarState, liveCarStateLabel } from "../vehicles/liveState";

export function VehicleDetailPage() {
  const { id = "" } = useParams();
  const { agent } = useSession();
  const vehicles = useRecords("vehicles", null);
  const drivers = useRecords("drivers", null);
  const fleets = useRecords("fleets", null);
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const rulesSlice = useSlice<VehicleRules>(VEHICLE_RULES_KEY, emptyVehicleRules());
  const settingsSlice = useSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook());
  // Live: the published onboarding config only (owner G2 R2/R10), never the browser's demo slice.
  const rules = effectiveVehicleRules(rulesSlice.value, normalizeSettingsBook(settingsSlice.value), isLiveData());
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
  // v0.18.5 (owner G2-D5.3): the categories the admin gives on approval (null = the car's own that it still fits).
  const [picked, setPicked] = useState<string[] | null>(null);

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

  if (vehicles.isLoading || drivers.isLoading || fleets.isLoading || store.loading) return <p className="state-line">{tr("Loading vehicle.")}</p>;
  if (!record || !profile) {
    return <NotFoundRecord kind="Vehicle" id={id} list="/vehicles" back={tr("Back to vehicles")} />;
  }
  if (agent?.scope.fleetPartnerId && record.fleetId !== agent.scope.fleetPartnerId) {
    return (
      <div className="page-heading">
        <div>
          <h2>{tr("No access")}</h2>
          <p>{tr("This vehicle belongs to another fleet partner.")}</p>
          <Link to="/vehicles">{tr("Back to vehicles")}</Link>
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
  // Live (owner G2 R1): the server's car papers; the demo keeps its simulated ones.
  const docs = isLiveData() ? liveCarDocs(record.liveVehicleDocs?.documents, now, countryRules.warnDays) : carDocs(profile, dops ? { vehicle_insurance: dops.documents.vehicle_insurance, vehicle_registration: dops.documents.vehicle_registration } : {}, now, countryRules.warnDays);
  const photos = photosOf(rules, record.id);
  const car = { year: profile.year, seats: profile.seats, fuel: profile.fuel, category: profile.category };
  const fitsList = fits(car, countryRules);
  // v0.18.3 (owner G2 R2): the server's Vehicle.ruleProblems; while there are any the car cannot be approved.
  const ruleProblems = record.liveRuleProblems ?? [];
  // Live (owner G2c): the car's own categories from the server and its rule problems; no demo category or seeded photos.
  const liveCats = isLiveData() ? record.liveCategoryIds ?? [] : null;
  const list = liveCats
    ? [
        { label: tr("Car rules"), ok: ruleProblems.length === 0, detail: ruleProblems.length ? ruleProblems.map((item) => ruleProblemText(item)).join(" · ") : tr("{0}, {1} seats, {2}", [profile.year, profile.seats, fuelLabel(profile.fuel).toLowerCase()]) },
        ...docs.map((doc) => ({ label: doc.label, ok: doc.health === "valid" || doc.health === "expiring", detail: doc.text })),
      ]
    : checks(car, docs, photos, countryRules, profile.category);
  const fleetName = (fleetRef: string) => (fleets.data ?? []).find((item) => item.id === fleetRef)?.name ?? fleetRef;
  const zoneName = zoneById(record.zoneId)?.name ?? record.zoneId;
  const earnings = carEarnings(trips.data ?? [], record.driverId);
  // Live: the server takes cars off the road itself; no simulated hold warning.
  const hold = !isLiveData() && shouldHold(docs, countryRules) && record.status !== "on_hold";
  const money = (minor: number) => formatMoney(minor, country);
  const canEdit = Boolean(agent && can(agent.role, "vehicles.edit"));
  // v0.18.5 (owner G2-D5.4): the car's true state from the server; G2-D5.3: the categories the admin may give.
  const carState = liveCats ? liveCarState({ status: record.liveVehicleStatus ?? "pending", documents: record.liveVehicleDocs?.documents ?? [], requiredDocuments: record.liveVehicleDocs?.required ?? [] }) : null;
  const choices = approvalChoices(record.liveFitCategories);
  const pick = picked ?? initialApprovalPick(liveCats ?? [], record.liveFitCategories);
  const carTooOld = ruleProblems.some((item) => item.startsWith("car:"));
  const approveWhy = carTooOld ? ruleProblems.filter((item) => item.startsWith("car:")).map(ruleProblemText).join(", ") : approvalBlock(pick);
  const togglePick = (id: string, on: boolean) => setPicked(on ? [...new Set([...pick, id])] : pick.filter((item) => item !== id));

  return (
    <div className="dx-page vh-page">
      <header className="dx-head">
        <button data-command="admin.vehicle.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/vehicles"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
        <div className="dx-head-text">
          <h2>{record.plate ?? record.id}</h2>
          <p data-testid="vehicle-head-line">{trn("{0} {1} · {2} · {3}.{4}", record.make ?? tr("Vehicle"), record.model ?? "", carState ? liveCarStateLabel(carState) : statusLabel(record.status), zoneName || "—", record.driverId ? tr(" Driver {0}.", [driver?.name || "—"]) : tr(" Unassigned."))}</p>
        </div>
        <Link className="dash-btn small ghost" to="/vehicles">{tr("Back to vehicles")}</Link>
      </header>

      <p className="state-line">{trSentences(notice)} {trSentences(store.message ?? "")}</p>
      {hold ? <p className="vh-warn"><AlertTriangle size={14} aria-hidden="true" />{" "}{tr("Insurance or inspection has expired. Vehicle rules say this car should be on hold.")}</p> : null}

      {ruleProblems.length ? (
        <div className="fd-banner red vh-rule-problems" role="alert" data-testid="vehicle-rule-problems">
          <p><AlertTriangle size={16} aria-hidden="true" /> <strong>{tr("This car breaks the country's car rules and cannot be approved:")}</strong></p>
          <ul>{ruleProblems.map((item) => <li key={item}>{ruleProblemText(item)}</li>)}</ul>
        </div>
      ) : null}

      <section className="vh-hero" aria-label={tr("Car")}>
        <span className="vh-car-icon" aria-hidden="true"><CarFront size={30} /></span>
        <span className="vh-hero-text">
          <b>{record.make ?? tr("Vehicle")} {record.model ?? ""} · {profile.year}</b>
          <small>{trn("{0} seats · {1} · {2}", profile.seats, fuelLabel(profile.fuel).toLowerCase(), profile.fleetId || record.fleetId ? tr("Fleet {0}", [fleetName(profile.fleetId || record.fleetId || "")]) : tr("Independent"))}</small>
          <span>{trn("Driver {0}", driver ? <Link to={`/drivers/${driver.id}`}>{driver.name}</Link> : tr("not linked"))}</span>
        </span>
        {liveCats ? (
          // Live (G2-D5.3): the server's Vehicle.fitCategories, never the demo's own rule check.
          <span className="vh-fits" aria-label={tr("Categories it fits")} data-testid="vehicle-fits">
            {[...choices.rides, ...choices.extras].length ? [...choices.rides, ...choices.extras].map((id) => <span key={id} className="on" title={tr("Fits")}>{categoryName(id)}</span>) : <span>{tr("No category fits this car")}</span>}
          </span>
        ) : (
        <span className="vh-fits" aria-label={tr("Categories it fits")}>
          {(Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((id) => <span key={id} className={fitsList.includes(id) ? "on" : undefined} title={fitsList.includes(id) ? tr("Fits") : tr("Does not fit")}>{trx(CATEGORY_LABELS[id])}</span>)}
        </span>
        )}
      </section>

      <LiveVehicleDocuments record={record} />

      <div className="vh-grid">
        <section className="vh-section" aria-label={tr("Checks")}>
          <h3><ListChecks size={16} aria-hidden="true" />{" "}{tr("Can it drive?")}</h3>
          <ul className="vh-checks">
            {list.map((item) => <li key={item.label} className={item.ok ? "ok" : "bad"}>{item.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />}<b>{item.label}</b><small>{item.detail}</small></li>)}
          </ul>
        </section>
        <section className="vh-section" aria-label={tr("Papers")}>
          <h3><FileText size={16} aria-hidden="true" />{" "}{tr("Papers")}</h3>
          {isLiveData() ? (
            // Live (owner G2 R1): the end dates of the approved registration and insurance, else "—"; nothing invented.
            <ul className="vh-docs" data-testid="vehicle-end-dates">
              <li><span><b>{tr("Registration")}</b><small>{profile.inspectionExpiresAt ? trn("Until {0}", profile.inspectionExpiresAt) : "—"}</small></span></li>
              <li><span><b>{tr("Insurance")}</b><small>{profile.insuranceExpiresAt ? trn("Until {0}", profile.insuranceExpiresAt) : "—"}</small></span></li>
            </ul>
          ) : (
          <ul className="vh-docs">
            {docs.map((doc) => <li key={doc.id}><span><b>{doc.label}</b>{doc.expiresAt ? <small>{trn("Until {0}", doc.expiresAt)}</small> : null}</span><HealthPill health={doc.health}>{doc.text}</HealthPill></li>)}
          </ul>
          )}
          <p className="vh-help">{trn("Warnings start {0} days before papers expire.", countryRules.warnDays)}</p>
        </section>
        <section className="vh-section" aria-label={tr("Trips and earnings")}>
          <h3><Banknote size={16} aria-hidden="true" />{" "}{tr("Trips and earnings")}</h3>
          <dl className="vh-facts">
            <div><dt>{tr("Trips")}</dt><dd>{earnings.trips}</dd></div>
            <div><dt>{tr("Completed")}</dt><dd>{earnings.completed}</dd></div>
            <div><dt>{tr("Riders paid")}</dt><dd>{money(earnings.grossMinor)}</dd></div>
          </dl>
          {earnings.lastTripId ? <Link className="vh-help" to={`/trips/${earnings.lastTripId}`}>{trn("Latest trip {0}", earnings.lastTripId)}</Link> : <p className="vh-help">{tr("No trips with this car yet.")}</p>}
        </section>
      </div>

      {/* Live: the four photos are car documents (v0.17.0 vehicle_photo_*), reviewed in LiveVehicleDocuments above. */}
      {isLiveData() ? null : (
      <section className="vh-section" aria-label={tr("Photos")}>
          <h3><Camera size={16} aria-hidden="true" />{" "}{tr("Photos")}</h3>
          <div className="vh-photos">
            {PHOTO_SIDES.map((side) => {
              const photo = photos[side.id];
              return (
                <div key={side.id} className={`vh-photo ${photo.status}`}>
                  <span className="vh-photo-img" aria-hidden="true"><Camera size={22} /></span>
                  <b>{side.label}</b>
                  <small>{photo.status === "approved" ? tr("Approved{0}", [photo.by ? ` by ${photo.by}` : ""]) : photo.status === "rejected" ? tr("Rejected: {0}", [photo.note || "no reason"]) : tr("Waiting review")}</small>
                  <span className="vh-photo-actions">
                    <CommandButton command="admin.vehicle.photo" className="dash-btn small ghost" targetId={record.id} scope={record.zoneId} confirmTarget={false} before={photo.status} after="approved" sliceKey={VEHICLE_RULES_KEY} value={setPhoto(rules, record.id, side.id, "approved", agent?.id ?? "", new Date().toISOString(), "")} expectedSliceRev={rules.draftRev} disabled={!canEdit || photo.status === "approved"} aria-label={tr("Approve {0}", [side.label])} onDone={() => setNotice(tr("{0} approved.", [side.label]))}>{tr("Approve")}</CommandButton>
                    <CommandButton command="admin.vehicle.photo" className="dash-btn small danger-ghost" targetId={record.id} scope={record.zoneId} confirmTarget={false} before={photo.status} after="rejected" sliceKey={VEHICLE_RULES_KEY} value={setPhoto(rules, record.id, side.id, "rejected", agent?.id ?? "", new Date().toISOString(), note || "Upload a clearer photo")} expectedSliceRev={rules.draftRev} disabled={!canEdit || photo.status === "rejected"} aria-label={tr("Reject {0}", [side.label])} onDone={() => setNotice(tr("{0} rejected. The driver is asked for a new photo.", [side.label]))}>{tr("Reject")}</CommandButton>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="vh-help">{tr("The reason for a rejection is the private fleet note below, or \"Upload a clearer photo\".")}</p>
        </section>
      )}

      <article className="panel vh-panel">
        <h3>{tr("Compliance and eligibility")}</h3>
        <div className="field-grid">
          <label>{tr("Year")}<input type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label>{tr("Seats")}<input type="number" value={seats} onChange={(event) => setSeats(event.target.value)} />
          </label>
          <label>{tr("Fuel")}<select value={fuel} onChange={(event) => setFuel(event.target.value as Vehicle["fuel"])}>
              <option value="petrol">{tr("Petrol")}</option>
              <option value="diesel">{tr("Diesel")}</option>
              <option value="hybrid">{tr("Hybrid")}</option>
              <option value="electric">{tr("Electric")}</option>
            </select>
          </label>
          {liveCats ? (
          <label>{tr("Category")}<output className="vh-cats" data-testid="vehicle-categories">{record.liveVehicleStatus === "approved" ? liveCats.map((item) => categoryName(item)).join(", ") || "—" : tr("Given by the admin when the car is approved")}</output>
          </label>
          ) : (
          <label>{tr("Category")}<select value={category} onChange={(event) => setCategory(event.target.value as Vehicle["category"])}>
              <option value="economy">Movera</option>
              <option value="comfort">{tr("Comfort")}</option>
              <option value="premium">{tr("Premium")}</option>
              <option value="priority">{tr("Priority")}</option>
              <option value="xl">Movera XL</option>
              <option value="electric">{tr("Electric")}</option>
              <option value="pet">{tr("Pet")}</option>
            </select>
          </label>
          )}
          <label>{tr("Fleet partner")}<select value={fleetId} onChange={(event) => setFleetId(event.target.value)}>
              <option value="">{tr("Independent")}</option>
              {(fleets.data ?? []).map((fleet) => (
                <option key={fleet.id} value={fleet.id}>{fleet.name || fleet.id}</option>
              ))}
            </select>
          </label>
          {isLiveData() ? null : <>
          <label>{tr("Inspection expires")}<input type="date" value={inspectionExpiresAt} onChange={(event) => setInspectionExpiresAt(event.target.value)} />
          </label>
          <label>{tr("Insurance expires")}<input type="date" value={insuranceExpiresAt} onChange={(event) => setInsuranceExpiresAt(event.target.value)} />
          </label>
          </>}
          <label>{tr("Private fleet note")}<input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {isLiveData()
          ? <p className="state-line">{trn("Rule check: {0}.", ruleProblems.length ? ruleProblems.map(ruleProblemText).join(", ") : tr("passed"))}</p>
          : <p className="state-line">{trn("Rule check: {0}. Registration: {1}. Saving this form will set the simulated vehicle state to {2}.", ruleIssue ?? tr("passed"), profile.registrationStatus, savedStatus)}</p>}
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
          // Live: year, seats and (when set or changed) the fuel. v0.18.5 (owner G2-D5.3): never the categories here;
          // the admin gives them when approving, below.
          value={isLiveData() ? { year: nextProfile.year, seats: nextProfile.seats, ...(record.fuel || nextProfile.fuel !== profile.fuel ? { fuel: nextProfile.fuel } : {}) } : nextBook}
          onDone={() => setNotice(tr("Vehicle compliance profile saved."))}
        >{tr("Save vehicle compliance")}</CommandButton>
      </article>

      {/* Live: the registration is a car document, reviewed in LiveVehicleDocuments above. */}
      {isLiveData() ? null : (
      <article className="panel vh-panel">
        <h3>{tr("Registration review")}</h3>
        <p>{trn("Current state: {0}.", profile.registrationStatus)}</p>
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
                onDone={() => setNotice(tr("Registration marked {0}.", [statusLabel(status).toLowerCase()]))}
              >
                {status}
              </CommandButton>
            );
          })}
        </div>
      </article>
      )}

      <article className="panel vh-panel">
        <h3>{tr("Driver assignment")}</h3>
        <label>{tr("Linked driver")}<select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <option value="">{tr("Unassigned")}</option>
            {driverOptions.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name || driver.id}</option>
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
          value={isLiveData() ? { driverId: driverId || null } : undefined}
          onDone={() => setNotice(driverId ? tr("Vehicle linked to {0}.", [driverId]) : tr("Vehicle unassigned."))}
        >{tr("Save driver assignment")}</CommandButton>
      </article>

      {liveCats && carState ? (
      <article className="panel vh-panel" data-testid="vehicle-approval">
        <h3>{tr("Service state")}</h3>
        <p data-testid="vehicle-state"><strong>{liveCarStateLabel(carState)}</strong>{carState === "approved" ? <> · {tr("Categories: {0}", [liveCats.map(categoryName).join(", ") || "—"])}</> : null}</p>
        <fieldset className="vh-approve-cats" disabled={!canEdit}>
          <legend>{carState === "approved" ? tr("Categories of this car (only the ones it fits)") : tr("Give the categories when approving (only the ones it fits)")}</legend>
          {choices.rides.length + choices.extras.length === 0 ? <p className="vh-help" data-testid="no-fit-categories">{tr("No category fits this car: check its year, seats and fuel against Vehicle rules.")}</p> : null}
          {[...choices.rides, ...choices.extras].map((id) => (
            <label key={id} className="vh-approve-cat"><input type="checkbox" checked={pick.includes(id)} onChange={(event) => togglePick(id, event.target.checked)} /> {categoryName(id)}{choices.extras.includes(id) ? <small> · {tr("extra, only with a ride category")}</small> : null}</label>
          ))}
        </fieldset>
        {approveWhy ? <p className="vh-help" data-testid="approve-why">{approveWhy}</p> : null}
        <div className="actions">
          <CommandButton
            command="admin.vehicle.activate"
            className="primary-btn"
            type="button"
            targetId={record.id}
            entityState={record.status}
            scope={record.zoneId}
            before={`${record.liveVehicleStatus ?? record.status} ${liveCats.join(",")}`}
            after={`approved ${pick.join(",")}`}
            collection="vehicles"
            patch={{ status: "eligible" }}
            value={{ categoryIds: pick }}
            disabled={Boolean(approveWhy)}
            title={approveWhy ?? undefined}
            onDone={() => { setPicked(null); setNotice(tr("Car approved with {0}.", [pick.map(categoryName).join(", ")])); }}
          >{carState === "approved" ? tr("Save categories") : tr("Approve car")}</CommandButton>
          <CommandButton
            command="admin.vehicle.hold"
            className="secondary-btn"
            type="button"
            targetId={record.id}
            entityState={record.status}
            scope={record.zoneId}
            before={record.liveVehicleStatus ?? record.status}
            after="blocked"
            collection="vehicles"
            patch={{ status: "on_hold" }}
            disabled={carState === "blocked"}
            onDone={() => setNotice(tr("Vehicle placed on hold."))}
          >{tr("Put on hold")}</CommandButton>
        </div>
        <p className="vh-help">{tr("Putting a car on hold asks for a reason; the fleet owner sees it.")}</p>
      </article>
      ) : (
      <article className="panel vh-panel">
        <h3>{tr("Service state")}</h3>
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
            onDone={() => setNotice(tr("Vehicle placed on hold."))}
          >{tr("Put on hold")}</CommandButton>
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
            disabled={ruleProblems.length > 0 || Boolean(ruleIssue) || profile.registrationStatus !== "approved" || record.status === "eligible"}
            title={ruleProblems.length ? ruleProblems.map(ruleProblemText).join(", ") : ruleIssue ?? (profile.registrationStatus !== "approved" ? tr("Registration must be approved.") : undefined)}
            onDone={() => setNotice(tr("Vehicle returned to service."))}
          >{tr("Return to service")}</CommandButton>
        </div>
      </article>
      )}
    </div>
  );
}
