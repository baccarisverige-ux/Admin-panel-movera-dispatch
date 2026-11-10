import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { tr, trn } from "../i18n";
import { useLiveSessionMaybe } from "./LiveSessionContext";
import { ErrorLine } from "./ui";
import { PERSON_MESSAGE_MAX, personMessageProblem, sendPersonMessage, type PersonKind } from "./adminChats";

/**
 * v0.18.56 §78 (G9 part 2, G9-2.12, owner g9 Q5): live "Message driver" / "Message rider". POST
 * /admin/drivers|riders/{id}/message (support.reply + the person's zone) opens a support ticket the person sees in the
 * app's Support inbox and answers there. No push yet (G13, IN-OTHER.1): the person sees it on the next open of Support.
 */
export function LiveMessagePerson({ kind, id, name }: { kind: PersonKind; id: string; name: string }) {
  const session = useLiveSessionMaybe();
  const allowed = session?.can("support.reply") ?? false;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const problem = personMessageProblem(text);
  async function send() {
    if (!session || busy || problem) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const ticket = await sendPersonMessage((path, body) => session.client.post<{ ticketId?: string }>(path, body), kind, id, text);
      setText("");
      setNotice(tr("Sent to {0}'s Support inbox in the app{1}.", [name, ticket?.ticketId ? ` (${ticket.ticketId})` : ""]));
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const label = kind === "driver" ? tr("Message driver") : tr("Message rider");
  return (
    <section className="fd-box" data-testid={`live-message-${kind}`}>
      <h3>{trn("{0} Message", <MessageSquare size={16} aria-hidden="true" />)}</h3>
      {!allowed ? <p className="fine">{tr("Your role cannot send messages (Answer support).")}</p> : (
        <>
          <small className="fine">{tr("Opens a support ticket in the person's Support inbox in the app. They answer there; the answer comes to Support.")}</small>
          <label className="field"><span>{label}</span><textarea aria-label={label} value={text} maxLength={PERSON_MESSAGE_MAX} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
          {error ? <ErrorLine error={error} onRetry={() => setError(null)} /> : null}
          {kind === "driver"
            ? <button type="button" className="primary-btn" data-command="admin.driver.message" disabled={busy || Boolean(problem)} title={problem ?? undefined} onClick={() => void send()}>{tr("Send")}</button>
            : <button type="button" className="primary-btn" data-command="admin.rider.message" disabled={busy || Boolean(problem)} title={problem ?? undefined} onClick={() => void send()}>{tr("Send")}</button>}
          {notice ? <p role="status">{notice}</p> : null}
        </>
      )}
    </section>
  );
}
