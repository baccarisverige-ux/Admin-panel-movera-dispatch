import { createElement, Fragment, type ReactNode } from "react";
import { currentLanguage, translate, type MessageKey } from "./core.ts";

/**
 * Translate a text with parts that are not plain text (a link, a bold name, an icon): the template has {0}, {1}…
 * and each part is put in its place, so a translation can move them around.
 */
export function trn(key: MessageKey, ...parts: ReactNode[]): ReactNode {
  const text = translate(currentLanguage(), key);
  const pieces: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{(\d+)\}/g)) {
    const index = Number(match[1]);
    if (match.index > last) pieces.push(text.slice(last, match.index));
    pieces.push(index < parts.length ? parts[index] : match[0]);
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return createElement(Fragment, null, ...pieces);
}
