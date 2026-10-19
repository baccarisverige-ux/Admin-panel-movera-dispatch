import { csvCell, toCsv } from "./csv.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

assert(csvCell("=2+2").startsWith("'"), "formula guarded");
assert(csvCell("+46 70").startsWith("'"), "plus guarded");
assert(csvCell("-1").startsWith("'"), "minus guarded");
assert(csvCell("Norrmalm") === "Norrmalm", "plain text");
assert(toCsv([["Zone", "Fare"], ["Norrmalm", "49,00 kr"]]).includes("Norrmalm"), "export");

assert(csvCell("\t=1+1").startsWith("'") && csvCell("\r=1") === `"'\r=1"` && csvCell(" =1").startsWith("'"), "tab, CR and space before a formula are guarded");
assert(csvCell("a;b") === '"a;b"', "semicolons are quoted for the bank file");

console.log("csv ok");
