import { useEffect, useMemo, useState } from "react";
import { LiveListBar } from "../live/LiveListBar";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlarmClock, ArrowLeft, BellRing, Car, CheckCircle2, ClipboardCheck, FileText, Landmark, Send, Settings2, UserPlus } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { useRecords, useSlice } from "../api/hooks";
import {
  DRIVER_DOCUMENTS,
  vehicleBlock,
  type DocId,
  type DocStatus,
} from "../drivers/gate";
import {
  approveRequiredDocuments,
  driverActivationIssue,
  driverOps,
  emptyDriverOpsBook,
  requestDriverInfo,
  reviewDriverDocument,
  setAccountReason,
  setBankReview,
  vehicleOps,
  type DriverOpsBook,
} from "../drivers/ops";
import {
  ONBOARDING_KEY,
  STEPS,
  firstWarningDays,
  countryActivationIssue,
  demoLeads,
  docProgress,
  driverMessage,
  emptyOnboardingRules,
  funnel,
  neededDocs,
  normalizeOnboardingRules,
  remind,
  reminderDue,
  stepOf,
  timing,
  type Applicant,
  type OnboardingRules,
  type StepId,
} from "../drivers/onboarding";
import { OnboardingSettings } from "../drivers/OnboardingSettings";
import { docHealth, docLabel } from "../fleet/documents";
import { HealthPill } from "../fleet/ui";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { CommandButton } from "../ui/CommandButton";
import { DataTable } from "../ui/DataTable";

const REVIEW: { status: DocStatus; label: string }[] = [
  { status: "approved", label: "Approve" },
  { status: "rejected", label: "Reject" },
  { status: "in_review", label: "Back to review" },
];

export function OnboardingPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = useMarketScope();
  const country = scope.market.id;
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const rulesSlice = useSlice<OnboardingRules>(ONBOARDING_KEY, emptyOnboardingRules());
  const rules = normalizeOnboardingRules(rulesSlice.value);
  const countryRules = rules.countries[country];
  const [selectedId, setSelectedId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("Application is pending. Review the required documents, bank details and linked vehicle before activation.");

  const queue = useMemo(
    () => (drivers.data ?? [])
      .filter((driver) => {
        if (agent?.scope.fleetPartnerId && driver.fleetId !== agent.scope.fleetPartnerId) return false;
        return driver.status === "pending" || driver.status === "on_hold";
      })
      .sort((left, right) => Number(Boolean(left.fleetId)) - Number(Boolean(right.fleetId)) || left.id.localeCompare(right.id)),
    [agent?.scope.fleetPartnerId, drivers.data],
  );

  const applicants: Applicant[] = useMemo(() => {
    const cars = vehicles.data ?? [];
    const real = queue.map((driver) => {
      const ops = driverOps(store.value, { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status });
      const carRecord = cars.find((vehicle) => vehicle.driverId === driver.id) ?? null;
      const car = carRecord ? vehicleOps(store.value, carRecord) : null;
      const carOk = Boolean(car && car.status === "eligible" && car.registrationStatus === "approved" && !vehicleBlock({ year: car.year, seats: car.seats, fuel: car.fuel, category: car.category }));
      return { id: driver.id, name: driver.name, zoneId: driver.zoneId, fleet: Boolean(driver.fleetId), status: driver.status, docs: ops.documents, bankOk: ops.bank.status === "approved", carOk };
    });
    return agent?.scope.fleetPartnerId ? real : [...demoLeads(country, scope.market.zones.map((zone) => zone.id)), ...real];
  }, [queue, vehicles.data, store.value, country, scope.market.zones, agent?.scope.fleetPartnerId]);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId("");
      return;
    }
    if (!queue.some((driver) => driver.id === selectedId) && !selectedId.startsWith("L-")) setSelectedId(queue[0]?.id ?? "");
  }, [queue, selectedId]);

  const set = (patch: Record<string, string | null>) => setParams(() => {
    const next = new URLSearchParams(globalThis.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    return next;
  }, { replace: true });

  if (drivers.isLoading || vehicles.isLoading || store.loading) return <p className="state-line">Loading onboarding queue.</p>;
  if (drivers.isError || vehicles.isError) {
    return (
      <>
        <h2>Onboarding queue</h2>
        <LiveListBar list="drivers" />
        <p className="state-line">The onboarding records could not be loaded.</p>
      </>
    );
  }

  const header = (
    <header className="dx-head">
      <button data-command="admin.onboarding.view" type="button" className="dash-btn ghost dx-back" onClick={() => (params.get("view") ? set({ view: null }) : globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
      <div className="dx-head-text">
        <h2>{params.get("view") === "steps" ? `Onboarding steps for ${scope.market.name}` : "Onboarding queue"}</h2>
        <p>
          {params.get("view") === "steps"
            ? "The steps new drivers go through, the papers they need, how long each step may take and the reminders they get."
            : `${queue.length} applications in this scope. Eleven document types are supported. Fleet partners are exempt from company registration. Activation also checks bank review and vehicle eligibility.`}
        </p>
      </div>
      {!params.get("view") ? <button data-command="admin.onboarding.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "steps" })}><Settings2 size={14} aria-hidden="true" /> Steps and papers</button> : null}
    </header>
  );

  if (params.get("view") === "steps") {
    return (
      <div className="dx-page vh-page">
        {header}
        <OnboardingSettings rules={rules} country={country} editable={Boolean(agent && can(agent.role, "drivers.activate"))} />
      </div>
    );
  }

  const steps = STEPS.filter((step) => countryRules.steps.find((row) => row.id === step.id)?.on !== false);
  const placed = applicants.map((applicant) => {
    const step = stepOf(applicant, countryRules);
    return { applicant, step, time: timing(applicant, step, countryRules), progress: docProgress(applicant, countryRules), due: reminderDue(applicant, step, rules, country, now) };
  });
  const flow = funnel(applicants, 6, countryRules);
  const lead = selectedId.startsWith("L-") ? placed.find((row) => row.applicant.id === selectedId) : null;
  const driver = queue.find((item) => item.id === selectedId) ?? (lead ? undefined : queue[0]);

  return (
    <div className="dx-page vh-page">
      {header}

      <Cards
        compare={false}
        compareLabel=""
        fmt={(value, format) => (format === "pct" ? `${value}%` : String(value))}
        cards={[
          { id: "all", label: "Applicants", value: placed.length, previous: null, format: "count", info: "Sign-ups and applications not active yet." },
          { id: "ready", label: "All approved", value: placed.filter((row) => row.step === "ready").length, previous: null, format: "count", info: "Everything approved. Waiting for an admin to press Activate." },
          { id: "late", label: "Late in their step", value: placed.filter((row) => row.time.late).length, previous: null, format: "count", info: "Longer in the step than the limit set in Steps and papers.", goodDown: true },
          { id: "stuck", label: "Stuck", value: placed.filter((row) => row.time.stuck).length, previous: null, format: "count", info: `In the same step for ${countryRules.stuckAfterDays} days or more.`, goodDown: true },
          { id: "finish", label: "Finish, 30 days", value: flow.at(-1)?.pct ?? 0, previous: null, format: "pct", info: "Of everyone who signed up in the last 30 days, the share who got to the last step. Demo history." },
        ]}
      />

      <section className="ob-funnel" aria-label="Where applicants drop off">
        {flow.map((row, index) => (
          <div key={row.step} className="ob-funnel-step">
            <span className="ob-funnel-bar"><i style={{ width: `${Math.max(row.pct, 4)}%` }} /></span>
            <b>{row.label}</b>
            <small>{row.reached} reached · {row.pct}%{index > 0 ? ` · ${flow[index - 1].reached - row.reached} dropped` : ""}</small>
          </div>
        ))}
      </section>

      <section className="ob-board" aria-label="Board">
        {steps.map((step) => {
          const cards = placed.filter((row) => row.step === step.id);
          return (
            <div key={step.id} className={`ob-column ${step.id}`} aria-label={step.label} role="group">
              <header><b>{step.label}</b><span className="dx-count">{cards.length}</span></header>
              <small className="vh-help">{step.help} Limit {countryRules.steps.find((row) => row.id === step.id)?.days} days.</small>
              {cards.slice(0, open[step.id] ? cards.length : 6).map((row) => (
                <button key={row.applicant.id} data-command="admin.onboarding.view" type="button" className={`ob-card${(driver?.id ?? lead?.applicant.id) === row.applicant.id ? " active" : ""}${row.time.stuck ? " stuck" : row.time.late ? " late" : ""}`} onClick={() => setSelectedId(row.applicant.id)}>
                  <b>{row.applicant.name}</b>
                  <small>{scope.market.zones.find((zone) => zone.id === row.applicant.zoneId)?.name ?? row.applicant.zoneId}{row.applicant.fleet ? " · Fleet" : ""}{row.applicant.lead ? " · new sign-up" : ""}</small>
                  <span className="ob-card-meta">
                    <span><FileText size={11} aria-hidden="true" /> {row.progress.done}/{row.progress.total}</span>
                    <span className={row.time.late ? "late" : undefined}><AlarmClock size={11} aria-hidden="true" /> {row.time.days} d</span>
                    {row.time.stuck ? <span className="tag stuck">Stuck</span> : row.time.late ? <span className="tag late">Late</span> : null}
                    {row.due ? <span className="tag due">Remind</span> : null}
                  </span>
                </button>
              ))}
              {cards.length > 6 ? <button data-command="admin.onboarding.view" type="button" className="dash-btn small ghost" onClick={() => setOpen({ ...open, [step.id]: !open[step.id] })}>{open[step.id] ? "Show fewer" : `Show all ${cards.length}`}</button> : null}
              {!cards.length ? <p className="vh-help">Nobody here.</p> : null}
            </div>
          );
        })}
      </section>

      <p className="state-line">
        {notice} {store.message}
      </p>

      {lead ? (
        <article className="vh-section ob-lead" aria-label={lead.applicant.name}>
          <h3><UserPlus size={16} aria-hidden="true" /> {lead.applicant.name}</h3>
          <p className="vh-help">Signed up {lead.time.days} days ago and has not uploaded anything yet. Demo sign-up until the driver app sends them.</p>
          <CommandButton command="admin.onboarding.remind" className="dash-btn small" sliceKey={ONBOARDING_KEY} value={remind(rules, lead.applicant.id, lead.step, agent?.id ?? "", new Date().toISOString())} expectedSliceRev={rules.draftRev} targetId={lead.applicant.id} confirmTarget={false} before="" after="reminder sent" disabled={!countryRules.reminders} title={countryRules.reminders ? undefined : "Reminders are off in Steps and papers."} onDone={() => setNotice(`Reminder sent to ${lead.applicant.name}.`)}><Send size={13} aria-hidden="true" /> Send a reminder</CommandButton>
        </article>
      ) : null}

      {driver ? <ApplicantView key={driver.id} driver={driver} rules={rules} country={country} now={now} reviewNote={reviewNote} setReviewNote={setReviewNote} setNotice={setNotice} vehicles={vehicles.data ?? []} store={store.value} placed={placed.find((row) => row.applicant.id === driver.id)} /> : !lead ? (
        <p className="dx-calm">No pending or on-hold applications are in your active scope.</p>
      ) : null}

      <section className="vh-section" aria-label="All applicants">
        <h3><ClipboardCheck size={16} aria-hidden="true" /> All applications</h3>
        <LiveListBar list="drivers" />
        <DataTable
          head={["Driver", "Name", "Fleet", "Status", "Step", "Zone", "Vehicle"]}
          rows={queue.map((item) => {
            const linked = (vehicles.data ?? []).find((vehicle) => vehicle.driverId === item.id);
            const row = placed.find((entry) => entry.applicant.id === item.id);
            return [
              item.id,
              item.name,
              item.fleetId ?? "Independent",
              item.status,
              STEPS.find((step) => step.id === row?.step)?.label ?? "–",
              item.zoneId,
              linked?.plate ?? "No linked vehicle",
            ];
          })}
          onRow={(index) => {
            const id = queue[index]?.id;
            if (id) setSelectedId(id);
          }}
        />
      </section>
    </div>
  );
}

type ApplicantProps = {
  driver: NonNullable<ReturnType<typeof useRecords>["data"]>[number];
  rules: OnboardingRules;
  country: "SE" | "FR" | "TN";
  now: number;
  reviewNote: string;
  setReviewNote: (value: string) => void;
  setNotice: (value: string) => void;
  vehicles: NonNullable<ReturnType<typeof useRecords>["data"]>;
  store: DriverOpsBook;
  placed?: { applicant: Applicant; step: StepId; time: { days: number; limit: number; late: boolean; stuck: boolean }; due: boolean };
};

function ApplicantView({ driver, rules, country, now, reviewNote, setReviewNote, setNotice, vehicles, store, placed }: ApplicantProps) {
  const { agent } = useSession();
  const countryRules = rules.countries[country];
  const driverSeed = { id: driver.id, name: driver.name, fleetId: driver.fleetId, status: driver.status };
  const ops = driverOps(store, driverSeed);
  const carRecord = vehicles.find((vehicle) => vehicle.driverId === driver.id) ?? null;
  const car = carRecord ? vehicleOps(store, carRecord) : null;
  const base = driverActivationIssue(store, driverSeed, car);
  const applicant = placed?.applicant;
  const activationIssue = applicant ? countryActivationIssue(applicant, countryRules, base && !base.startsWith("Still needed") ? base : null) : base;
  const required = new Set<DocId>([...neededDocs(countryRules, Boolean(driver.fleetId)), ...countryRules.docs.filter((id) => id === "terms" || id === "virtual_session")]);
  const [preview, setPreview] = useState<{ doc: DocId; action: "rejected" | "needed"; note: string } | null>(null);
  return (
    <article className="vh-section ob-applicant" aria-label={`Application of ${driver.name}`}>
      <header className="ob-applicant-head">
        <span>
          <h3>{driver.name}</h3>
          <p className="state-line">
            {driver.id} · {driver.status} · {driver.zoneId} · {driver.fleetId ? `Fleet ${driver.fleetId}` : "Independent"}.
            {activationIssue ? ` Activation blocked: ${activationIssue}` : " Ready for activation."}
          </p>
        </span>
        {placed ? <span className={placed.time.late ? "ob-step late" : "ob-step"}>{STEPS.find((step) => step.id === placed.step)?.label} · {placed.time.days} of {placed.time.limit} days</span> : null}
        <Link className="dash-btn small ghost" to={`/drivers/${driver.id}`}>Open driver</Link>
      </header>

      <label className="ob-note">
        <span>Review note / request details</span>
        <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Reason or information requested" />
      </label>
      {preview ? (
        <p className="ob-message" aria-label="Message to the driver"><Send size={13} aria-hidden="true" /> {driverMessage(driver.name, docLabel(preview.doc), preview.action, preview.note)}</p>
      ) : <p className="vh-help">When you reject a paper or ask for more, the driver gets a message in the app with your note.</p>}

      <ul className="ob-docs" aria-label="Documents">
        {DRIVER_DOCUMENTS.map((id) => {
          const review = ops.documents[id];
          const needed = required.has(id);
          const health = docHealth(review, now, firstWarningDays(rules, country));
          return (
            <li key={id} className={needed ? undefined : "off"}>
              <span className="ob-doc-name"><b>{docLabel(id)}</b><small>{id.replaceAll("_", " ")} · {needed ? "Required" : driver.fleetId && id === "company_registration" ? "Fleet exempt" : `Not needed in ${country}`}</small></span>
              <span className="ob-doc-file"><small>{review.fileType} · {review.fileName}</small><small>{review.expiresAt || "No expiry"}</small></span>
              <HealthPill health={health.health}>{health.label}</HealthPill>
              {needed ? (
                <span className="ob-doc-actions">
                  {REVIEW.map((choice) => (
                    <CommandButton
                      command="admin.driver.review"
                      key={choice.status}
                      className={choice.status === "rejected" ? "dash-btn small danger-ghost" : "dash-btn small ghost"}
                      type="button"
                      targetId={driver.id}
                      confirmTarget={false}
                      scope={driver.zoneId}
                      before={review.status}
                      after={choice.status}
                      expectedSliceRev={store.draftRev}
                      sliceKey="driverOps"
                      value={reviewDriverDocument(store, driverSeed, id, choice.status, agent?.id ?? "", reviewNote)}
                      disabled={review.status === choice.status}
                      aria-label={`${choice.label} ${docLabel(id)}`}
                      onDone={() => {
                        setNotice(`${id.replaceAll("_", " ")} marked ${choice.status}.`);
                        if (choice.status === "rejected") setPreview({ doc: id, action: "rejected", note: reviewNote });
                        setReviewNote("");
                      }}
                    >
                      {choice.label}
                    </CommandButton>
                  ))}
                  <CommandButton
                    command="admin.driver.requestInfo"
                    className="dash-btn small ghost"
                    type="button"
                    targetId={driver.id}
                    confirmTarget={false}
                    scope={driver.zoneId}
                    before={review.status}
                    after="needed"
                    expectedSliceRev={store.draftRev}
                    sliceKey="driverOps"
                    value={requestDriverInfo(store, driverSeed, id as DocId, agent?.id ?? "", reviewNote)}
                    aria-label={`Ask for more about ${docLabel(id)}`}
                    onDone={() => {
                      setNotice(`More information requested for ${id.replaceAll("_", " ")}.`);
                      setPreview({ doc: id, action: "needed", note: reviewNote });
                      setReviewNote("");
                    }}
                  >
                    Ask for more
                  </CommandButton>
                </span>
              ) : <span className="vh-help">Not required</span>}
            </li>
          );
        })}
      </ul>

      <div className="ob-actions-row">
        <CommandButton
          command="admin.driver.approveAll"
          className="dash-btn small"
          type="button"
          targetId={driver.id}
          confirmTarget={false}
          scope={driver.zoneId}
          before="required documents"
          after="approved"
          expectedSliceRev={store.draftRev}
          sliceKey="driverOps"
          value={approveRequiredDocuments(store, driverSeed, agent?.id ?? "")}
          onDone={() => setNotice("Documents approved.")}
        >
          <CheckCircle2 size={13} aria-hidden="true" /> Approve remaining
        </CommandButton>
      </div>

      <div className="ob-checks">
        <section className="ob-check" aria-label="Bank verification">
          <h4><Landmark size={14} aria-hidden="true" /> Bank verification</h4>
          <p>Holder {ops.bank.holder}. Account •••• {ops.bank.last4}. Status {ops.bank.status}.{ops.bank.note ? ` Note: ${ops.bank.note}` : ""}</p>
          <div className="ob-inline">
            {(["approved", "rejected", "in_review"] as const).map((status) => (
              <CommandButton command="admin.driver.bankReview" key={status} className="dash-btn small ghost" type="button" targetId={driver.id} confirmTarget={false} scope={driver.zoneId} before={ops.bank.status} after={status} expectedSliceRev={store.draftRev} sliceKey="driverOps" value={setBankReview(store, driverSeed, status, agent?.id ?? "", reviewNote)} onDone={() => setNotice(`Bank details marked ${status}.`)}>
                Bank {status}
              </CommandButton>
            ))}
          </div>
        </section>
        <section className="ob-check" aria-label="Linked vehicle">
          <h4><Car size={14} aria-hidden="true" /> Linked vehicle</h4>
          {carRecord && car ? (
            <>
              <p>{carRecord.plate} · {carRecord.make ?? "Vehicle"} {carRecord.model ?? ""} · {car.year} · {car.category} · {car.fuel} · {car.seats} seats · {car.status}.</p>
              <p className="vh-help">
                Inspection expires {car.inspectionExpiresAt}. Insurance expires {car.insuranceExpiresAt}. Registration {car.registrationStatus}.
                {vehicleBlock({ year: car.year, seats: car.seats, fuel: car.fuel, category: car.category }) ?? " Vehicle rule check passed."}
              </p>
              <Link className="vh-help" to={`/vehicles/${carRecord.id}`}>Open the vehicle</Link>
            </>
          ) : <p className="state-line">No vehicle linked. Activation is blocked.</p>}
        </section>
        <section className="ob-check decision" aria-label="Account decision">
          <h4><BellRing size={14} aria-hidden="true" /> Account decision</h4>
          <div className="ob-inline">
            <CommandButton command="admin.driver.activate" className="dash-btn small" type="button" targetId={driver.id} confirmTarget={false} entityState={driver.status} scope={driver.zoneId} before={driver.status} after="active" collection="drivers" patch={{ status: "active" }} expectedSliceRev={store.draftRev} sliceKey="driverOps" value={setAccountReason(store, driverSeed, "active", "Onboarding approved", agent?.id ?? "")} disabled={Boolean(activationIssue)} title={activationIssue ?? undefined} onDone={() => setNotice("Driver is active. New offers can be sent.")}>
              Activate
            </CommandButton>
            <CommandButton command="admin.driver.onHold" className="dash-btn small ghost" type="button" targetId={driver.id} entityState={driver.status} scope={driver.zoneId} before={driver.status} after="on_hold" collection="drivers" patch={{ status: "on_hold" }} expectedSliceRev={store.draftRev} sliceKey="driverOps" value={setAccountReason(store, driverSeed, "on_hold", reviewNote || "Onboarding review hold", agent?.id ?? "")} onDone={() => setNotice("Driver placed on hold.")}>
              Put on hold
            </CommandButton>
            {placed?.due ? (
              <CommandButton command="admin.onboarding.remind" className="dash-btn small ghost" sliceKey={ONBOARDING_KEY} value={remind(rules, driver.id, placed.step, agent?.id ?? "", new Date().toISOString())} expectedSliceRev={rules.draftRev} targetId={driver.id} confirmTarget={false} before="" after="reminder sent" onDone={() => setNotice(`Reminder sent to ${driver.name}.`)}><Send size={13} aria-hidden="true" /> Send a reminder</CommandButton>
            ) : null}
          </div>
        </section>
      </div>
    </article>
  );
}
