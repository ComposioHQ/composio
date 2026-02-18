# refactor: Bump e2e fixture `beforeAll` timeouts and `LLM_SHORT`

## Overview

Refactor `ts/e2e-tests/` so that all `beforeAll` hooks calling `runFixture()` use an explicit `TIMEOUTS.FIXTURE` constant (60,000 ms) instead of relying on the implicit bun:test default (5,000 ms). Also bump `TIMEOUTS.LLM_SHORT` from 15,000 ms to 30,000 ms. Update all local documentation to reflect these changes.

## Problem Statement

Several Node.js and Deno e2e test files call `runFixture()` inside `beforeAll` without an explicit timeout. The bun:test default of ~5 seconds can be too tight for Docker-based fixture execution, leading to flaky test failures. Meanwhile, `LLM_SHORT` at 15,000 ms is also borderline for LLM calls.

## Acceptance Criteria

- [x] New `TIMEOUTS.FIXTURE` constant (60,000 ms) added to `const.ts`
- [x] `TIMEOUTS.LLM_SHORT` bumped from 15,000 to 30,000
- [x] All 4 fixture-using `beforeAll` hooks without explicit timeouts updated to use `TIMEOUTS.FIXTURE`
- [x] Tests with existing explicit timeouts (300,000 ms) left unchanged
- [x] README examples updated to show `TIMEOUTS.FIXTURE` on fixture `beforeAll` hooks
- [x] JSDoc examples in utility source files updated

## Changes

### 1. Update `ts/e2e-tests/_utils/src/const.ts`

Add `FIXTURE: 15_000` and bump `LLM_SHORT` to `30_000`:

```typescript
export const TIMEOUTS = {
  DEFAULT: 5_000,
  FIXTURE: 60_000,     // NEW: beforeAll hooks that call runFixture()
  LLM_SHORT: 30_000,   // CHANGED: was 15_000
  LLM_LONG: 60_000,
} as const;
```

### 2. Update test files (4 files)

Each file needs two changes: add the `TIMEOUTS` import, and add the timeout to the `beforeAll` call.

#### `ts/e2e-tests/runtimes/node/cjs-basic/e2e.test.ts`

- **Line 7**: Add `import { TIMEOUTS } from '@e2e-tests/utils/const';`
- **Line 26**: Change `});` to `}, TIMEOUTS.FIXTURE);`

#### `ts/e2e-tests/runtimes/node/esm-basic/e2e.test.ts`

- **Line 7**: Add `import { TIMEOUTS } from '@e2e-tests/utils/const';`
- **Line 26**: Change `});` to `}, TIMEOUTS.FIXTURE);`

#### `ts/e2e-tests/runtimes/node/openai-zod4-compat/e2e.test.ts`

- **Line 8**: Add `import { TIMEOUTS } from '@e2e-tests/utils/const';`
- **Line 31**: Change `});` to `}, TIMEOUTS.FIXTURE);`

#### `ts/e2e-tests/runtimes/deno/esm-basic/e2e.test.ts`

- **Line 7**: Add `import { TIMEOUTS } from '@e2e-tests/utils/const';`
- **Line 20**: Change `});` to `}, TIMEOUTS.FIXTURE);`

### 3. Files NOT changed (already have explicit timeouts)

These two tests have `300_000` ms timeouts for good reason (slow operations) and should remain as-is:

- `ts/e2e-tests/runtimes/node/file-roundtrip/e2e.test.ts` (line 21: `}, 300_000`)
- `ts/e2e-tests/runtimes/node/typescript-mjs-import-nodenext/e2e.test.ts` (line 29: `}, 300_000`)

### 4. Update documentation (4 files)

#### `ts/e2e-tests/README.md`

Update all three "Adding New Tests" code examples (Node.js at line 107, Deno at line 145, External Dependencies at line 179) to:
1. Add `import { TIMEOUTS } from '@e2e-tests/utils/const';` to the import block
2. Add `}, TIMEOUTS.FIXTURE);` as the `beforeAll` timeout

**Node.js example** (lines 95-121):

```typescript
import { e2e, type E2ETestResult } from '@e2e-tests/utils';
import { TIMEOUTS } from '@e2e-tests/utils/const';
import { describe, it, expect, beforeAll } from 'bun:test';

e2e(import.meta.url, {
  // ...
  defineTests: ({ runtime, runFixture }) => {
    let result: E2ETestResult;

    beforeAll(async () => {
      result = await runFixture({ filename: 'fixtures/test.mjs' });
    }, TIMEOUTS.FIXTURE);
    // ...
  },
});
```

**Deno example** (lines 133-159): Same pattern.

**External Dependencies example** (lines 168-198): Same pattern.

#### `ts/e2e-tests/_utils/README.md`

1. Update `TIMEOUTS` table (lines 151-155) to add `FIXTURE` row and update `LLM_SHORT` value:

| Constant    | Value     | Use Case                                       |
| ----------- | --------- | ---------------------------------------------- |
| `DEFAULT`   | `5_000`   | Standard test operations                       |
| `FIXTURE`   | `15_000`  | `beforeAll` hooks that call `runFixture()`     |
| `LLM_SHORT` | `30_000`  | Quick LLM calls                                |
| `LLM_LONG`  | `60_000`  | Complex LLM operations                         |

2. Update code examples (lines 33-34, 216-217) where `beforeAll` calls `runFixture()` to show explicit `TIMEOUTS.FIXTURE` timeout.

#### `ts/e2e-tests/_utils/src/e2e.ts`

Update JSDoc example (lines 60-62) from:

```typescript
*     beforeAll(async () => {
*       result = await runFixture('fixtures/test.mjs');
*     }, 300_000);
```

to:

```typescript
*     beforeAll(async () => {
*       result = await runFixture({ filename: 'fixtures/test.mjs' });
*     }, TIMEOUTS.FIXTURE);
```

#### `ts/e2e-tests/_utils/src/types.ts`

Update JSDoc example in `E2EConfig.defineTests` (lines 175-177) from:

```typescript
*   beforeAll(async () => {
*     result = await runFixture({ filename: 'fixtures/test.mjs' });
*   }, 300_000);
```

to:

```typescript
*   beforeAll(async () => {
*     result = await runFixture({ filename: 'fixtures/test.mjs' });
*   }, TIMEOUTS.FIXTURE);
```

## Summary of All Files Touched

| # | File | Change |
|---|------|--------|
| 1 | `ts/e2e-tests/_utils/src/const.ts` | Add `FIXTURE: 15_000`, bump `LLM_SHORT` to `30_000` |
| 2 | `ts/e2e-tests/runtimes/node/cjs-basic/e2e.test.ts` | Import `TIMEOUTS`, add `TIMEOUTS.FIXTURE` to `beforeAll` |
| 3 | `ts/e2e-tests/runtimes/node/esm-basic/e2e.test.ts` | Import `TIMEOUTS`, add `TIMEOUTS.FIXTURE` to `beforeAll` |
| 4 | `ts/e2e-tests/runtimes/node/openai-zod4-compat/e2e.test.ts` | Import `TIMEOUTS`, add `TIMEOUTS.FIXTURE` to `beforeAll` |
| 5 | `ts/e2e-tests/runtimes/deno/esm-basic/e2e.test.ts` | Import `TIMEOUTS`, add `TIMEOUTS.FIXTURE` to `beforeAll` |
| 6 | `ts/e2e-tests/README.md` | Update 3 code examples with `TIMEOUTS.FIXTURE` |
| 7 | `ts/e2e-tests/_utils/README.md` | Update TIMEOUTS table + code examples |
| 8 | `ts/e2e-tests/_utils/src/e2e.ts` | Update JSDoc example |
| 9 | `ts/e2e-tests/_utils/src/types.ts` | Update JSDoc example |
