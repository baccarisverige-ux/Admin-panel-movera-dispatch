import { useMemo, useState, type ReactNode } from "react";
import { Bell, Mail, MessageSquare, MonitorSmartphone, Printer, Send, Smartphone, X } from "lucide-react";
import { market, type MarketId } from "../markets/markets";
import { NumberField } from "../pricing/NumberField";
import { CommandButton } from "../ui/CommandButton";
import { useDialogFocus } from "../ui/useDialogFocus";
import { CARE_KEY, SEND_CHANNELS, parseEmails, promoMessage, sendPromotion, setPopup, type PromoTicket, type RiderCare, type SendChannel } from "./care";
import { PromoFlyer } from "./PromoFlyer";
import { RiderAppPreview } from "./RiderAppPreview";
import { AUDIENCE_KINDS, pickAudience, type AudienceKind, type RiderRow } from "./segments";
import { useCategoryPrices } from "./useCategoryPrices";
import { tr, trn, trx, trSentences } from "../i18n";

const CHANNEL_ICON: Record<SendChannel, ReactNode> = {
  push: <Bell size={16} aria-hidden="true" />,
  inapp: <MessageSquare size={16} aria-hidden="true" />,
  popup: <MonitorSmartphone size={16} aria-hidden="true" />,
  sms: <Smartphone size={16} aria-hidden="true" />,
  email: <Mail size={16} aria-hidden="true" />,
};

type To = "holders" | AudienceKind | "emails";

type Props = {
  ticket: PromoTicket;
  care: RiderCare;
  rows: RiderRow[];
  country: MarketId;
  agentId: string | null;
  canEdit: boolean;
  now: number;
  onClose: () => void;
  onNotice: (text: string) => void;
};

/** Send a promotion code (push, app message, popup, SMS, email) or make a flyer. Two clear steps, one window. */
export function PromoShare({ ticket, care, rows, country, agentId, canEdit, now, onClose, onNotice }: Props) {
  const root = useDialogFocus(true, onClose);
  const locale = market(country).locale;
  const prices = useCategoryPrices(country);
  const [tab, setTab] = useState<"send" | "flyer">("send");
  const [channels, setChannels] = useState<SendChannel[]>(["push", "inapp"]);
  const [to, setTo] = useState<To>(ticket.audience === "code" ? "all" : "holders");
  const [count, setCount] = useState(20);
  const [seed, setSeed] = useState(1);
  const [emailText, setEmailText] = useState("");
  const [subject, setSubject] = useState(`${ticket.title} · code ${ticket.code}`);
  const [message, setMessage] = useState(() => promoMessage(ticket, locale));

  const riders = useMemo(() => {
    if (to === "emails") return [];
    if (to === "holders") return rows.filter((row) => ticket.riderIds.includes(row.rider.id) && !row.segments.has("blocked"));
    return pickAudience(rows, to, count, seed);
  }, [rows, to, count, seed, ticket.riderIds]);
  const emails = parseEmails(emailText);
  const usedChannels = to === "emails" ? channels.filter((channel) => channel === "email") : channels;
  const result = agentId ? sendPromotion(care, ticket.id, { channels: usedChannels, riders: riders.map((row) => row.rider), emails: channels.includes("email") ? emails.valid : [], subject, message }, agentId, now) : { care, error: "Sign in again." };
  const reach = riders.length + (channels.includes("email") ? emails.valid.length : 0);
  const toggle = (id: SendChannel) => setChannels(channels.includes(id) ? channels.filter((item) => item !== id) : [...channels, id]);
  const pick = AUDIENCE_KINDS.find((item) => item.id === to);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div ref={root} tabIndex={-1} className="modal open" role="dialog" aria-modal="true" aria-label={tr("Send and share {0}", [ticket.code])}>
      <div className="modal-card rd-modal rd-share">
        <div className="rd-builder-head">
          <h3>{trn("Send and share {0}", <span className="rd-share-code">{ticket.code}</span>)}</h3>
          <button data-command="admin.confirm.cancel" type="button" className="icon-ghost" aria-label={tr("Close")} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="dash-tabs small" role="tablist" aria-label={tr("Share options")}>
          <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={tab === "send"} className={tab === "send" ? "active" : undefined} onClick={() => setTab("send")}>{trn("{0} Send the code", <Send size={14} aria-hidden="true" />)}</button>
          <button data-command="admin.ui.quickAction" type="button" role="tab" aria-selected={tab === "flyer"} className={tab === "flyer" ? "active" : undefined} onClick={() => setTab("flyer")}>{trn("{0} Flyer", <Printer size={14} aria-hidden="true" />)}</button>
        </div>

        {tab === "flyer" ? <PromoFlyer promo={ticket} locale={locale} /> : (
          <div className="rd-share-body">
            <div className="rd-share-steps">
              <section className="rd-step" aria-labelledby="step-how">
                <h4 id="step-how">{trn("{0} How", <i>1</i>)}</h4>
                <div className="rd-channels">
                  {SEND_CHANNELS.map((item) => (
                    <label key={item.id} className={channels.includes(item.id) ? "rd-channel on" : "rd-channel"}>
                      <input type="checkbox" aria-label={trx(item.label)} checked={channels.includes(item.id)} onChange={() => toggle(item.id)} />
                      {CHANNEL_ICON[item.id]}
                      <span><b>{trx(item.label)}</b><small>{trx(item.hint)}</small></span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="rd-step" aria-labelledby="step-who">
                <h4 id="step-who">{trn("{0} To who", <i>2</i>)}</h4>
                <div className="rd-form-grid">
                  <label className="field">{trn("Riders{0}", <select aria-label={tr("Send to")} value={to} onChange={(event) => setTo(event.target.value as To)}>
                      {ticket.audience === "code" ? null : <option value="holders">{tr("Riders who have this promotion")}</option>}
                      {AUDIENCE_KINDS.map((item) => <option key={item.id} value={item.id}>{trx(item.label)}</option>)}
                      <option value="emails">{tr("Only email addresses")}</option>
                    </select>)}</label>
                  {pick?.count ? <label className="field">{trn("How many{0}", <NumberField label={tr("Number of riders")} value={count} unit="riders" max={10000} onChange={(value) => setCount(Math.max(1, Math.round(value)))} />)}</label> : null}
                </div>
                {to === "random" ? <button data-command="admin.riders.select" type="button" className="dash-btn small ghost" onClick={() => setSeed(seed + 1)}>{tr("Pick other random riders")}</button> : null}
                {to !== "emails" ? (
                  <p className="rd-share-who" aria-live="polite">{trn("{0} rider{1}{2}", <b>{riders.length}</b>, riders.length === 1 ? "" : tr("s"), riders.length ? `: ${riders.slice(0, 4).map((row) => row.rider.name).join(", ")}${riders.length > 4 ? ` and ${riders.length - 4} more` : ""}` : "")}</p>
                ) : null}
                {channels.includes("email") ? (
                  <label className="field">{to === "emails" ? tr("Email addresses") : tr("Extra email addresses (optional)")}
                    <textarea aria-label={tr("Email addresses")} rows={3} value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder={tr("anna@mail.com, omar@mail.com")} />
                    <small className="fine">{trn("{0} valid{1}", emails.valid.length, emails.invalid.length ? tr(" · {0} not valid: {1}", [emails.invalid.length, emails.invalid.slice(0, 3).join(", ")]) : "")}</small>
                  </label>
                ) : to === "emails" ? <p className="rd-form-error">{tr("Tick Email above to send to email addresses.")}</p> : null}
              </section>

              <section className="rd-step" aria-labelledby="step-what">
                <h4 id="step-what">{trn("{0} Message", <i>3</i>)}</h4>
                {channels.includes("email") ? <label className="field">{trn("Email subject{0}", <input aria-label={tr("Email subject")} value={subject} onChange={(event) => setSubject(event.target.value)} />)}</label> : null}
                <label className="field">{trn("Text riders get{0}{1}", <textarea aria-label={tr("Promotion message")} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} />, <small className="fine">{trn("{0} characters{1}", message.length, channels.includes("sms") ? tr(" · {0} SMS each", [Math.max(1, Math.ceil(message.length / 160))]) : "")}</small>)}</label>
                <button data-command="admin.ui.quickAction" type="button" className="dash-btn small ghost" onClick={() => setMessage(promoMessage(ticket, locale))}>{tr("Reset text")}</button>
              </section>
            </div>

            <aside className="rd-share-side">
              {channels.includes("popup") || ticket.popup ? <RiderAppPreview promo={ticket} prices={prices.rows} zoneName={prices.zoneName} popup /> : (
                <div className="rd-push-preview" aria-label={tr("Push preview")}>
                  <span className="rd-push-app">{tr("MOVERA · now")}</span>
                  <b>{trx(ticket.title)}</b>
                  <span>{trSentences(message)}</span>
                </div>
              )}
              {ticket.popup ? (
                <div className="rd-popup-line">
                  <span>{trn("{0} Popup is on", <MonitorSmartphone size={14} aria-hidden="true" />)}</span>
                  <CommandButton command="admin.riders.promoPopup" className="dash-btn small ghost" targetId={ticket.code} confirmTarget={false} scope="all" before="on" after="off" expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={setPopup(care, ticket.id, false)} disabled={!canEdit} onDone={() => onNotice(tr("Popup for {0} turned off.", [ticket.code]))}>{tr("Turn popup off")}</CommandButton>
                </div>
              ) : null}
              {result.error ? <p className="rd-form-error" role="alert">{trSentences(result.error)}</p> : null}
              <CommandButton command="admin.riders.promoSend" className="dash-btn publish" targetId={ticket.code} confirmTarget={false} scope="all" before="" after={`${usedChannels.join(", ")} to ${reach}`} expectedSliceRev={care.draftRev} sliceKey={CARE_KEY} value={result.care} disabled={!canEdit || Boolean(result.error)} title={result.error} onDone={() => { onNotice(tr("{0} sent to {1} by {2}.", [ticket.code, reach, usedChannels.map((id) => SEND_CHANNELS.find((item) => item.id === id)?.label.toLowerCase()).join(", ")])); onClose(); }}>{trn("{0} Send to {1}", <Send size={15} aria-hidden="true" />, reach)}</CommandButton>
              {ticket.sends?.length ? (
                <div className="rd-sends">
                  <h4>{tr("Sent before")}</h4>
                  <ul aria-label={tr("Sent before")}>
                    {ticket.sends.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <span>{item.channels.map((id) => CHANNEL_ICON[id]).map((icon, index) => <span key={index}>{icon}</span>)}</span>
                        <span>{trn("{0} riders{1}", item.riders, item.emails ? tr(" · {0} emails", [item.emails]) : "")}</span>
                        <small>{date.format(Date.parse(item.at))} · {item.by}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
