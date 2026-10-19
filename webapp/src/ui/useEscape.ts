import { useEffect, useRef } from "react";

/**
 * Escape closes a non-modal panel (Test a ride, the dashboard driver and rider panels). It listens on window,
 * after document-level popovers (alert bell, country menu) and modal dialogs, which mark the key as handled
 * with preventDefault, so one Escape closes only the topmost thing.
 */
export function useEscape(onClose: () => void, enabled = true) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
