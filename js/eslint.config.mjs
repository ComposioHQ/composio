import globals from "globals";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["src/**/*.{ts,js}"]},
  {languageOptions: { globals: globals.browser }},
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-prototype-builtins": "off",
      "max-lines-per-function": ["error", 250],
      "no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-constant-condition": "off",
      "no-ex-assign": "off",
      "no-constant-binary-expression": "off",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "no-unsafe-optional-chaining": "off",
      "no-extra-boolean-cast": "off",
      "no-var": "warn",
      "prefer-const": "warn",
      "no-console": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ]
    },
  },
];
