/** Spreadsheet apps run a cell that starts with = + - @ (or a tab / carriage return before one) as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const guarded = FORMULA_START.test(value) || FORMULA_START.test(value.trimStart()) ? `'${value}` : value;
  // Quote for both comma files and the semicolon bank file.
  if (/[",;\n\r]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
  return guarded;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
