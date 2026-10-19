import { useLayoutEffect, useRef } from "react";

/**
 * Escape closes a non-modal panel (Test a ride, the dashboard driver and rider panels). It listens on window,
 * after document-level popovers (alert bell, country menu) and modal dialogs, which mark the key as handled
 * with preventDefault, so one Escape closes only the topmost thing.
 */
export function useEscape(onClose: () => void, enabled = true) {
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  }, [onClose]);
  // Layout effect: the listener is in place before the panel is painted, so an Escape pressed the moment it
  // appears is not missed.
  useLayoutEffect(() => {
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
