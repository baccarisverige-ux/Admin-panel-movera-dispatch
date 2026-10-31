import { useDirtyWarning } from "../ui/useDirtyWarning";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, FileCheck, GitCompare, History, ImagePlus, MapPin, Smartphone, TriangleAlert } from "lucide-react";
import { STUDIO_SLOTS, emptyStudio, studioSlot, changeStudio, useSlice, type StudioBook, type StudioText } from "../api/hooks";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { CONTENT_OPS_KEY, PHONES, compare, emptyContentOps, extraError, normalizeContentOps, setExtra, slotExtra, type ContentOps, type SlotExtra } from "../content/extra";
import { Card, Check, Choice, Row, Switch } from "../dispatch/fields";
import { MARKETS } from "../markets/markets";
import { useMarketScope } from "../markets/useMarketScope";
import { CommandButton } from "../ui/CommandButton";
import { DiffTable } from "../content/DiffTable";
import { DriverTextsView } from "../content/DriverTexts";
import { LegalEditor } from "../content/LegalEditor";
import { emptyStudioText, publishBody, validateStudio } from "../content/studio";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "../live/LiveSessionContext";
import { PublishTargetsLine } from "../live/StandardBar";
import { ErrorLine } from "../live/ui";
import { AcceptanceTable, type Acceptance } from "../live/AcceptanceTable";
import { publishTargets } from "../markets/scope";
import { zoneById } from "../markets/markets";

/** ContentItem of contract v0.10.0 §19 (as the server sends it). */
type ContentItem = { slot: string; zoneId: string; version: number; publishedAt: string; publishedBy?: string; title: string; text: { sv: string; fr: string; en: string }; image?: string; expiresAt?: string; reaccept?: boolean; versions?: { rider: { min: string; recommended: string }; driver: { min: string; recommended: string } } };
const itemsOf = <T,>(answer: { items?: T[] } | T[] | null | undefined): T[] => (Array.isArray(answer) ? answer : answer?.items ?? []);

function textFromItem(item: ContentItem): StudioText {
  return { ...emptyStudioText(), title: item.title, sv: item.text.sv, fr: item.text.fr, en: item.text.en, image: item.image ?? "", expiresAt: item.expiresAt ? item.expiresAt.slice(0, 16) : "", reaccept: Boolean(item.reaccept), riderMin: item.versions?.rider.min ?? "", riderRecommended: item.versions?.rider.recommended ?? "", driverMin: item.versions?.driver.min ?? "", driverRecommended: item.versions?.driver.recommended ?? "" };
}

const SLOT_LABEL: Record<string, Parameters<typeof tr>[0]> = {
  "driver-home": "Driver app · home",
  "driver-event": "Driver app · event",
  help: "Help pages",
  legal: "Terms and privacy",
  "app-versions": "App versions",
  "driver-info-session": "Driver app · how to book the info session",
};

function slotLabel(id: string): string {
  const known = SLOT_LABEL[id];
  return known ? tr(known) : tr("Rider app · banner {0}", [id.replace("rider-banner-", "")]);
}

export function ContentPage() {
  const { agent } = useSession();
  const live = useLiveSessionMaybe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "driver-texts" ? "driver-texts" : params.get("view") === "legal" ? "legal" : "slots";
  const scope = useMarketScope();
  const store = useSlice<StudioBook>("studioOps", emptyStudio());
  const extraSlice = useSlice<ContentOps>(CONTENT_OPS_KEY, emptyContentOps());
  const ops = normalizeContentOps(extraSlice.value);
  const [id, setId] = useState<string>("driver-home");
  const [draft, setDraft] = useState<StudioText | null>(null);
  const [extraDraft, setExtraDraft] = useState<SlotExtra | null>(null);
  const [notice, setNotice] = useState("");
  const [phone, setPhone] = useState(PHONES[1].id);
  const [lang, setLang] = useState<"sv" | "fr" | "en">("sv");
  const targets = publishTargets(scope);
  const [historyZonePick, setHistoryZone] = useState<string>("");
  const historyZone = targets.includes(historyZonePick) ? historyZonePick : targets[0] ?? "";
  const history = useQuery({ queryKey: ["live", "content-history", id, historyZone], enabled: Boolean(live && historyZone), queryFn: () => live!.client.json<{ items: ContentItem[] }>(`/admin/content/${encodeURIComponent(id)}/history?zoneId=${encodeURIComponent(historyZone)}`) });
  const acceptances = useQuery({ queryKey: ["live", "content-acceptances", historyZone], enabled: Boolean(live && id === "legal" && historyZone), queryFn: () => live!.client.json<{ items: Acceptance[] }>(`/admin/content/legal/acceptances?zoneId=${encodeURIComponent(historyZone)}`) });
  const liveHistory = [...itemsOf<ContentItem>(history.data)].sort((a, b) => b.version - a.version);
  const [against, setAgainst] = useState<number | null>(null);
  const slot = studioSlot(store.value, id);
  const text = draft ?? (live ? (liveHistory[0] ? textFromItem(liveHistory[0]) : emptyStudioText()) : slot.draft);
  const extra = extraDraft ?? slotExtra(ops, id);
  const editable = live ? live.can("settings.publish") : Boolean(agent && can(agent.role, "settings.edit"));
  const size = PHONES.find((item) => item.id === phone) ?? PHONES[1];
  const errorExtra = extraError(extra);
  const zonesHere = MARKETS.filter((item) => extra.countries.includes(item.id)).flatMap((item) => item.zones);
  const base = against === null ? slot.published : slot.history.find((item) => item.version === against)?.text ?? null;
  const diff = base ? compare(base, text) : [];
  const expired = Boolean(text.expiresAt && new Date(text.expiresAt).getTime() < Date.now());
  function patch(v: Partial<StudioText>) {
    setDraft({ ...text, ...v });
  }
  function patchExtra(v: Partial<SlotExtra>) {
    setExtraDraft({ ...extra, ...v });
  }
  function choose(next: string) {
    setId(next);
    setDraft(null);
    setExtraDraft(null);
    setAgainst(null);
    setNotice("");
  }
  function upload(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patchExtra({ image: { name: file.name, dataUrl: String(reader.result), fit: extra.image?.fit ?? "fill" } });
    reader.readAsDataURL(file);
  }
  useDirtyWarning(Boolean(draft || extraDraft));
  const publishError = live ? validateStudio(id, text) ?? (targets.length ? undefined : "Nothing is chosen at the top: choose the zones first.") : changeStudio(store.value, id, text, "publish", agent?.id ?? "").error;
  const imageSrc = extra.image?.dataUrl || text.image;

  return (
    <div className="dx-page gr-page">
      <header className="dx-head">
        <button data-command="admin.content.view" type="button" className="dash-btn ghost dx-back" onClick={() => (globalThis.history.length > 1 ? navigate(-1) : navigate("/"))}><ArrowLeft size={16} aria-hidden="true" /> {tr("Back")}</button>
        <div className="dx-head-text">
          <h2>{tr("Content")}</h2>
          <p>{view === "legal" ? tr("Terms of use and privacy policy per country, in Swedish, French and English, with the company details and a version history.") : view === "driver-texts" ? tr("Island, offer and button texts in the driver app, in English, Swedish, French and Arabic.") : live ? tr("Texts in Swedish, French and English for the apps. Publish sends them to the zones chosen at the top; one admin is enough. History and rollback come from the server.") : tr("Content studio in Swedish, French and English. A second agent must publish. Originals and every publication remain in history. Simulation only.")}</p>
        </div>
      </header>
      <div className="dash-tabs dx-views" role="tablist" aria-label={tr("Content sections")}>
        {([["slots", tr("Content slots")], ["driver-texts", tr("Driver app texts")], ["legal", tr("Legal")]] as const).map(([tabId, label]) => (
          <button data-command="admin.content.view" key={tabId} type="button" role="tab" aria-selected={view === tabId} className={view === tabId ? "active" : undefined} onClick={() => { setNotice(""); setParams(() => { const next = new URLSearchParams(globalThis.location.search); if (tabId === "slots") next.delete("view"); else next.set("view", tabId); return next; }, { replace: true }); }}>{label}</button>
        ))}
      </div>
      <p role="status" className="gr-status">{notice}</p>

      {/* v0.18.5 (owner G1-B2): Content › Legal, the terms and privacy per country (SE, FR). */}
      {view === "legal" ? <LegalEditor country={scope.market.id} onNotice={setNotice} /> : view === "driver-texts" ? <DriverTextsView editable={editable} onNotice={setNotice} /> : (
      <div className="gr-content">
        <nav className="gr-slots" aria-label={tr("All slots")}>
          {STUDIO_SLOTS.map((item) => {
            const row = studioSlot(store.value, item);
            const places = slotExtra(ops, item).countries;
            const hidden = !places.includes(scope.market.id);
            return (
              <button data-command="admin.content.slot" key={item} type="button" className={item === id ? "active" : undefined} aria-current={item === id ? "true" : undefined} onClick={() => choose(item)}>
                <b>{slotLabel(item)}</b>
                <small>{live ? "" : row.published ? tr("Live · v{0}", [String(row.history.at(-1)?.version ?? 1)]) : tr("Not published")}{hidden ? tr(" · not in {0}", [scope.market.name]) : ""}</small>
              </button>
            );
          })}
        </nav>

        <div className="gr-content-main">
          <label className="gr-field gr-slot-pick">{tr("Content slot")}<select value={id} onChange={(e) => choose(e.target.value)}>{STUDIO_SLOTS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <article className="panel gr-panel">
            <h3>{tr("{0} · published version {1}", [slotLabel(id), String((live ? liveHistory[0]?.version : slot.history.at(-1)?.version) ?? tr("none"))])}</h3>
            {expired ? <p className="gr-warn"><TriangleAlert size={13} aria-hidden="true" /> {tr("This content has ended and is no longer shown.")}</p> : null}
            <fieldset disabled={!editable || store.loading}>
              <div className="field-grid">
                <label>{tr("Title")}<input value={text.title} onChange={(e) => patch({ title: e.target.value })} /></label>
                <label>{tr("Swedish content")}<textarea value={text.sv} onChange={(e) => patch({ sv: e.target.value })} /></label>
                <label>{tr("French content")}<textarea value={text.fr} onChange={(e) => patch({ fr: e.target.value })} /></label>
                <label>{tr("English content")}<textarea value={text.en} onChange={(e) => patch({ en: e.target.value })} /></label>
                <label>{tr("Image URL")}<input value={text.image} onChange={(e) => patch({ image: e.target.value })} /></label>
                <label>{tr("Content expiry")}<input type="datetime-local" value={text.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /></label>
                {id === "app-versions" ? (
                  <>
                    <label>{tr("Rider app minimum version")}<input value={text.riderMin} placeholder="1.2.3" onChange={(e) => patch({ riderMin: e.target.value })} /></label>
                    <label>{tr("Rider app recommended version")}<input value={text.riderRecommended} placeholder="1.2.3" onChange={(e) => patch({ riderRecommended: e.target.value })} /></label>
                    <label>{tr("Driver app minimum version")}<input value={text.driverMin} placeholder="1.2.3" onChange={(e) => patch({ driverMin: e.target.value })} /></label>
                    <label>{tr("Driver app recommended version")}<input value={text.driverRecommended} placeholder="1.2.3" onChange={(e) => patch({ driverRecommended: e.target.value })} /></label>
                    <p className="gr-help">{tr("Below the minimum the app shows \"Update the app\" and is blocked (after a trip; SOS always works). Below the recommended version a message the user can close.")}</p>
                  </>
                ) : null}
                {id === "legal" && live ? <p className="gr-warn" data-testid="legacy-legal-note">{tr("Only older app builds read this zone text. Terms and privacy per country are edited in Content › Legal.")}</p> : null}
                {id === "legal" ? (
                  <Row label={tr("Users must accept again")} help={tr("At the next app start (never during a trip) riders and drivers see the new terms with \"I accept\". Until then the rider cannot book and the driver cannot go online.")}>
                    <Switch label={tr("Users must accept again")} on={text.reaccept} disabled={!editable} onChange={(reaccept) => patch({ reaccept })} />
                  </Row>
                ) : null}
              </div>
            </fieldset>
            {live ? (
              <div className="actions">
                <CommandButton command="admin.studio.publish" className="dash-btn small" targetId={id} value={{ zoneIds: targets, ...publishBody(id, text) }} confirmTarget={false} disabled={!editable || Boolean(publishError)} title={publishError ? tr(publishError as Parameters<typeof tr>[0]) : undefined} summary={<PublishTargetsLine zoneIds={targets} />} onDone={() => { setDraft(null); setNotice(tr("{0}: published.", [slotLabel(id)])); void queryClient.invalidateQueries({ queryKey: ["live", "content-history"] }); }}>{tr("Publish")}</CommandButton>
              </div>
            ) : (
            <div className="actions">
                {(["save", "publish", "rollback"] as const).map((action) => {
                  const result = changeStudio(store.value, id, text, action, agent?.id ?? "");
                  return <CommandButton key={action} command={`admin.studio.${action}`} className={action === "publish" ? "dash-btn small" : "dash-btn small ghost"} targetId={id} sliceKey="studioOps" value={result.book} expectedSliceRev={store.value.draftRev} confirmTarget={false} disabled={store.loading || Boolean(result.error) || Boolean(draft && action !== "save")} title={result.error} onDone={() => { setDraft(null); setNotice(tr("{0}: {1} recorded.", [id, action])); }}>{action === "save" ? tr("Save draft") : action === "publish" ? tr("Publish") : tr("Roll back")}</CommandButton>;
                })}
              </div>
            )}
            <p role="alert" className="gr-help">{publishError ? tr(publishError as Parameters<typeof tr>[0]) : ""}</p>
          </article>

          {live ? null : <Card title={tr("Image, places and app update")} icon={<ImagePlus size={15} />} tone="purple" help={tr("Saved apart from the text. Applies when the content is shown.")}>
            <Row label={tr("Image")} help={tr("Upload a picture. Fill covers the whole space and may cut the edges; fit shows the whole picture.")}>
              <span className="gr-image-row">
                <label className="dash-btn small ghost gr-upload">{tr("Upload image")}<input type="file" accept="image/*" aria-label={tr("Upload image")} disabled={!editable} onChange={(e) => upload(e.target.files?.[0])} /></label>
                {extra.image ? <><small>{extra.image.name}</small><button data-command="admin.content.view" type="button" className="dash-btn small ghost" disabled={!editable} onClick={() => patchExtra({ image: null })}>{tr("Remove image")}</button></> : <small>{tr("No image uploaded")}</small>}
              </span>
            </Row>
            <Row label={tr("How the image fits")}>
              <Choice label={tr("Image fit")} value={extra.image?.fit ?? "fill"} disabled={!editable || !extra.image} options={[{ id: "fill", label: "Fill" }, { id: "fit", label: "Fit" }]} onChange={(fit) => extra.image && patchExtra({ image: { ...extra.image, fit } })} />
            </Row>
            <Row label={tr("Countries")} help={tr("The content shows only in these countries.")}>
              <span className="gr-checks">{MARKETS.map((item) => <Check key={item.id} label={item.name} on={extra.countries.includes(item.id)} disabled={!editable} onChange={(on) => patchExtra({ countries: on ? [...extra.countries, item.id] : extra.countries.filter((x) => x !== item.id), zones: on ? extra.zones : extra.zones.filter((zone) => !item.zones.some((z) => z.id === zone)) })} />)}</span>
            </Row>
            <Row label={tr("Only some zones")} help={tr("Leave empty to show it in every zone of the chosen countries.")} on={extra.zones.length > 0}>
              <span className="gr-checks gr-zones" aria-label={tr("Zones")}><MapPin size={12} aria-hidden="true" />{zonesHere.map((zone) => <Check key={zone.id} label={zone.name} on={extra.zones.includes(zone.id)} disabled={!editable} onChange={(on) => patchExtra({ zones: on ? [...extra.zones, zone.id] : extra.zones.filter((x) => x !== zone.id) })} />)}</span>
            </Row>
            {id === "app-versions" ? (
              <>
                <Row label={tr("Force update on iPhone")} help={tr("People below the minimum version must update before they can book.")}><Switch label={tr("Force update on iPhone")} on={extra.forceUpdate.ios} disabled={!editable} onChange={(ios) => patchExtra({ forceUpdate: { ...extra.forceUpdate, ios } })} /></Row>
                <Row label={tr("Force update on Android")}><Switch label={tr("Force update on Android")} on={extra.forceUpdate.android} disabled={!editable} onChange={(android) => patchExtra({ forceUpdate: { ...extra.forceUpdate, android } })} /></Row>
              </>
            ) : null}
            {errorExtra ? <p role="alert" className="gr-warn">{errorExtra}</p> : null}
            <div className="actions">
              <CommandButton command="admin.content.extra" className="dash-btn small" targetId={id} sliceKey={CONTENT_OPS_KEY} value={setExtra(ops, id, extra)} expectedSliceRev={ops.draftRev} confirmTarget={false} disabled={!editable || !extraDraft || Boolean(errorExtra) || extraSlice.loading} onDone={() => { setExtraDraft(null); setNotice(tr("{0}: image, places and app update saved.", [id])); }}>{tr("Save image and places")}</CommandButton>
              {extraDraft ? <button data-command="admin.content.view" type="button" className="dash-btn small ghost" onClick={() => setExtraDraft(null)}>{tr("Undo changes")}</button> : null}
            </div>
          </Card>}

          {live ? (
            <Card title={tr("History from the server")} icon={<History size={15} />} tone="blue" help={tr("Every published version in the zone. Roll back publishes an earlier version again as the next version.")}>
              <label className="gr-field"><span>{tr("Zone")}</span>
                <select aria-label={tr("History zone")} value={historyZone} onChange={(e) => setHistoryZone(e.target.value)}>{targets.map((zone) => <option key={zone} value={zone}>{zoneById(zone)?.name ?? zone}</option>)}</select>
              </label>
              {history.isLoading ? <p className="state-line">{tr("Loading.")}</p> : history.error ? <ErrorLine error={history.error} onRetry={() => void history.refetch()} /> : liveHistory.length === 0 ? <p className="dx-calm">{tr("Nothing published yet in this zone.")}</p> : (
                <ol aria-label={tr("Content history")} className="gr-events" data-testid="live-content-history">
                  {liveHistory.map((item, index) => (
                    <li key={item.version}>v{item.version} · {item.publishedBy ?? ""} · {item.publishedAt.slice(0, 16).replace("T", " ")} · {item.text.sv}
                      {index > 0 ? <> {" "}<CommandButton command="admin.studio.rollback" className="dash-btn small ghost" targetId={id} value={{ zoneId: historyZone, version: item.version }} confirmTarget={false} disabled={!editable} summary={tr("Version {0} is published again in {1} as the next version.", [String(item.version), zoneById(historyZone)?.name ?? historyZone])} onDone={() => { setNotice(tr("{0}: rolled back.", [slotLabel(id)])); void queryClient.invalidateQueries({ queryKey: ["live", "content-history"] }); }}>{tr("Roll back to v{0}", [String(item.version)])}</CommandButton></> : <em> · {tr("live now")}</em>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : null}

          {live && id === "legal" ? (
            <Card title={tr("Who has accepted")} icon={<FileCheck size={15} />} tone="green" help={tr("Riders and drivers who accepted the terms, with the version and the time.")}>
              {acceptances.isLoading ? <p className="state-line">{tr("Loading.")}</p> : acceptances.error ? <ErrorLine error={acceptances.error} onRetry={() => void acceptances.refetch()} /> : itemsOf<Acceptance>(acceptances.data).length === 0 ? <p className="dx-calm">{tr("Nobody has accepted yet.")}</p> : (
                <AcceptanceTable rows={itemsOf<Acceptance>(acceptances.data)} />
              )}
            </Card>
          ) : null}

          {live ? null : <Card title={tr("Compare versions")} icon={<GitCompare size={15} />} tone="blue" help={tr("What the draft changes, field by field.")}>
            <label className="gr-field"><span>{tr("Compare the draft with")}</span>
              <select aria-label={tr("Compare with")} value={against ?? ""} onChange={(e) => setAgainst(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{tr("What is live now")}</option>
                {slot.history.map((h) => <option key={h.version} value={h.version}>v{h.version} · {h.action} · {h.actor}</option>)}
              </select>
            </label>
            {!base ? <p className="dx-calm">{tr("Nothing published yet to compare with.")}</p> : diff.length ? (
              <DiffTable rows={diff} />
            ) : <p className="dx-calm">{tr("The draft is the same as this version.")}</p>}
            <ol aria-label={tr("Content history")} className="gr-events">{slot.history.map((h) => <li key={h.version}>v{h.version} · {h.action} · {h.actor} · {h.at} · {h.text.en}</li>)}</ol>
          </Card>}
        </div>

        <aside className="gr-phone" aria-label={tr("Phone preview")}>
          <h3><Smartphone size={15} aria-hidden="true" /> {tr("Phone preview")}</h3>
          <Choice label={tr("Phone size")} value={phone} options={PHONES.map((item) => ({ id: item.id, label: tr(item.label as Parameters<typeof tr>[0]) }))} onChange={setPhone} />
          <Choice label={tr("Preview language")} value={lang} options={[{ id: "sv", label: tr("Swedish") }, { id: "fr", label: tr("French") }, { id: "en", label: tr("English") }]} onChange={setLang} />
          <div className="gr-phone-frame" style={{ width: size.width, minHeight: size.height }}>
            <span className="gr-phone-bar" />
            {imageSrc ? <img className={`gr-phone-img ${extra.image?.fit ?? "fill"}`} src={imageSrc} alt="" /> : null}
            <div className="gr-phone-card">
              <p><b>{text.title}</b></p>
              <p>{text[lang]}</p>
            </div>
          </div>
          {live ? <p className="gr-help"><PublishTargetsLine zoneIds={targets} /></p> : <p className="gr-help">{trn("Shown in {0}{1}.", extra.countries.length === MARKETS.length ? tr("every country") : MARKETS.filter((item) => extra.countries.includes(item.id)).map((item) => item.name).join(", ") || tr("no country"), extra.zones.length ? tr(", {0} zone{1}", [extra.zones.length, extra.zones.length > 1 ? "s" : ""]) : "")}</p>}
          {live ? null : <p className="gr-help">{trn("Published: {0}", slot.published?.en ?? tr("No publication"))}</p>}
        </aside>
      </div>
      )}
    </div>
  );
}
