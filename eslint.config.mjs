import globals from 'globals';
import tseslint from 'typescript-eslint';

const portableRestrictedImportPaths = [
  {
    name: 'crypto',
    message: 'Use Web Crypto API instead.',
  },
  {
    name: 'node:crypto',
    message: 'Use Web Crypto API instead.',
  },
  {
    name: 'buffer',
    message: 'Use Uint8Array instead.',
  },
  {
    name: 'node:buffer',
    message: 'Use Uint8Array instead.',
  },
];

const cliRestrictedSyntax = [
  {
    selector: 'TryStatement',
    message:
      'Use Effect.try, Effect.tryPromise, or typed Effect error recovery instead of try/catch.',
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'Read environment variables through effect/Config instead of process.env.',
  },
];

const cliProcessStreamRestrictions = [
  {
    selector: "MemberExpression[object.name='process'][property.name='stdout']",
    message: 'Write output and read terminal capabilities through TerminalUI.',
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='stderr']",
    message: 'Write errors and read terminal capabilities through TerminalUI.',
  },
];

const cliRestrictedImportPaths = [
  ...portableRestrictedImportPaths,
  {
    name: 'child_process',
    message: 'Use Command from @effect/platform instead.',
  },
  {
    name: 'node:child_process',
    message: 'Use Command from @effect/platform instead.',
  },
  {
    name: 'fs',
    message: 'Use FileSystem from @effect/platform instead.',
  },
  {
    name: 'node:fs',
    message: 'Use FileSystem from @effect/platform instead.',
  },
  {
    name: 'os',
    message: 'Use an Effect service instead of importing node:os directly.',
  },
  {
    name: 'node:os',
    message: 'Use an Effect service instead of importing node:os directly.',
  },
  {
    name: 'path',
    message: 'Use Path from @effect/platform instead.',
  },
  {
    name: 'node:path',
    message: 'Use Path from @effect/platform instead.',
  },
];

const cliRestrictedImportPatterns = [
  {
    group: ['fs/*', 'node:fs/*'],
    message: 'Use FileSystem from @effect/platform instead.',
  },
];

const cliDescriptorSeamMessage =
  'CommandDescriptor/Usage introspection is the @effect/cli v4 seam. Use the helpers in ts/packages/cli/src/commands/command-introspection.ts instead.';

const cliDescriptorSeamRestrictedImportPaths = [
  {
    name: '@effect/cli',
    importNames: ['CommandDescriptor', 'Usage'],
    message: cliDescriptorSeamMessage,
  },
];

const cliDescriptorSeamRestrictedImportPatterns = [
  {
    group: ['@effect/cli/CommandDescriptor', '@effect/cli/Usage'],
    message: cliDescriptorSeamMessage,
  },
];

const effectSchemaRestrictedImportPaths = [
  {
    name: 'zod',
    message: 'Use Schema from effect for tool input validation.',
  },
];

const effectSchemaRestrictedImportPatterns = [
  {
    group: ['zod/*'],
    message: 'Use Schema from effect for tool input validation.',
  },
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '**/.venv/**',
      '**/.next/**',
      '**/site-packages/**',
      '**/__fixtures__/**',
      '**/fixtures/**',
      'docs/.source/**',
      'ts/vendor/**',
      'ts/packages/cli-local-tools/vendor/**',
      'ts/packages/**/dist/**',
      'ts/packages/**/.generated/**',
      'ts/packages/**/acp-adapters/**',
      'ts/packages/**/node_modules/**',
      'node_modules/**',
      'ts/examples/**/dist/**',
      'ts/examples/**/dist-worker/**',
      'scripts/**',
      '**/test/**',
      // uncommented by the test-rules PR of this stack: the CLI test sources
      // become linted (unlike other packages' tests) so the @effect/vitest
      // guardrail below is actually enforced. Fixtures and the test/__utils__
      // harness glue stay unlinted.
      // '!ts/packages/cli/test/**',
      // 'ts/packages/cli/test/__fixtures__/**',
      // 'ts/packages/cli/test/__utils__/**',
    ],
  },
  { files: ['ts/packages/**/*.ts', 'ts/examples/**/*.ts'] },
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  {
    rules: {
      // "@typescript-eslint/no-var-requires": "off",
      'no-restricted-globals': ['error', 'Buffer'],
      'no-restricted-imports': ['error', { paths: portableRestrictedImportPaths }],
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
    files: ['ts/packages/cli/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...cliRestrictedImportPaths, ...cliDescriptorSeamRestrictedImportPaths],
          patterns: [...cliRestrictedImportPatterns, ...cliDescriptorSeamRestrictedImportPatterns],
        },
      ],
      'no-restricted-syntax': [
        'error',
        // uncommented by the boundary-ratchet PR of this stack
        // ...cliRestrictedSyntax,
        ...cliProcessStreamRestrictions,
      ],
    },
  },
  // uncommented by the test-rules PR of this stack.
  // {
  //   // Tests exercise Effects through @effect/vitest (it.effect, it.scoped,
  //   // it.live) so failures surface as typed Exits instead of thrown
  //   // FiberFailures. The test/__utils__ harness glue (vitest setup files,
  //   // TestLayer runner) is intentionally outside this glob: it is the one
  //   // boundary allowed to run Effects directly.
  //   files: ['ts/packages/cli/test/src/**/*.{ts,tsx}'],
  //   rules: {
  //     // Vitest suites are one long describe() block by design, and mock
  //     // plumbing casts freely; the SUT's own types carry the safety.
  //     'max-lines-per-function': 'off',
  //     '@typescript-eslint/no-explicit-any': 'off',
  //     'no-restricted-syntax': [
  //       'error',
  //       {
  //         selector: "MemberExpression[object.name='Effect'][property.name=/^run/]",
  //         message:
  //           'Run Effects through @effect/vitest (it.effect, it.scoped, it.live) instead of Effect.run* in tests.',
  //       },
  //       {
  //         selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
  //         message:
  //           'Tests must be deterministic: pin time with vi.setSystemTime / TestClock-relative fixtures, use crypto.randomUUID() for unique names.',
  //       },
  //     ],
  //   },
  // },
  {
    // The one file allowed to touch @effect/cli's CommandDescriptor/Usage
    // modules (the Effect CLI v4 redesign seam).
    files: ['ts/packages/cli/src/commands/command-introspection.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: cliRestrictedImportPaths,
          patterns: cliRestrictedImportPatterns,
        },
      ],
    },
  },
  {
    files: ['ts/packages/cli/src/services/tool-input-validation.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...cliRestrictedImportPaths, ...effectSchemaRestrictedImportPaths],
          patterns: [...cliRestrictedImportPatterns, ...effectSchemaRestrictedImportPatterns],
        },
      ],
    },
  },
  {
    files: ['ts/packages/cli/src/services/terminal-ui.ts'],
    rules: {
      // TerminalUI is the sole CLI boundary for Node's stdout and stderr streams.
      'no-restricted-syntax': ['error', ...cliRestrictedSyntax],
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
