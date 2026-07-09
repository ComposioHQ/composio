import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      'ts/packages/**/dist/**',
      'ts/packages/**/.generated/**',
      'ts/packages/**/acp-adapters/**',
      'ts/packages/**/node_modules/**',
      'node_modules/**',
      'ts/examples/**/dist/**',
      'ts/examples/**/dist-worker/**',
      'scripts/**',
      '**/test/**',
    ],
  },
  { files: ['ts/packages/**/*.ts', 'ts/examples/**/*.ts'] },
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  {
    rules: {
      // "@typescript-eslint/no-var-requires": "off",
      'no-restricted-globals': ['error', 'Buffer'],
      "no-restricted-imports": ["error", {
        "paths": [
          {
            "name": "crypto",
            "message": "Use Web Crypto API instead.",
          },
          {
            "name": "node:crypto",
            "message": "Use Web Crypto API instead.",
          },
          {
            "name": "buffer",
            "message": "Use Uint8Array instead.",
          },
          {
            "name": "node:buffer",
            "message": "Use Uint8Array instead.",
          },
        ],
      }],
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-prototype-builtins': 'off',
      'max-lines-per-function': ['error', 250],
      'no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-constant-condition': 'off',
      'no-ex-assign': 'off',
      'no-constant-binary-expression': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      'no-unsafe-optional-chaining': 'off',
      'no-extra-boolean-cast': 'off',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Examples are console-driven references. Keep type-safety rules
    // (no-explicit-any, unused-vars) but drop console noise. The Buffer/crypto
    // restrictions above target SDK/Workers source; Node example scripts may
    // legitimately use Node built-ins, so relax them here (see KTD6).
    files: ['ts/examples/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    // The Cloudflare Workers entry stays portable: no Node globals even though
    // nodejs_compat is enabled. Re-apply the restriction dropped just above.
    files: ['ts/examples/**/cloudflare.ts'],
    rules: {
      'no-restricted-globals': ['error', 'Buffer'],
    },
  },
];
