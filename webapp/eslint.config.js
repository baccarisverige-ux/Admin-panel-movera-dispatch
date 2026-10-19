import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // formatOre prints every amount as SEK with 2 decimals; screens use the record's own currency.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts", "src/domain/contract.ts"],
    rules: {
      "no-restricted-syntax": ["error", { selector: "ImportSpecifier[imported.name='formatOre']", message: "formatOre is SEK only. Use formatMoney / formatZoneMoney from markets/markets." }],
    },
  },
);
