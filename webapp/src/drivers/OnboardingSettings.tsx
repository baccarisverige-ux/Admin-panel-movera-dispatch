import { useState } from "react";
import { BellRing, CalendarX2, FileCheck2, ListOrdered } from "lucide-react";
import { Card, Check, Num, Row } from "../dispatch/fields";
import { docLabel } from "../fleet/documents";
import type { MarketId } from "../markets/markets";
import { CommandButton } from "../ui/CommandButton";
import { DRIVER_DOCUMENTS } from "./gate";
import { ONBOARDING_KEY, STEPS, rulesError, type CountryOnboarding, type OnboardingRules } from "./onboarding";
import { tr, trx } from "../i18n";

/** Steps, papers, time limits and reminders for new drivers in one country. */
export function OnboardingSettings({ rules, country, editable }: { rules: OnboardingRules; country: MarketId; editable: boolean }) {
  const [draft, setDraft] = useState<CountryOnboarding | null>(null);
  const saved = rules.countries[country];
  const current = draft ?? saved;
  const dirty = Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(saved);
  const error = rulesError(current);
  const patch = (next: Partial<CountryOnboarding>) => setDraft({ ...current, ...next });
  return (
    <div className="vh-settings">
      {!editable ? <p className="dx-readonly">{tr("Only admins who can activate drivers can change the steps.")}</p> : null}
      <fieldset className="vh-fieldset" disabled={!editable}>
        <Card title={tr("Steps")} icon={<ListOrdered size={18} />} tone="blue" help={tr("Turn a step off and applicants skip it. The days are how long an applicant may stay in the step before it shows Late.")}>
          {current.steps.map((step) => {
            const def = STEPS.find((item) => item.id === step.id);
            return (
              <Row key={step.id} label={trx(def?.label) ?? step.id} help={trx(def?.help)} on={step.on} onToggle={(on) => patch({ steps: current.steps.map((item) => (item.id === step.id ? { ...item, on } : item)) })}>
                <Num label={tr("{0} days", [trx(def?.label)])} value={step.days} unit="days" min={1} max={60} onChange={(value) => patch({ steps: current.steps.map((item) => (item.id === step.id ? { ...item, days: value } : item)) })} />
              </Row>
            );
          })}
        </Card>
        <Card title={tr("Papers needed")} icon={<FileCheck2 size={18} />} tone="green" help={tr("What a new driver must upload in this country. The driving licence is always needed.")}>
          <div className="ob-doc-picks">
            {DRIVER_DOCUMENTS.map((id) => <Check key={id} label={docLabel(id)} on={current.docs.includes(id)} disabled={id === "driver_license"} onChange={(on) => patch({ docs: on ? [...current.docs, id] : current.docs.filter((item) => item !== id) })} />)}
          </div>
        </Card>
        <Card title={tr("Reminders and stuck applicants")} icon={<BellRing size={18} />} tone="orange">
          <Row label={tr("Send reminders")} help={tr("When an applicant has not done their part, the app reminds them.")} on={current.reminders} onToggle={(on) => patch({ reminders: on })}>
            <Num label={tr("Remind every")} before="Every" value={current.remindEveryDays} unit="days" min={1} max={30} onChange={(value) => patch({ remindEveryDays: value })} />
          </Row>
          <Row label={tr("Stuck after")} help={tr("An applicant in the same step this long shows as Stuck on the board.")}>
            <Num label={tr("Stuck after days")} value={current.stuckAfterDays} unit="days" min={2} max={90} onChange={(value) => patch({ stuckAfterDays: value })} />
          </Row>
        </Card>
        <Card title={tr("Documents that expire")} icon={<CalendarX2 size={18} />} tone="red" help={tr("For drivers who are already driving: warn, then block.")}>
          <Row label={tr("Warn before expiry")} help={tr("On the island and as a notification, with “Upload new”. Documents show orange in the panel from the first warning.")}>
            {current.docWarnDays.map((day, index) => (
              <Num key={index} label={tr("Document warning {0}", [index + 1])} before={index === 0 ? undefined : "and"} value={day} unit={index === current.docWarnDays.length - 1 ? "days before" : "days"} min={1} max={90} onChange={(value) => patch({ docWarnDays: current.docWarnDays.map((item, at) => (at === index ? Math.round(value) : item)) })} />
            ))}
          </Row>
          <Row label={tr("Block at expiry")} help={tr("On the expiry day the driver can't go online until you approve the new document.")} on={current.blockAtExpiry} onToggle={(blockAtExpiry) => patch({ blockAtExpiry })} />
        </Card>
      </fieldset>
      {editable ? (
        <div className="dx-publish">
          <span className="dx-publish-text"><b>{dirty ? tr("Changes not saved") : tr("Everything is saved")}</b><small>{error ?? tr("Applies to every applicant in the country.")}</small></span>
          <button data-command="admin.onboarding.view" type="button" className="dash-btn small ghost" disabled={!dirty} onClick={() => setDraft(null)}>{tr("Undo changes")}</button>
          <CommandButton command="admin.onboarding.rules" className="dash-btn small" targetId={`onboarding ${country}`} scope="all" confirmTarget={false} before="saved" after="changed" sliceKey={ONBOARDING_KEY} value={{ ...rules, draftRev: rules.draftRev + 1, countries: { ...rules.countries, [country]: current } }} expectedSliceRev={rules.draftRev} disabled={!dirty || Boolean(error)} onDone={() => setDraft(null)}>{tr("Save steps")}</CommandButton>
        </div>
      ) : null}
    </div>
  );
}
