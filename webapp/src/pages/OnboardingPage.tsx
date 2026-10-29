import { useEffect, useMemo, useState } from "react";
import { LiveListBar } from "../live/LiveListBar";
import { LiveOnboarding } from "../live/LiveOnboarding";
import { isLiveData } from "../live/realData";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlarmClock, ArrowLeft, BellRing, Car, CheckCircle2, ClipboardCheck, FileText, Landmark, Send, Settings2, UserPlus } from "lucide-react";
import { useSession } from "../auth/SessionContext";
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
  withSettings,
  remind,
  reminderDue,
  stepOf,
  timing,
  type Applicant,
  type OnboardingRules,
  type StepId,
} from "../drivers/onboarding";
import { OnboardingSettingsEditor } from "../drivers/OnboardingSettingsEditor";
import { ONBOARDING_SETTINGS_KEY, contractTypeOf, emptySettingsBook, normalizeSettingsBook, typeInfo, type SettingsDoc } from "../drivers/onboardingSettings";
import { docHealth, docLabel } from "../fleet/documents";
import { HealthPill } from "../fleet/ui";
import { useMarketScope } from "../markets/useMarketScope";
import { Cards } from "../reports/ui";
import { CommandButton } from "../ui/CommandButton";
import { DataTable } from "../ui/DataTable";
import { tr, trn, trx } from "../i18n";
import { statusLabel } from "../domain/labels";

const REVIEW: { status: DocStatus; label: string }[] = [
  { status: "approved", label: "Approve" },
  { status: "rejected", label: "Reject" },
  { status: "in_review", label: "Back to review" },
];

/** Live builds show only the server's drivers and documents (owner decisions #2, #15); the demo keeps its board. */
export function OnboardingPage() {
  return isLiveData() ? <LiveOnboarding /> : <DemoOnboardingPage />;
}

function DemoOnboardingPage() {
  const { agent } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = useMarketScope();
  const country = scope.market.id;
  const drivers = useRecords("drivers", null);
  const vehicles = useRecords("vehicles", null);
  const store = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook());
  const rulesSlice = useSlice<OnboardingRules>(ONBOARDING_KEY, emptyOnboardingRules());
  const settingsSlice = useSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook());
  const rules = withSettings(normalizeOnboardingRules(rulesSlice.value), normalizeSettingsBook(settingsSlice.value));
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

  if (drivers.isLoading || vehicles.isLoading || store.loading) return <p className="state-line">{tr("Loading onboarding queue.")}</p>;
  if (drivers.isError || vehicles.isError) {
    return (
      <>
        <h2>{tr("Onboarding queue")}</h2>
        <LiveListBar list="drivers" />
        <p className="state-line">{tr("The onboarding records could not be loaded.")}</p>
      </>
    );
  }

  const header = (
    <header className="dx-head">
      <button data-command="admin.onboarding.view" type="button" className="dash-btn ghost dx-back" onClick={() => (params.get("view") ? set({ view: null }) : globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" />{" "}{tr("Back")}</button>
      <div className="dx-head-text">
        <h2>{params.get("view") === "steps" ? tr("Onboarding steps for {0}", [scope.market.name]) : tr("Onboarding queue")}</h2>
        <p>
          {params.get("view") === "steps"
            ? tr("The steps new drivers go through, the papers they need, how long each step may take and the reminders they get.")
            : tr("{0} applications in this scope. Eleven document types are supported. Fleet partners are exempt from company registration. Activation also checks bank review and vehicle eligibility.", [queue.length])}
        </p>
      </div>
      {!params.get("view") ? <button data-command="admin.onboarding.view" type="button" className="dash-btn small ghost" onClick={() => set({ view: "steps" })}><Settings2 size={14} aria-hidden="true" />{" "}{tr("Steps and papers")}</button> : null}
    </header>
  );

  if (params.get("view") === "steps") {
    return (
      <div className="dx-page vh-page">
        {header}
        <OnboardingSettingsEditor key={country} country={country} part="onboarding" />
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

      <section className="ob-funnel" aria-label={tr("Where applicants drop off")}>
        {flow.map((row, index) => (
          <div key={row.step} className="ob-funnel-step">
            <span className="ob-funnel-bar"><i style={{ width: `${Math.max(row.pct, 4)}%` }} /></span>
            <b>{row.label}</b>
            <small>{trn("{0} reached · {1}%{2}", row.reached, row.pct, index > 0 ? tr(" · {0} dropped", [flow[index - 1].reached - row.reached]) : "")}</small>
          </div>
        ))}
      </section>

      <section className="ob-board" aria-label={tr("Board")}>
        {steps.map((step) => {
          const cards = placed.filter((row) => row.step === step.id);
          return (
            <div key={step.id} className={`ob-column ${step.id}`} aria-label={step.label} role="group">
              <header><b>{step.label}</b><span className="dx-count">{cards.length}</span></header>
              <small className="vh-help">{trn("{0} Limit {1} days.", step.help, countryRules.steps.find((row) => row.id === step.id)?.days)}</small>
              {cards.slice(0, open[step.id] ? cards.length : 6).map((row) => (
                <button key={row.applicant.id} data-command="admin.onboarding.view" type="button" className={`ob-card${(driver?.id ?? lead?.applicant.id) === row.applicant.id ? " active" : ""}${row.time.stuck ? " stuck" : row.time.late ? " late" : ""}`} onClick={() => setSelectedId(row.applicant.id)}>
                  <b>{row.applicant.name}</b>
                  <small>{scope.market.zones.find((zone) => zone.id === row.applicant.zoneId)?.name ?? row.applicant.zoneId}{row.applicant.fleet ? tr(" · Fleet") : ""}{row.applicant.lead ? tr(" · new sign-up") : ""}</small>
                  <span className="ob-card-meta">
                    <span><FileText size={11} aria-hidden="true" /> {row.progress.done}/{row.progress.total}</span>
                    <span className={row.time.late ? "late" : undefined}><AlarmClock size={11} aria-hidden="true" /> {row.time.days} d</span>
                    {row.time.stuck ? <span className="tag stuck">{tr("Stuck")}</span> : row.time.late ? <span className="tag late">{tr("Late")}</span> : null}
                    {row.due ? <span className="tag due">{tr("Remind")}</span> : null}
                  </span>
                </button>
              ))}
              {cards.length > 6 ? <button data-command="admin.onboarding.view" type="button" className="dash-btn small ghost" onClick={() => setOpen({ ...open, [step.id]: !open[step.id] })}>{open[step.id] ? tr("Show fewer") : tr("Show all {0}", [cards.length])}</button> : null}
              {!cards.length ? <p className="vh-help">{tr("Nobody here.")}</p> : null}
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
          <p className="vh-help">{trn("Signed up {0} days ago and has not uploaded anything yet. Demo sign-up until the driver app sends them.", lead.time.days)}</p>
          <CommandButton command="admin.onboarding.remind" className="dash-btn small" sliceKey={ONBOARDING_KEY} value={remind(rules, lead.applicant.id, lead.step, agent?.id ?? "", new Date().toISOString())} expectedSliceRev={rules.draftRev} targetId={lead.applicant.id} confirmTarget={false} before="" after="reminder sent" disabled={!countryRules.reminders} title={countryRules.reminders ? undefined : tr("Reminders are off in Steps and papers.")} onDone={() => setNotice(tr("Reminder sent to {0}.", [lead.applicant.name]))}><Send size={13} aria-hidden="true" />{" "}{tr("Send a reminder")}</CommandButton>
        </article>
      ) : null}

      {driver ? <ApplicantView key={driver.id} settings={normalizeSettingsBook(settingsSlice.value).countries[country].document} driver={driver} rules={rules} country={country} now={now} reviewNote={reviewNote} setReviewNote={setReviewNote} setNotice={setNotice} vehicles={vehicles.data ?? []} store={store.value} placed={placed.find((row) => row.applicant.id === driver.id)} /> : !lead ? (
        <p className="dx-calm">{tr("No pending or on-hold applications are in your active scope.")}</p>
      ) : null}

      <section className="vh-section" aria-label={tr("All applicants")}>
        <h3><ClipboardCheck size={16} aria-hidden="true" />{" "}{tr("All applications")}</h3>
        <LiveListBar list="drivers" />
        <DataTable
          serverSearch="drivers"
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
  /** The country's onboarding settings (v0.17.0 §25): which types expire and which are checked by Movera. */
  settings: SettingsDoc;
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

function ApplicantView({ settings, driver, rules, country, now, reviewNote, setReviewNote, setNotice, vehicles, store, placed }: ApplicantProps) {
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
  const [expiry, setExpiry] = useState<Partial<Record<DocId, string>>>({});
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10);
  const waitingDates = [...required].filter((id) => ops.documents[id].status !== "approved" && Boolean(typeInfo(settings, contractTypeOf(id))?.expires));
  return (
    <article className="vh-section ob-applicant" aria-label={tr("Application of {0}", [driver.name])}>
      <header className="ob-applicant-head">
        <span>
          <h3>{driver.name}</h3>
          <p className="state-line">
            {driver.id} · {driver.status} · {driver.zoneId} · {driver.fleetId ? tr("Fleet {0}", [driver.fleetId]) : tr("Independent")}.
            {activationIssue ? tr(" Activation blocked: {0}", [activationIssue]) : tr(" Ready for activation.")}
          </p>
        </span>
        {placed ? <span className={placed.time.late ? "ob-step late" : "ob-step"}>{trn("{0} · {1} of {2} days", STEPS.find((step) => step.id === placed.step)?.label, placed.time.days, placed.time.limit)}</span> : null}
        <Link className="dash-btn small ghost" to={`/drivers/${driver.id}`}>{tr("Open driver")}</Link>
      </header>

      <label className="ob-note">
        <span>{tr("Review note / request details")}</span>
        <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={tr("Reason or information requested")} />
      </label>
      {preview ? (
        <p className="ob-message" aria-label={tr("Message to the driver")}><Send size={13} aria-hidden="true" /> {driverMessage(driver.name, docLabel(preview.doc), preview.action, preview.note)}</p>
      ) : <p className="vh-help">{tr("When you reject a paper or ask for more, the driver gets a message in the app with your note.")}</p>}

      <ul className="ob-docs" aria-label={tr("Documents")}>
        {DRIVER_DOCUMENTS.map((id) => {
          const review = ops.documents[id];
          const needed = required.has(id);
          const health = docHealth(review, now, firstWarningDays(rules, country));
          // v0.17.0 (owner items 1, 8, 13, 14, 15): the same rules as live. A type that expires needs its date to be
          // approved; the info session (admin_check) is marked held by Movera instead of approved.
          const info = typeInfo(settings, contractTypeOf(id));
          const expires = Boolean(info?.expires);
          const adminCheck = info?.kind === "admin_check";
          const typed = expiry[id] ?? "";
          const dateOk = !expires || (typed !== "" && typed >= tomorrow);
          return (
            <li key={id} className={needed ? undefined : "off"}>
              <span className="ob-doc-name"><b>{docLabel(id)}</b><small>{id.replaceAll("_", " ")} · {needed ? tr("Required") : driver.fleetId && id === "company_registration" ? tr("Fleet exempt") : tr("Not needed in {0}", [country])}</small></span>
              <span className="ob-doc-file"><small>{review.fileType} · {review.fileName}</small><small>{review.expiresAt || tr("No expiry")}</small></span>
              <HealthPill health={health.health}>{health.label}</HealthPill>
              {needed ? (
                <span className="ob-doc-actions">
                  {expires && review.status !== "approved" ? (
                    <label className="ob-expiry">
                      <span>{tr("Valid until (required)")}</span>
                      <input type="date" min={tomorrow} value={typed} aria-label={tr("Valid until for {0}", [docLabel(id)])} onChange={(event) => setExpiry({ ...expiry, [id]: event.target.value })} />
                    </label>
                  ) : null}
                  {adminCheck && review.status !== "approved" ? <span className="chip warn">{tr("Waiting for Movera")}</span> : null}
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
                      value={reviewDriverDocument(store, driverSeed, id, choice.status, agent?.id ?? "", reviewNote, choice.status === "approved" && expires ? typed : undefined)}
                      disabled={review.status === choice.status || (choice.status === "approved" && !dateOk)}
                      title={choice.status === "approved" && !dateOk ? tr("This document expires: type the expiry date from the document (after today).") : undefined}
                      aria-label={`${choice.status === "approved" && adminCheck ? tr("Mark held") : trx(choice.label)} ${docLabel(id)}`}
                      onDone={() => {
                        setNotice(tr("{0} marked {1}.", [docLabel(id), statusLabel(choice.status, "documentStatus").toLowerCase()]));
                        if (choice.status === "rejected") setPreview({ doc: id, action: "rejected", note: reviewNote });
                        setReviewNote("");
                      }}
                    >
                      {choice.status === "approved" && adminCheck ? tr("Mark held") : trx(choice.label)}
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
                    aria-label={tr("Ask for more about {0}", [docLabel(id)])}
                    onDone={() => {
                      setNotice(tr("More information requested for {0}.", [id.replaceAll("_", " ")]));
                      setPreview({ doc: id, action: "needed", note: reviewNote });
                      setReviewNote("");
                    }}
                  >{tr("Ask for more")}</CommandButton>
                </span>
              ) : <span className="vh-help">{tr("Not required")}</span>}
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
          disabled={waitingDates.length > 0}
          title={waitingDates.length ? tr("Documents that expire are approved one by one, with their expiry date.") : undefined}
          onDone={() => setNotice(tr("Documents approved."))}
        >
          <CheckCircle2 size={13} aria-hidden="true" />{" "}{tr("Approve remaining")}</CommandButton>
      </div>

      <div className="ob-checks">
        <section className="ob-check" aria-label={tr("Bank verification")}>
          <h4><Landmark size={14} aria-hidden="true" />{" "}{tr("Bank verification")}</h4>
          <p>{trn("Holder {0}. Account •••• {1}. Status {2}.{3}", ops.bank.holder, ops.bank.last4, ops.bank.status, ops.bank.note ? tr(" Note: {0}", [ops.bank.note]) : "")}</p>
          <div className="ob-inline">
            {(["approved", "rejected", "in_review"] as const).map((status) => (
              <CommandButton command="admin.driver.bankReview" key={status} className="dash-btn small ghost" type="button" targetId={driver.id} confirmTarget={false} scope={driver.zoneId} before={ops.bank.status} after={status} expectedSliceRev={store.draftRev} sliceKey="driverOps" value={setBankReview(store, driverSeed, status, agent?.id ?? "", reviewNote)} onDone={() => setNotice(tr("Bank details marked {0}.", [status]))}>{trn("Bank {0}", status)}</CommandButton>
            ))}
          </div>
        </section>
        <section className="ob-check" aria-label={tr("Linked vehicle")}>
          <h4><Car size={14} aria-hidden="true" />{" "}{tr("Linked vehicle")}</h4>
          {carRecord && car ? (
            <>
              <p>{trn("{0} · {1} {2} · {3} · {4} · {5} · {6} seats · {7}.", carRecord.plate, carRecord.make ?? tr("Vehicle"), carRecord.model ?? "", car.year, car.category, car.fuel, car.seats, car.status)}</p>
              <p className="vh-help">{trn("Inspection expires {0}. Insurance expires {1}. Registration {2}.{3}", car.inspectionExpiresAt, car.insuranceExpiresAt, car.registrationStatus, vehicleBlock({ year: car.year, seats: car.seats, fuel: car.fuel, category: car.category }) ?? tr(" Vehicle rule check passed."))}</p>
              <Link className="vh-help" to={`/vehicles/${carRecord.id}`}>{tr("Open the vehicle")}</Link>
            </>
          ) : <p className="state-line">{tr("No vehicle linked. Activation is blocked.")}</p>}
        </section>
        <section className="ob-check decision" aria-label={tr("Account decision")}>
          <h4><BellRing size={14} aria-hidden="true" />{" "}{tr("Account decision")}</h4>
          <div className="ob-inline">
            <CommandButton command="admin.driver.activate" className="dash-btn small" type="button" targetId={driver.id} confirmTarget={false} entityState={driver.status} scope={driver.zoneId} before={driver.status} after="active" collection="drivers" patch={{ status: "active" }} expectedSliceRev={store.draftRev} sliceKey="driverOps" value={setAccountReason(store, driverSeed, "active", "Onboarding approved", agent?.id ?? "")} disabled={Boolean(activationIssue)} title={activationIssue ?? undefined} onDone={() => setNotice(tr("Driver is active. New offers can be sent."))}>{tr("Activate")}</CommandButton>
            <CommandButton command="admin.driver.onHold" className="dash-btn small ghost" type="button" targetId={driver.id} entityState={driver.status} scope={driver.zoneId} before={driver.status} after="on_hold" collection="drivers" patch={{ status: "on_hold" }} expectedSliceRev={store.draftRev} sliceKey="driverOps" value={setAccountReason(store, driverSeed, "on_hold", reviewNote || "Onboarding review hold", agent?.id ?? "")} onDone={() => setNotice(tr("Driver placed on hold."))}>{tr("Put on hold")}</CommandButton>
            {placed?.due ? (
              <CommandButton command="admin.onboarding.remind" className="dash-btn small ghost" sliceKey={ONBOARDING_KEY} value={remind(rules, driver.id, placed.step, agent?.id ?? "", new Date().toISOString())} expectedSliceRev={rules.draftRev} targetId={driver.id} confirmTarget={false} before="" after="reminder sent" onDone={() => setNotice(tr("Reminder sent to {0}.", [driver.name]))}><Send size={13} aria-hidden="true" />{" "}{tr("Send a reminder")}</CommandButton>
            ) : null}
          </div>
        </section>
      </div>
    </article>
  );
}
