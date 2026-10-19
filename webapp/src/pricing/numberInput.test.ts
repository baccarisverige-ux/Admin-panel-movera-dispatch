import { numberInputError, parseNumberInput } from "./numberInput.ts";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

// UI-10: typed text is checked, never changed silently.
assert(numberInputError("1e5", 0, undefined) !== null, "1e5 is not accepted (it used to become 15)");
assert(numberInputError("1,000.50", 0, undefined) !== null, "two separators are not accepted (it used to keep the old value)");
assert(numberInputError("-50", 0, undefined) === "Must be 0 or more.", "a negative amount is an error, not 0");
assert(numberInputError("500", 0, 10, "%") === "Max 10%.", "an amount over the maximum says the maximum");
assert(numberInputError("150", 0, 50, "%") === "Max 50%.", "fleet owner part over 50% says so");
assert(numberInputError("100000", 0, 1000, "kr") === "Max 1000 kr.", "a base fare over the cap says the cap with its unit");
assert(numberInputError("", 0, undefined) === "Enter a number.", "an empty box asks for a number");
assert(numberInputError("12,", 0, undefined) === null && parseNumberInput("12,") === 12, "a trailing comma is fine while typing");
assert(numberInputError("12,5", 0, undefined) === null && parseNumberInput("12,5") === 12.5, "a decimal comma works");
assert(numberInputError("0.5", 1, undefined, "km") === "Min 1 km.", "under a minimum above 0 says the minimum");
assert(numberInputError("abc", 0, undefined) !== null, "letters are an error");
console.log("number input ok");
