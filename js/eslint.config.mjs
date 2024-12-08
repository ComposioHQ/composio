import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  {languageOptions: { globals: globals.node },},
  pluginJs.configs.recommended,
  // eslintPluginPrettierRecommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/ban-types": "error",
      "max-lines-per-function": ["error", 250],
      "no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-constant-condition": "off",
      "no-ex-assign": "off",
      "no-constant-binary-expression": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "no-unsafe-optional-chaining": "off",
      "no-extra-boolean-cast": "off",
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn", // or "error"
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ]
    },
  },
];

