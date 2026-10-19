import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

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
    // Classic hook rules only; the React Compiler rules in the plugin's "recommended" preset are not adopted.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
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
