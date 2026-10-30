import { useMemo, useState } from "react";
import { BellRing, CalendarClock, CalendarX2, CarFront, FileCheck2, ListOrdered, Pencil, Plus, Trash2 } from "lucide-react";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { useSlice } from "../api/hooks";
import { Card, Check, Num, Row } from "../dispatch/fields";
import { currentLanguage, tr, trx, type MessageKey } from "../i18n";
import type { MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { Modal } from "../ui/Modal";
import { CATEGORY_LABELS, FUELS, rulesImpact, type CarFacts, type CountryRules } from "../vehicles/rules";
import {
  LIMITS,
  ONBOARDING_SETTINGS_KEY,
  OPEN,
  SCOPES,
  STEP_IDS,
  addCustomType,
  addToList,
  addableTypes,
  editType,
  emptySettingsBook,
  localName,
  normalizeSettingsBook,
  removeFromList,
  setGuide,
  setValidMonths,
  settingsProblem,
  stagePublish,
  typeInfo,
  type Guide,
  type LocalText,
  type Scope,
  type SettingsDoc,
  type StepId,
} from "./onboardingSettings";

const STEP_LABEL: Record<StepId, { label: MessageKey; help: MessageKey }> = {
  signup: { label: "Signed up", help: "Made an account, nothing uploaded yet." },
  documents: { label: "Documents", help: "Uploading and waiting for review of the papers." },
  checks: { label: "Checks", help: "Bank details and the car are checked." },
  training: { label: "Training", help: "Terms accepted and the training session done." },
  ready: { label: "Ready to activate", help: "Everything is approved. An admin activates the account." },
};

const SCOPE_LABEL: Record<Scope, { title: MessageKey; help: MessageKey }> = {
  driver: { title: "Driver documents", help: "Every driver uploads these, in a fleet or not." },
  fleet: { title: "Fleet company documents", help: "A fleet owner (or a driver who starts his own company) also uploads these for the company." },
  vehicle: { title: "Car documents", help: "Every car needs these before it can be picked. The four photos are added while photos are needed." },
};

const EMPTY_TEXT: LocalText = { sv: "", fr: "", en: "" };
type Editing = { mode: "new"; scope: Scope } | { mode: "edit"; scope: Scope; type: string };
type Form = { name: LocalText; help: LocalText; kind: "file" | "admin_check"; expires: boolean };

/**
 * Drivers › Onboarding › Steps and papers (part "onboarding") and Vehicles › Rules (part "vehicles"): one onboarding
 * settings document per country (contract v0.17.0 §25). Demo and live show the same page; live publishes it to the server.
 */
/** cars: the country's cars, so each category shows how many fit with the changes ("N cars fit (now M)"). */
export function OnboardingSettingsEditor({ country, part, cars = [] }: { country: MarketId; part: "onboarding" | "vehicles"; cars?: readonly CarFacts[] }) {
  const { agent } = useSession();
  const slice = useSlice(ONBOARDING_SETTINGS_KEY, emptySettingsBook());
  const book = useMemo(() => normalizeSettingsBook(slice.value), [slice.value]);
  const entry = book.countries[country];
  const [draft, setDraft] = useState<{ country: MarketId; doc: SettingsDoc } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [adding, setAdding] = useState<Record<Scope, string>>({ driver: "", fleet: "", vehicle: "" });
  const saved = entry.document;
  const current = draft && draft.country === country ? draft.doc : saved;
  const dirty = Boolean(draft && draft.country === country) && JSON.stringify(current) !== JSON.stringify(saved);
  const problem = settingsProblem(current);
  const editable = Boolean(agent && can(agent.role, "settings.publish"));
  const patch = (next: Partial<SettingsDoc>) => setDraft({ country, doc: { ...current, ...next } });
  const set = (doc: SettingsDoc) => setDraft({ country, doc });
  const language = currentLanguage();
  const closed = !OPEN[country];

  const asRules = (doc: SettingsDoc) => ({ ...doc.vehicles, categories: doc.vehicles.categories }) as unknown as CountryRules;
  const impact = part === "vehicles" ? rulesImpact(cars, asRules(saved), asRules(current)) : [];

  if (slice.loading) return <p className="state-line">{tr("Loading onboarding settings.")}</p>;

  const versionLine = entry.liveVersion > 0 ? tr("Live version {0}.", [entry.liveVersion]) : tr("Nothing published yet: the standard values are used.");

  return (
    <div className="vh-settings" data-testid={`onboarding-settings-${part}`} data-country={country}>
      {!editable ? <p className="dx-readonly">{tr("Only admins who can publish settings can change these.")}</p> : null}
      {closed ? <p className="fd-banner amber" data-testid="country-closed">{tr("This country is closed for sign-ups. No documents are asked for until it opens.")}</p> : null}
      {slice.error ? <p className="state-line">{tr("The settings could not be loaded from the server. The standard values are shown.")}</p> : null}
      <fieldset className="vh-fieldset" disabled={!editable}>
        {part === "onboarding" ? (
          <>
            {SCOPES.map((scope) => {
              const list = current.documents[scope];
              const options = addableTypes(current, scope);
              return (
                <Card key={scope} title={tr(SCOPE_LABEL[scope].title)} icon={<FileCheck2 size={18} />} tone={scope === "vehicle" ? "purple" : scope === "fleet" ? "orange" : "green"} help={tr(SCOPE_LABEL[scope].help)}>
                  <ul className="ob-type-list" aria-label={tr(SCOPE_LABEL[scope].title)} data-scope={scope}>
                    {list.length === 0 ? <li className="vh-help">{tr("No documents in this list.")}</li> : null}
                    {list.map((type) => {
                      const info = typeInfo(current, type, scope);
                      const name = info ? localName(info.name, language) : type;
                      const locked = scope === "driver" && type === "driving_license";
                      return (
                        <li key={type} data-type={type} className="ob-type-row">
                          <span className="ob-type-name">
                            <b>{name}</b>
                            <small>
                              {info?.custom ? <span className="chip">{tr("New type")}</span> : null}
                              {info?.expires ? <span className="chip warn">{tr("Expires")}</span> : <span className="chip">{tr("Does not expire")}</span>}
                              {info?.kind === "admin_check" ? <span className="chip">{tr("Checked by Movera")}</span> : info?.kind === "acceptance" ? <span className="chip">{tr("Accepted in the app")}</span> : null}
                              {info?.help ? <span className="ob-type-help">{localName(info.help, language)}</span> : null}
                            </small>
                          </span>
                          <span className="ob-type-actions">
                            <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small ghost" aria-label={tr("Edit {0}", [name])} onClick={() => setEditing({ mode: "edit", scope, type })}><Pencil size={13} aria-hidden="true" />{" "}{tr("Edit")}</button>
                            <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small danger-ghost" aria-label={tr("Remove {0}", [name])} disabled={locked} title={locked ? tr("The driving licence is always needed.") : undefined} onClick={() => set(removeFromList(current, scope, type))}><Trash2 size={13} aria-hidden="true" />{" "}{tr("Remove")}</button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="ob-type-add">
                    <label>
                      <span className="sr-only">{tr("Add a document to {0}", [tr(SCOPE_LABEL[scope].title)])}</span>
                      <select aria-label={tr("Add a document to {0}", [tr(SCOPE_LABEL[scope].title)])} value={adding[scope]} onChange={(event) => setAdding({ ...adding, [scope]: event.target.value })}>
                        <option value="">{tr("Choose a document")}</option>
                        {options.map((type) => {
                          const info = typeInfo(current, type, scope);
                          return <option key={type} value={type}>{info ? localName(info.name, language) : type}</option>;
                        })}
                      </select>
                    </label>
                    <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small ghost" disabled={!adding[scope]} onClick={() => { set(addToList(current, scope, adding[scope])); setAdding({ ...adding, [scope]: "" }); }}><Plus size={13} aria-hidden="true" />{" "}{tr("Add")}</button>
                    <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small" onClick={() => setEditing({ mode: "new", scope })}><Plus size={13} aria-hidden="true" />{" "}{tr("New document type")}</button>
                  </div>
                </Card>
              );
            })}
            <Card title={tr("Steps")} icon={<ListOrdered size={18} />} tone="blue" help={tr("Turn a step off and applicants skip it. The days are how long an applicant may stay in the step before it shows Late.")}>
              {STEP_IDS.map((id) => {
                const step = current.steps.find((row) => row.id === id) ?? { id, on: true, days: 1 };
                const steps = (next: Partial<typeof step>) => patch({ steps: STEP_IDS.map((sid) => { const row = current.steps.find((item) => item.id === sid) ?? { id: sid, on: true, days: 1 }; return sid === id ? { ...row, ...next } : row; }) });
                return (
                  <Row key={id} label={tr(STEP_LABEL[id].label)} help={tr(STEP_LABEL[id].help)} on={step.on} onToggle={(on) => steps({ on })}>
                    <Num label={tr("{0} days", [tr(STEP_LABEL[id].label)])} value={step.days} unit="days" min={LIMITS.stepDays[0]} max={LIMITS.stepDays[1]} onChange={(value) => steps({ days: value })} />
                  </Row>
                );
              })}
            </Card>
            <Card title={tr("Reminders and stuck applicants")} icon={<BellRing size={18} />} tone="orange">
              <Row label={tr("Send reminders")} help={tr("A driver who has not finished the sign-up gets the push “Finish your sign-up”.")} on={current.signUpReminders.on} onToggle={(on) => patch({ signUpReminders: { ...current.signUpReminders, on } })}>
                <Num label={tr("Remind every")} before="Every" value={current.signUpReminders.everyDays} unit="days" min={LIMITS.remindEveryDays[0]} max={LIMITS.remindEveryDays[1]} onChange={(value) => patch({ signUpReminders: { ...current.signUpReminders, everyDays: value } })} />
              </Row>
              <Row label={tr("Stuck after")} help={tr("An applicant in the same step this long shows as Stuck on the board.")}>
                <Num label={tr("Stuck after days")} value={current.signUpReminders.stuckAfterDays} unit="days" min={LIMITS.stuckAfterDays[0]} max={LIMITS.stuckAfterDays[1]} onChange={(value) => patch({ signUpReminders: { ...current.signUpReminders, stuckAfterDays: value } })} />
              </Row>
            </Card>
            <Card title={tr("Documents that expire")} icon={<CalendarX2 size={18} />} tone="red" help={tr("For drivers who are already driving: warn, then block.")}>
              <Row label={tr("Warn before expiry")} help={tr("On the Home sheet and as a push, with “Upload new”. Documents show orange in the panel from the first warning.")}>
                {current.expiry.warnDays.map((day, index) => (
                  <Num key={index} label={tr("Document warning {0}", [index + 1])} before={index === 0 ? undefined : "and"} value={day} unit={index === current.expiry.warnDays.length - 1 ? "days before" : "days"} min={LIMITS.warnDays[0]} max={LIMITS.warnDays[1]} onChange={(value) => patch({ expiry: { ...current.expiry, warnDays: current.expiry.warnDays.map((item, at) => (at === index ? Math.round(value) : item)) } })} />
                ))}
              </Row>
              <Row label={tr("Block at expiry")} help={tr("On the expiry day the driver can't go online until you approve the new document.")} on={current.expiry.blockAtExpiry} onToggle={(blockAtExpiry) => patch({ expiry: { ...current.expiry, blockAtExpiry } })} />
            </Card>
          </>
        ) : (
          <>
            <Card title={tr("Which car fits which category")} icon={<CarFront size={18} />} tone="blue" help={tr("The driver app offers only the categories a car fits, and the server refuses the others.")}>
              {current.vehicles.categories.map((rule) => {
                const label = trx(CATEGORY_LABELS[rule.category as keyof typeof CATEGORY_LABELS] ?? rule.category);
                const patchRule = (next: Partial<typeof rule>) => patch({ vehicles: { ...current.vehicles, categories: current.vehicles.categories.map((item) => (item.category === rule.category ? { ...item, ...next } : item)) } });
                return (
                  <Row key={rule.category} label={label} help={(() => { const count = impact.find((item) => item.category === rule.category); return tr("{0} cars fit{1}.", [count?.after ?? 0, count && count.after !== count.before ? ` (now ${count.before})` : ""]); })()} on={rule.on} onToggle={(on) => patchRule({ on })}>
                    <Num label={tr("{0} oldest year", [label])} before="From" value={rule.minYear} min={LIMITS.minYear[0]} max={LIMITS.minYear[1]} onChange={(value) => patchRule({ minYear: value })} />
                    <Num label={tr("{0} seats", [label])} before="Seats" value={rule.minSeats} min={LIMITS.minSeats[0]} max={LIMITS.minSeats[1]} onChange={(value) => patchRule({ minSeats: value })} />
                    <span className="vh-fuels">{FUELS.map((fuel) => <Check key={fuel.id} label={trx(fuel.label)} on={rule.fuels.includes(fuel.id)} onChange={(on) => patchRule({ fuels: on ? [...rule.fuels, fuel.id] : rule.fuels.filter((item) => item !== fuel.id) })} />)}</span>
                  </Row>
                );
              })}
            </Card>
            <Card title={tr("Papers and photos")} icon={<CalendarClock size={18} />} tone="orange">
              <Row label={tr("Warn before papers expire")} help={tr("Car papers show orange and the driver is reminded this many days before they run out.")}>
                <Num label={tr("Warning days")} value={current.vehicles.warnDays} unit="days" min={LIMITS.vehicleWarnDays[0]} max={LIMITS.vehicleWarnDays[1]} onChange={(value) => patch({ vehicles: { ...current.vehicles, warnDays: value } })} />
              </Row>
              <Row label={tr("Take cars off the road when papers expire")} help={tr("A car with an expired paper cannot be driven until a new one is approved.")} on={current.vehicles.autoHold} onToggle={(autoHold) => patch({ vehicles: { ...current.vehicles, autoHold } })} />
              <Row label={tr("Photos must be approved")} help={tr("Front, back, side and inside photos are asked in the driver app and approved here.")} on={current.vehicles.photosNeeded} onToggle={(photosNeeded) => patch({ vehicles: { ...current.vehicles, photosNeeded } })} />
            </Card>
          </>
        )}
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{dirty ? tr("Changes not published") : tr("Everything is published")}</b><small data-testid="settings-status">{problem ? trx(problem) : `${versionLine} ${tr("Publishing changes the app and the server for every driver in the country at once.")}`}</small></span>
          <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <CommandButton command="admin.onboarding.publishSettings" className="dash-btn small" targetId={country} scope="all" confirmTarget={false} before={`v${entry.liveVersion}`} after="published" sliceKey={ONBOARDING_SETTINGS_KEY} value={stagePublish(book, country, current, new Date().toISOString())} expectedSliceRev={book.draftRev} disabled={!dirty || Boolean(problem)} onDone={() => { setDraft(null); void slice.refetch(); }}>{tr("Publish")}</CommandButton>
        </div>
      ) : null}
      {editing ? <TypeDialog key={editing.mode === "edit" ? editing.type : `new-${editing.scope}`} editing={editing} doc={current} onClose={() => setEditing(null)} onSave={(doc) => { set(doc); setEditing(null); }} /> : null}
    </div>
  );
}

function TypeDialog({ editing, doc, onClose, onSave }: { editing: Editing; doc: SettingsDoc; onClose: () => void; onSave: (doc: SettingsDoc) => void }) {
  const info = editing.mode === "edit" ? typeInfo(doc, editing.type, editing.scope) : null;
  const [form, setForm] = useState<Form>({ name: info ? { ...info.name } : { ...EMPTY_TEXT }, help: info?.help ? { ...info.help } : { ...EMPTY_TEXT }, kind: info?.kind === "admin_check" ? "admin_check" : "file", expires: info?.expires ?? false });
  const isNew = editing.mode === "new";
  const needsHelp = isNew || info?.custom;
  const missing = (["sv", "fr", "en"] as const).some((lang) => !form.name[lang].trim()) || (needsHelp && (["sv", "fr", "en"] as const).some((lang) => !form.help[lang].trim()));
  const langs: { id: keyof LocalText; label: MessageKey }[] = [{ id: "sv", label: "Swedish" }, { id: "fr", label: "French" }, { id: "en", label: "English" }];
  // v0.18.3 (owner G2 R8, R9): the upload guide and the valid months of this type in this country.
  const type = editing.mode === "edit" ? editing.type : null;
  const [guide, setGuideForm] = useState<Guide>(() => structuredClone(type ? doc.guides?.[type] ?? { checklist: [], tips: [] } : { checklist: [], tips: [] }));
  const [months, setMonths] = useState<string>(type && doc.validMonths?.[type] ? String(doc.validMonths[type]) : "");
  const monthsNumber = months.trim() === "" ? null : Number(months);
  const badMonths = monthsNumber !== null && !(Number.isInteger(monthsNumber) && monthsNumber >= LIMITS.validMonths[0] && monthsNumber <= LIMITS.validMonths[1]);
  const guideLists: { id: keyof Guide; title: MessageKey }[] = [{ id: "checklist", title: "Checklist: what must be visible" }, { id: "tips", title: "Tips for a good photo" }];
  const setLine = (list: keyof Guide, index: number, lang: keyof LocalText, value: string) => setGuideForm({ ...guide, [list]: guide[list].map((line, at) => (at === index ? { ...line, [lang]: value } : line)) });
  return (
    <Modal open title={isNew ? tr("New document type") : tr("Edit document type")} onClose={onClose}>
      <form
        className="live-dialog ob-type-form"
        data-testid="type-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (missing) return;
          if (editing.mode === "new") onSave(addCustomType(doc, { owner: editing.scope, kind: form.kind, expires: form.expires, name: form.name, help: form.help }, `n${Date.now().toString(36)}`));
          else {
            if (badMonths) return;
            const edited = editType(doc, editing.type, { name: form.name, help: form.help, expires: form.expires, ...(info?.custom ? { kind: form.kind } : {}) });
            onSave(setValidMonths(setGuide(edited, editing.type, guide), editing.type, form.expires ? monthsNumber : null));
          }
        }}
      >
        <p className="vh-help">{tr(SCOPE_LABEL[editing.scope].title)}</p>
        <fieldset>
          <legend>{tr("Name")}</legend>
          {langs.map((lang) => <label key={lang.id}>{tr("Name ({0})", [tr(lang.label)])}<input value={form.name[lang.id]} maxLength={80} onChange={(event) => setForm({ ...form, name: { ...form.name, [lang.id]: event.target.value } })} /></label>)}
        </fieldset>
        <fieldset>
          <legend>{tr("Help text: what must be visible")}</legend>
          {langs.map((lang) => <label key={lang.id}>{tr("Help text ({0})", [tr(lang.label)])}<textarea rows={2} maxLength={500} value={form.help[lang.id]} onChange={(event) => setForm({ ...form, help: { ...form.help, [lang.id]: event.target.value } })} /></label>)}
        </fieldset>
        {isNew || info?.custom ? (
          <label>
            {tr("How it is done")}
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value === "admin_check" ? "admin_check" : "file" })}>
              <option value="file">{tr("The driver uploads a file")}</option>
              <option value="admin_check">{tr("Movera checks it (like the info session)")}</option>
            </select>
          </label>
        ) : null}
        <label className="ob-check-line"><input type="checkbox" checked={form.expires} onChange={(event) => setForm({ ...form, expires: event.target.checked })} /> {tr("Expires: the admin types the expiry date when approving")}</label>
        {type && form.expires ? (
          <label data-testid="valid-months">
            {tr("Valid for (months from the issue date)")}
            <input type="number" min={LIMITS.validMonths[0]} max={LIMITS.validMonths[1]} value={months} placeholder={tr("Not set: the admin types the end date")} onChange={(event) => setMonths(event.target.value)} />
            {badMonths ? <small className="vh-help">{tr("Valid months: 1 to 120.")}</small> : null}
          </label>
        ) : null}
        {type && (info?.kind ?? "file") === "file" ? guideLists.map((list) => (
          <fieldset key={list.id} data-testid={`guide-${list.id}`}>
            <legend>{tr(list.title)}</legend>
            <p className="vh-help">{tr("Shown in the driver app's upload guide. Empty: the app's own text is shown.")}</p>
            {guide[list.id].map((line, index) => (
              <div key={index} className="ob-guide-line">
                {langs.map((lang) => <label key={lang.id}>{tr("Line {0} ({1})", [index + 1, tr(lang.label)])}<input value={line[lang.id]} maxLength={300} onChange={(event) => setLine(list.id, index, lang.id, event.target.value)} /></label>)}
                <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small danger-ghost" onClick={() => setGuideForm({ ...guide, [list.id]: guide[list.id].filter((_, at) => at !== index) })}><Trash2 size={13} aria-hidden="true" />{" "}{tr("Remove")}</button>
              </div>
            ))}
            <button data-command="admin.onboarding.editTypes" type="button" className="dash-btn small ghost" disabled={guide[list.id].length >= 10} onClick={() => setGuideForm({ ...guide, [list.id]: [...guide[list.id], { sv: "", fr: "", en: "" }] })}><Plus size={13} aria-hidden="true" />{" "}{tr("Add a line")}</button>
          </fieldset>
        )) : null}
        {missing ? <p className="vh-help">{needsHelp ? tr("Write the name and the help text in Swedish, French and English.") : tr("Write the name in Swedish, French and English.")}</p> : null}
        <div className="actions">
          <button data-command="admin.onboarding.editTypes" type="submit" className="primary-btn" disabled={missing || badMonths}>{isNew ? tr("Add the document") : tr("Save")}</button>
          <button data-command="admin.onboarding.editTypes" type="button" className="secondary-btn" onClick={onClose}>{tr("Cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}
