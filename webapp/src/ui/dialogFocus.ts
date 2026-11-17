/**
 * Dialog focus rules (R18), pure so they are tested without a browser. An element marked `data-skip-initial-focus`
 * (the confirm "!" button, ui/ConfirmInfo.tsx) never takes the dialog's first focus: the first field or control does.
 * It stays in the Tab cycle: Tab from the last control goes to the very first element (the "!" when it leads), and
 * Shift+Tab from the first field (or from the very first element) goes to the last control.
 */
export function initialFocusOf<T>(items: readonly T[], skips: (item: T) => boolean): T | undefined {
  return items.find((item) => !skips(item)) ?? items[0];
}

/** Where Tab (or Shift+Tab) moves to from `active`, or null to let the browser move as usual. */
export function tabTargetOf<T>(items: readonly T[], active: T | null, shift: boolean, skips: (item: T) => boolean): T | null {
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return null;
  if (shift) return active === first || active === initialFocusOf(items, skips) ? last : null;
  return active === last ? first : null;
}
