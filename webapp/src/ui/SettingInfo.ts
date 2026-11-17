import { createElement as h, useEffect, useId, useRef, useState } from "react";
import { tr } from "../i18n/core.ts";

/**
 * The small "i" next to every admin setting (owner 2026-11-16: "Also add next to any setting in all admin panel small i
 * for info when clic it show what this setting for and where can apply and all explanation !"; "the i make it white
 * inside blue circle"; texts "Make it only english"). Record: Rules audits/impact/admin-setting-help.md.
 * A tap (or Enter / Space) opens a short card in six parts (owner 2026-11-16 "Add info details in i"): the exact effect,
 * who and where it affects, unit and allowed range, the default, a concrete example, and what happens at the extremes. Escape, the close button, a second tap or a tap outside closes it. The English texts load on first open
 * (settingInfoTexts.ts), so the first page load does not carry them. Written without JSX so node tests can render it.
 */

export type SettingInfoText = {
  /** The exact effect: what the setting does. */
  what: string;
  /** Who it affects (riders / drivers / admins) and where: country Standard or zone, which apps. */
  where: string;
  /** Unit and allowed range. */
  range: string;
  /** The default value (the code default). */
  default: string;
  /** One concrete example. */
  example: string;
  /** What happens at the lowest and the highest value (or at off and on). */
  extremes: string;
};

export type SettingInfoTexts = Readonly<Record<string, SettingInfoText>>;

export type SettingInfoPart = { key: keyof SettingInfoText; title: string };

let cache: SettingInfoTexts | null = null;
let partsCache: readonly SettingInfoPart[] = [];
let loading: Promise<SettingInfoTexts> | null = null;

/** Loads the English info texts once (a separate file in the build). */
export function loadSettingInfoTexts(): Promise<SettingInfoTexts> {
  if (cache) return Promise.resolve(cache);
  loading ??= import("./settingInfoTexts.ts").then((module) => {
    partsCache = module.SETTING_INFO_PARTS;
    return (cache = module.SETTING_INFO);
  });
  return loading;
}

/** The text of one setting once loaded; undefined before the first load or for an unknown id. */
export function settingInfoText(id: string): SettingInfoText | undefined {
  return cache?.[id];
}

/** Open / closed: the whole state of the card, as plain steps so a test can walk them. */
export type InfoEvent = "toggle" | "escape" | "outside" | "close";
export function nextInfoOpen(open: boolean, event: InfoEvent): boolean {
  return event === "toggle" ? !open : false;
}

/** The button's accessible name: the translated "Info" word plus the setting's (already translated) label. */
export function settingInfoLabel(label: string | undefined): string {
  return label ? `${tr("Info")}: ${label}` : tr("Info");
}


export function SettingInfo({ id, label, defaultOpen = false }: { id: string; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState<SettingInfoText | undefined>(() => settingInfoText(id));
  const popId = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = (event: InfoEvent) => setOpen((current) => nextInfoOpen(current, event));

  useEffect(() => {
    if (!open || text) return;
    let alive = true;
    void loadSettingInfoTexts().then((texts) => alive && setText(texts[id])).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, text, id]);

  useEffect(() => {
    if (!open) return;
    card.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      step("escape");
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) step("outside");
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  const name = settingInfoLabel(label);
  return h(
    "span",
    { className: "setting-info", ref: wrap, "data-info": id },
    h(
      "button",
      {
        type: "button",
        ref: button,
        className: "setting-info-btn",
        "aria-label": name,
        "aria-expanded": open,
        "aria-controls": open ? popId : undefined,
        title: name,
        onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
          // A Row's label wraps its switch: the "i" must never toggle the setting.
          event.preventDefault();
          event.stopPropagation();
          step("toggle");
        },
      },
      h("span", { className: "setting-info-dot", "aria-hidden": true }, "i"),
    ),
    open
      ? h(
          "div",
          { id: popId, ref: card, className: "setting-info-card", role: "dialog", "aria-label": name, tabIndex: -1, lang: "en" },
          h("div", { className: "setting-info-head" }, h("b", null, label ?? ""), h("button", { type: "button", className: "setting-info-close", "aria-label": tr("Close"), onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => { event.preventDefault(); event.stopPropagation(); step("close"); button.current?.focus(); } }, "×")),
          text
            ? h("dl", null, ...partsCache.flatMap((part) => [h("dt", { key: `${part.key}-t` }, part.title), h("dd", { key: `${part.key}-d` }, text[part.key])]))
            : h("p", { className: "setting-info-wait" }, "…"),
        )
      : null,
  );
}
