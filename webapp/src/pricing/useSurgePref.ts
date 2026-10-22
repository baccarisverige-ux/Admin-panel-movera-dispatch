import { useState } from "react";
import { isSurgeStyle, type SurgeStyle } from "./surgeGeo.ts";

/** Each map remembers whether the surge layer is on and which style the admin picked. */
export function useSurgePref(key: string, defaults: { shown: boolean; style: SurgeStyle }) {
  const storageKey = `movera-admin-surge-${key}`;
  const [pref, setPref] = useState<{ shown: boolean; style: SurgeStyle }>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "null") as { shown?: unknown; style?: unknown } | null;
      if (raw && typeof raw.shown === "boolean" && isSurgeStyle(raw.style)) return { shown: raw.shown, style: raw.style };
    } catch {
      // Private mode or blocked storage: fall back to the defaults.
    }
    return defaults;
  });
  function save(next: { shown: boolean; style: SurgeStyle }) {
    setPref(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Not remembered this time; the choice still applies on this page.
    }
  }
  return {
    shown: pref.shown,
    style: pref.style,
    setShown: (shown: boolean) => save({ ...pref, shown }),
    setStyle: (style: SurgeStyle) => save({ ...pref, style, shown: true }),
  };
}
