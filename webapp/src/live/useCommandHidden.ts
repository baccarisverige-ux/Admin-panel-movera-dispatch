import { useLiveSessionMaybe } from "./LiveSessionContext";
import { liveHandles } from "./liveCommands";

/**
 * C10 (audit A16 §2, D1/D4/D9/D10/D11): true on live when CommandButton hides this command's Save
 * (`live && !liveHandles(command)`), so the editor's opener is hidden the same way (hide only, Rule 21).
 */
export function useCommandHidden(command: string): boolean {
  const live = useLiveSessionMaybe();
  return Boolean(live) && !liveHandles(command);
}
