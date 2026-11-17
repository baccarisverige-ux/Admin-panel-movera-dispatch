/**
 * Owner 2026-11-16: "Also add next to any setting in all admin panel small i for info when clic it show what this setting
 * for and where can apply and all explanation !" (Rules audits/impact/admin-setting-help.md).
 * A small JSX scanner for the inventory test (settingInfo.test.ts): it finds every editable field in a settings file and
 * says which "i" (SettingInfo) explains it. Plain text in, plain data out; no file access here.
 *
 * A field is covered when
 *   1. its own tag has info="<id>" (NumberField, Num, Row, Switch, Choice, Check, Card take the prop), or
 *   2. it sits inside the opening tag of an element with info= (a Card's aside switch), or
 *   3. it sits inside an element (not a Card) whose opening tag has info= (a Row covers its numbers), or
 *   4. a <SettingInfo id="<id>"> stands on the same line or up to 3 lines before or after it (raw inputs), or
 *   5. an `info-at: <id>` comment on its line or the line before names the "i" shown once for a table row or column
 *      (the test checks that <SettingInfo id="<id>"> is in the same file).
 * A field that is not a setting (a search box, a test-ride input, a note typed in a dialog) carries an
 * `info-skip: <reason>` comment on its line or the line before; the test lists those too.
 */

export type ScannedField = {
  line: number;
  tag: string;
  /** The field's label (label=, aria-label= or title=), as written in the source. */
  label: string;
  /** The info id that explains it; "" when the info id is built at run time (checked by prefix); null when none. */
  info: string | null;
  skip: string | null;
};

const EDITABLE = new Set(["NumberField", "Num", "Switch", "Choice", "Check", "input", "select", "textarea", "DateInput", "SurgeSlider", "AmountList", "Toggle", "Texts", "OptionalMoney", "TextTriple"]);
const NOT_SETTINGS_INPUT = /\btype=["'](hidden|search|file)["']|\sreadOnly[\s/>]/;

type Open = { name: string; start: number; end: number; selfClosing: boolean; text: string };

/** The end (index after '>') of the opening tag that starts at `from` ('<'), skipping braces and strings. */
function tagEnd(source: string, from: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  let quote: string | null = null;
  for (let at = from + 1; at < source.length; at += 1) {
    const char = source[at];
    if (quote) {
      if (char === "\\") at += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return { end: at + 1, selfClosing: source[at - 1] === "/" };
  }
  return { end: source.length, selfClosing: true };
}

/** True when '<' at `at` starts JSX (not a generic like useState<string> or a comparison a < b). */
function startsJsx(source: string, at: number): boolean {
  let back = at - 1;
  while (back >= 0 && /\s/.test(source[back])) back -= 1;
  if (back < 0) return true;
  const before = source[back];
  if (/[\w$)\].]/.test(before)) {
    const word = /(\w+)$/.exec(source.slice(Math.max(0, back - 8), back + 1))?.[1];
    return word === "return";
  }
  return true;
}

function attr(text: string, name: string): string | null {
  const plain = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`).exec(text);
  if (plain) return plain[1] ?? plain[2] ?? "";
  const braced = new RegExp(`\\s${name}=\\{`).exec(text);
  if (!braced) return null;
  let depth = 0;
  const from = braced.index + braced[0].length - 1;
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === "{") depth += 1;
    else if (text[at] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(from + 1, at).trim();
    }
  }
  return null;
}

/** The info id of an info={…} / id={…} value: a literal id, "prefix.*" for a template, "" for any other expression, null for none. */
function idOf(value: string | null): string | null {
  if (value === null) return null;
  const literal = /^(?:"([^"]+)"|'([^']+)'|`([^`$]+)`)$/.exec(value);
  if (literal) return literal[1] ?? literal[2] ?? literal[3];
  // A template id built from a list (`dispatch.factor.${factor.id}`): its fixed start plus "*"; the test checks the list.
  const built = /^`([\w.-]+\.)\$\{[^`]*\}`$/.exec(value);
  if (built) return `${built[1]}*`;
  if (/^[\w.-]+$/.test(value) && value.includes(".")) return value;
  return "";
}

/** Every "i" a file shows: <SettingInfo id=…> and info=… props (fixed ids, and "prefix.*" for built ones). */
export function shownInfoIds(source: string): string[] {
  const shown = [
    ...source.matchAll(/<SettingInfo\s[^>]*?\bid=(\{`[^`]*`\}|"[^"]*"|\{"[^"]*"\})/g),
    ...source.matchAll(/\sinfo=(\{`[^`]*`\}|"[^"]*")/g),
  ];
  return shown.map((match) => idOf(match[1].replace(/^\{|\}$/g, "")) ?? "");
}

export function scanSettingFields(source: string): ScannedField[] {
  const lines = source.split("\n");
  const lineOf = (index: number) => source.slice(0, index).split("\n").length;
  const infoLines = new Map<number, string>();
  const fields: ScannedField[] = [];
  const stack: Open[] = [];
  const owners: Open[] = [];
  const tagPattern = /<\/?([A-Za-z][\w.]*)/g;
  for (const found of source.matchAll(/<SettingInfo\b/g)) {
    const id = idOf(attr(source.slice(found.index, tagEnd(source, found.index).end), "id"));
    // A component's own <SettingInfo id={info}> (an id passed in) explains its user's field, not a field next to it.
    if (id) infoLines.set(lineOf(found.index), id);
  }
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(source))) {
    const at = match.index;
    const closing = source[at + 1] === "/";
    const name = match[1];
    if (!closing && !startsJsx(source, at)) continue;
    if (closing) {
      const index = stack.map((open) => open.name).lastIndexOf(name);
      if (index >= 0) stack.length = index;
      continue;
    }
    const { end, selfClosing } = tagEnd(source, at);
    const text = source.slice(at, end);
    const line = lineOf(at);
    // Still inside an earlier opening tag (an aside={…} prop): that tag is the "attribute owner".
    const owner = [...owners].reverse().find((open) => at > open.start && at < open.end);
    const isRowWithSwitch = name === "Row" && /\sonToggle=/.test(text);
    if (EDITABLE.has(name) || isRowWithSwitch) {
      if (!(name === "input" && NOT_SETTINGS_INPUT.test(text))) {
        const nearby = lines.slice(Math.max(0, line - 2), line).join("\n") + "\n" + text;
        const skip = /info-skip:\s*([^*}\n]+)/.exec(nearby)?.[1].trim() ?? null;
        // A table cell explained once by its row header's "i": {/* info-at: <id> */} on its line or the line before.
        const named = /info-at:\s*([\w.*-]+)/.exec(nearby)?.[1] ?? null;
        let info = idOf(attr(text, "info")) ?? named;
        if (info === null && owner) info = idOf(attr(owner.text, "info"));
        if (info === null) {
          const body = [...stack].reverse().find((open) => open.name !== "Card" && at >= open.end && idOf(attr(open.text, "info")) !== null);
          if (body) info = idOf(attr(body.text, "info"));
        }
        if (info === null) {
          for (const near of [0, 1, 2, 3, -1, -2, -3]) info ??= infoLines.get(line + near) ?? null;
        }
        const label = attr(text, "label") ?? attr(text, "aria-label") ?? attr(text, "title") ?? "";
        fields.push({ line, tag: name, label, info, skip: info === null ? skip : null });
      }
    }
    const open = { name, start: at, end, selfClosing, text };
    // Every opening tag owns the tags written inside its props (a Card's aside={<Switch … />}), self-closing or not.
    if (end - at > name.length + 3) owners.push(open);
    if (!selfClosing) stack.push(open);
  }
  return fields;
}
