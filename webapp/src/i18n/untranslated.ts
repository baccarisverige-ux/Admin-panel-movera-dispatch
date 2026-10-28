import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * Finds texts an admin reads that are written in English in the code instead of going through tr()/trx():
 * JSX text, string values of user-facing props (placeholder, title, aria-label, label…), strings put straight in
 * JSX, notices (notify/toast) and CSV headers. Used by untranslated.test.ts; a finding is a bug (sv/fr/en always).
 */
export type Finding = { file: string; line: number; text: string; where: string };

/** Props whose string value is read by a person. */
export const TEXT_PROPS = new Set([
  "placeholder", "title", "aria-label", "aria-description", "alt", "label", "ariaLabel", "summary", "hint", "help",
  "heading", "subtitle", "caption", "emptyText", "empty", "confirmLabel", "description", "tooltip", "legend",
]);

/** Calls whose first text argument is shown to a person. */
export const NOTICE_CALLS = new Set(["notify", "toast", "showToast", "setNotice", "onNotice", "setToast", "setCopied", "onRestored", "flash"]);

/** Calls that translate: what is inside them is fine. */
const TRANSLATING = new Set(["tr", "trx", "trn", "trSentences", "translate"]);

/** Words that stay the same in every language: brand and product names, units, codes. */
export const ALLOW = new Set([
  "Movera", "Movera Admin", "Google", "Google Maps", "MapLibre", "OpenStreetMap", "Stripe", "Swish", "Klarna", "Apple Pay",
  "Google Pay", "Visa", "Mastercard", "iOS", "Android", "SMS", "API", "CSV", "JSON", "PDF", "QR", "ID", "OK", "km", "min",
  "km/h", "kr", "SEK", "EUR", "TND", "€", "h", "s", "m", "x", "×", "WhatsApp", "FR", "SV", "EN",
  "SE", "TN", "XL", "GPS", "VAT", "PIN", "IBAN", "BIC", "URL", "UTC", "ms", "MB", "kB", "px", "%", "SOS", "OTP",
]);

/** A text that needs a translation: it has a word, and is not an id, a code, a symbol or a brand. */
export function needsTranslation(raw: string): boolean {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || ALLOW.has(text)) return false;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(text)) return false; // symbols, numbers, "·", "→", "#"
  if (/^[A-Z0-9_.\-:/#]+$/.test(text)) return false; // codes and ids: SE-STO, D0042, TRIP_42
  if (/^[a-z0-9]+([_.\-:/][a-z0-9]+)+$/.test(text)) return false; // keys: rider_support, admin.zone.update
  if (/^(https?:|mailto:|tel:|\/|\.\/|#)/.test(text)) return false; // links and paths
  if (/^[\w.+-]+@[\w.-]+$/.test(text)) return false; // an e-mail address
  if (text.split(/[\s·,/]+/).filter(Boolean).every((word) => ALLOW.has(word) || !/[A-Za-zÀ-ÿ]{2,}/.test(word))) return false;
  return true;
}

function isInsideTranslation(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
    if (ts.isCallExpression(at)) {
      const callee = at.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (TRANSLATING.has(name)) return true;
    }
    if (ts.isJsxElement(at) || ts.isJsxSelfClosingElement(at) || ts.isFunctionLike(at)) return false;
  }
  return false;
}

/** The texts a value can end up as: "A", `B ${x}`, c ? "D" : "E", f ?? "G". */
function textsOf(expression: ts.Expression): ts.Node[] {
  if (ts.isParenthesizedExpression(expression)) return textsOf(expression.expression);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression];
  if (ts.isTemplateExpression(expression)) return [expression];
  if (ts.isConditionalExpression(expression)) return [...textsOf(expression.whenTrue), ...textsOf(expression.whenFalse)];
  if (ts.isBinaryExpression(expression)) {
    const op = expression.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return textsOf(expression.right);
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return textsOf(expression.right);
  }
  return [];
}

function literalText(node: ts.Node, source: ts.SourceFile): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  return node.getText(source);
}

/** useCsv(onCsv, { name, head: [...], rows }): the head of a report's CSV file. */
function isCsvCall(node: ts.Node | undefined): boolean {
  return Boolean(node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useCsv");
}

export function scanSource(file: string, code: string, known?: ReadonlySet<string>): Finding[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const add = (node: ts.Node, where: string, text = literalText(node, source)) => {
    if (!needsTranslation(text) || isInsideTranslation(node)) return;
    if (/i18n-ignore/.test(code.split("\n")[source.getLineAndCharacterOfPosition(node.getStart(source)).line] ?? "")) return;
    findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: text.replace(/\s+/g, " ").trim(), where });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) add(node, "JSX text", node.text);
    else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const text of textsOf(node.expression)) add(text, "JSX value");
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(source);
      if (TEXT_PROPS.has(name)) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer, `${name}=`);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) for (const text of textsOf(node.initializer.expression)) add(text, `${name}=`);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (NOTICE_CALLS.has(name) && node.arguments[0]) for (const text of textsOf(node.arguments[0])) add(text, `${name}()`);
      if (name === "csvOf" || name === "toCsv") {
        const header = node.arguments[0];
        if (header && ts.isArrayLiteralExpression(header)) for (const item of header.elements) for (const text of textsOf(item as ts.Expression)) add(text, "CSV header");
      }
    } else if (ts.isPropertyAssignment(node) && node.name.getText(source) === "head" && ts.isArrayLiteralExpression(node.initializer) && isCsvCall(node.parent.parent)) {
      // CSV headers are translated when the file is made (csvOf in ReportsPage), so each one needs an entry.
      for (const item of node.initializer.elements) {
        for (const text of textsOf(item as ts.Expression)) {
          if (!(ts.isStringLiteral(text) && known?.has(text.text))) add(text, "CSV header");
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** Every .tsx under src (tests, the dictionaries and this scanner left out). */
export function scanTree(root: string, known?: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$/.test(entry.name) && !path.includes(`${join("src", "i18n")}`)) {
        findings.push(...scanSource(relative(root, path), readFileSync(path, "utf8"), known));
      }
    }
  };
  walk(join(root, "src"));
  return findings;
}
