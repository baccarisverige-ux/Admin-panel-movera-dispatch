import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { CommandButton } from "../ui/CommandButton";
import { currentLanguage, tr, uiLocale } from "../i18n/core";
import { shortDate } from "./format";
import type { LiveRiderModeration as Moderation } from "../api/seed";
import { useLiveSessionMaybe } from "./LiveSessionContext";

/**
 * v0.18.39 A2 (fix job 0) (owner G16 Q16-1 + Q16-2 "Warn → Pause → Ban", contract.json#riderModeration): the rider's level with
 * its reason, and the four steps. Every step asks for a reason (a suggested one or the admin's own); a pause needs
 * its days (1–365) and ends by itself; "Clear" undoes any level. POST /admin/riders/{riderId}/moderation.
 */
export const SUGGESTED_REASONS: Record<"sv" | "fr" | "en", readonly string[]> = {
  sv: ["Upprepade avbokningar", "Obetalda avgifter", "Olämpligt beteende mot förare", "Falsk information", "Bedrägerimisstanke"],
  fr: ["Annulations répétées", "Frais impayés", "Comportement inapproprié envers le chauffeur", "Fausses informations", "Suspicion de fraude"],
  en: ["Repeated cancellations", "Unpaid fees", "Inappropriate behaviour towards the driver", "False information", "Suspected fraud"],
};

export function LiveRiderModeration({ riderId, moderation, canEdit: roleAllows }: { riderId: string; moderation: Moderation | null; canEdit: boolean }) {
  // The server checks riders.block; on live the signed-in admin's permissions decide.
  const session = useLiveSessionMaybe();
  const canEdit = roleAllows && (session?.can("riders.block") ?? false);
  const [days, setDays] = useState(7);
  const [notice, setNotice] = useState("");
  const level = moderation?.level ?? "none";
  const language = currentLanguage();
  const choices = SUGGESTED_REASONS[language === "sv" || language === "fr" ? language : "en"].map((text) => ({ value: text, label: text }));
  const levelText = level === "warning" ? tr("Warned") : level === "paused" ? tr("Paused") : level === "banned" ? tr("Banned") : tr("No warning, pause or ban");
  const step = (to: "warning" | "paused" | "banned" | "none", label: string, className: string) => (
    <CommandButton
      command="admin.rider.moderate"
      className={className}
      targetId={riderId}
      before={levelText}
      after={label}
      value={to === "paused" ? { level: to, pauseDays: days } : { level: to }}
      reasonChoices={choices}
      disabled={!canEdit || (to === "paused" && !(days >= 1 && days <= 365))}
      onDone={() => setNotice(tr("Saved."))}
    >
      {label}
    </CommandButton>
  );
  return (
    <section className="fd-card" data-testid="rider-moderation">
      <h4><ShieldAlert size={14} aria-hidden="true" /> {tr("Warn, pause or ban")}</h4>
      <p data-testid="rider-moderation-level">
        <strong>{levelText}</strong>
        {moderation?.reason ? <> · {moderation.reason}</> : null}
        {level === "paused" && moderation?.until ? <> · {tr("Until {0}", [shortDate(moderation.until, uiLocale())])}</> : null}
      </p>
      <div className="fd-action-row">
        {level !== "warning" ? step("warning", tr("Warn"), "dash-btn ghost") : null}
        <label className="fd-reason"><span>{tr("Days")}</span><input type="number" min={1} max={365} aria-label={tr("Pause days")} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
        {step("paused", tr("Pause"), "dash-btn ghost")}
        {level !== "banned" ? step("banned", tr("Ban"), "dash-btn danger") : null}
        {level !== "none" ? step("none", tr("Clear"), "dash-btn") : null}
      </div>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
