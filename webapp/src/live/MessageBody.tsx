import type { TripMessage } from "./LiveChat";
import { translationLines } from "./tripChat";

/**
 * v0.18.66 §87 (owner 2026-11-11 "Original + translation"): a trip chat message as the admin sees it: the text as
 * written, then each translation the server already keeps (Message.translations) in smaller grey text with its
 * language. Read-only, no translate button.
 */
export function MessageBody({ message }: { message: TripMessage }) {
  return (
    <>
      <span>{message.text}</span>
      {translationLines(message).map((line, index) => (
        <small key={`${line.lang}-${index}`} className="op-chat-tr" lang={line.lang} data-testid="chat-translation"><b>{line.label}</b>{line.text}</small>
      ))}
    </>
  );
}
