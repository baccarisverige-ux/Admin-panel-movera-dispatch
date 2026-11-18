import { useLayoutEffect, useRef } from "react";
import { initialFocusOf, tabTargetOf } from "./dialogFocus";

/** The confirm "!" button (ui/ConfirmInfo.tsx) is marked so the first field gets the dialog's first focus (R18). */
const skipsInitial = (element: HTMLElement) => element.hasAttribute("data-skip-initial-focus");

export function useDialogFocus(open: boolean, onClose: () => void) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    if (!open) return;
    const node = root.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(node.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0);
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        node!.focus();
        return;
      }
      const target = document.activeElement === node && event.shiftKey ? items.at(-1)! : tabTargetOf(items, document.activeElement as HTMLElement | null, event.shiftKey, skipsInitial);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    }
    node.addEventListener("keydown", key);
    (initialFocusOf(focusable(), skipsInitial) ?? node).focus();
    return () => {
      node.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return root;
}
