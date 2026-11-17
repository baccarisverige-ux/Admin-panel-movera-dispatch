import { createElement as h, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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

/**
 * The hover title and accessible description: the translated "Info" word plus the setting's (already translated) label.
 * It is never the accessible name: a name containing the label made getByLabel(<label>) find the "i" as well as the
 * field (PR #345 CI, 43 e2e tests). The name is the bare "Info" word (settingInfoName); screen readers still hear the
 * setting through the description.
 */
export function settingInfoLabel(label: string | undefined): string {
  return label ? `${tr("Info")}: ${label}` : tr("Info");
}

/** The button's and the card's accessible name: only the translated "Info" word (never the field label). */
export function settingInfoName(): string {
  return tr("Info");
}


/** The text a <label> shows for its field, without the "i" and without other controls inside it. */
export function labelOwnText(label: Element): string {
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.classList.contains("setting-info") || node.getAttribute("aria-hidden") === "true") return;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION)$/.test(node.tagName)) return;
    node.childNodes.forEach(walk);
  };
  label.childNodes.forEach(walk);
  return text.replace(/\s+/g, " ").trim();
}

/** Marks a field name this component set, so it updates or removes only its own (never one the page gave). */
const OWN_NAME = "data-info-name";

/**
 * Inside a <label> the "i" must not change the field's name (PR #345 CI: getByLabel / getByRole with the exact label
 * missed the field). The "i" is a span with role="button", so the label still labels its field (a <button> is
 * labelable and would take the label), and the field gets the label's own text as its name when the page gave none.
 */
function useFieldKeepsItsName(wrap: { current: HTMLSpanElement | null }, label: string | undefined) {
  useLayoutEffect(() => {
    const owner = wrap.current?.closest("label");
    const field = owner?.control;
    if (!owner || !field) return;
    if (field.hasAttribute("aria-labelledby") || (field.hasAttribute("aria-label") && !field.hasAttribute(OWN_NAME))) return;
    const name = labelOwnText(owner);
    if (!name) return;
    field.setAttribute("aria-label", name);
    field.setAttribute(OWN_NAME, "");
    return () => {
      if (field.hasAttribute(OWN_NAME) && field.getAttribute("aria-label") === name) {
        field.removeAttribute("aria-label");
        field.removeAttribute(OWN_NAME);
      }
    };
  }, [wrap, label]);
}

export function SettingInfo({ id, label, defaultOpen = false }: { id: string; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState<SettingInfoText | undefined>(() => settingInfoText(id));
  const popId = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = (event: InfoEvent) => setOpen((current) => nextInfoOpen(current, event));
  useFieldKeepsItsName(wrap, label);

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

  const name = settingInfoName();
  const description = settingInfoLabel(label);
  return h(
    "span",
    { className: "setting-info", ref: wrap, "data-info": id },
    h(
      // A span with the button role, not a <button>: inside a <label> a <button> would take the label from its field.
      "span",
      {
        role: "button",
        tabIndex: 0,
        ref: button,
        className: "setting-info-btn",
        "aria-label": name,
        "aria-expanded": open,
        "aria-controls": open ? popId : undefined,
        title: description,
        onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
          // A Row's label wraps its switch: the "i" must never toggle the setting.
          event.preventDefault();
          event.stopPropagation();
          step("toggle");
        },
        onKeyDown: (event: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
          if (event.key !== "Enter" && event.key !== " ") return;
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
          { id: popId, ref: card, className: "setting-info-card", role: "dialog", "aria-label": name, title: description, tabIndex: -1, lang: "en" },
          h("div", { className: "setting-info-head" }, h("b", null, label ?? ""), h("span", { role: "button", tabIndex: 0, className: "setting-info-close", "aria-label": tr("Close"), onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => { event.preventDefault(); event.stopPropagation(); step("close"); button.current?.focus(); }, onKeyDown: (event: { key: string; preventDefault: () => void; stopPropagation: () => void }) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); event.stopPropagation(); step("close"); button.current?.focus(); } }, "×")),
          text
            ? h("dl", null, ...partsCache.flatMap((part) => [h("dt", { key: `${part.key}-t` }, part.title), h("dd", { key: `${part.key}-d` }, text[part.key])]))
            : h("p", { className: "setting-info-wait" }, "…"),
        )
      : null,
  );
}
