---
status: pending
priority: p2
issue_id: 004
tags: [code-review, quality, tests, mastra]
dependencies: []
---

# Clean up repeated `as unknown as Tool[...]` casts in dangling-defs tests

## Problem Statement

The new test file `mastra-dangling-defs.test.ts` contains six `as unknown as Tool['inputParameters']` / `as unknown as Tool['outputParameters']` double-casts plus one `as never` cast — all to build `Tool` literals whose `inputParameters` / `outputParameters` deliberately include shapes that don't satisfy the `ParametersSchema` Zod type (e.g., a `$ref` at the property level, which `JSONSchemaPropertySchema` admits but only via a separately-tagged escape hatch). The repeated double-cast signals "the type doesn't fit and I'm overriding TS" and is a code smell, especially when grouped six times in one file.

The pattern was inherited from `mastra-ref.test.ts` (PLEN-2244), but two casts there ≠ acceptable scaffolding for eight in the new file. Worse, the file mixes two styles:
- `as unknown as Tool['inputParameters']` (5 occurrences)
- `as never` (1 occurrence, on the resolvable-ref fixture)

Both reviewers (`kieran-typescript-reviewer`, `pattern-recognition-specialist`) flagged this — the second specifically noted the inconsistency vs. `mastra-ref.test.ts`.

## Findings

- File: `ts/packages/providers/mastra/test/mastra-dangling-defs.test.ts:38, 60, 73, 77, 86, 91, 95`
- Pre-existing same-style casts in `mastra-ref.test.ts:58, 61` — fine if they predate the rule but should not propagate.
- Also: `let exec: any` with an `eslint-disable-next-line` comment at `:101-102`. The `ExecuteToolFn` type is already exported from `@composio/core` — use `MockedFunction<ExecuteToolFn>` from vitest.

## Proposed Solutions

### Option A — Extract a `makeTool(partial)` factory in a shared test helper (recommended)

```ts
// ts/packages/providers/mastra/test/_utils.ts (new file)
import type { Tool } from '@composio/core';

type ToolLike = Omit<Tool, 'inputParameters' | 'outputParameters'> & {
  inputParameters?: Record<string, unknown>;
  outputParameters?: Record<string, unknown>;
};

export const makeTool = (overrides: Partial<ToolLike>): Tool =>
  ({
    slug: 'TEST_TOOL',
    name: 'Test Tool',
    description: '',
    toolkit: { slug: 'test', name: 'Test' },
    version: '20260510_00',
    availableVersions: ['20260510_00'],
    tags: [],
    ...overrides,
  } as unknown as Tool);
```

Then in `mastra-dangling-defs.test.ts`:

```ts
const danglingOutputTool = makeTool({
  slug: 'DANGLING_OUTPUT_TOOL',
  outputParameters: { /* the GMAIL shape, no cast */ },
});
```

- **Pros:** One cast in one place. Test fixtures become readable. Same helper can be retrofitted into `mastra-ref.test.ts` for consistency (or left alone if scope is too big).
- **Cons:** Adds one tiny file under `test/`. The `as unknown as Tool` still exists — but localized to the helper, where the comment can explain why (intentionally building shapes outside `ParametersSchema`).
- **Effort:** Small (~25 LOC including helper + replacements in this PR's test file).
- **Risk:** Low.

### Option B — Type the fixtures correctly via a structural `TestTool` alias

```ts
type TestTool = Omit<Tool, 'inputParameters' | 'outputParameters'> & {
  inputParameters: Record<string, unknown>;
  outputParameters: Record<string, unknown>;
};

const danglingOutputTool: TestTool = { /* no cast */ };
// At call site:
provider.wrapTool(danglingOutputTool as unknown as Tool, exec);
```

- **Pros:** Strong typing for the test bodies; cast moves to the call site (1×).
- **Cons:** Still need a cast at the boundary. Marginal vs. Option A.
- **Effort:** Small.
- **Risk:** Low.

### Option C — Status quo

Leave the six casts.

- **Pros:** No work.
- **Cons:** Code smell remains; future test additions will copy the cast style; the file is one of the entry points for future provider-author contributions and the pattern propagates.
- **Effort:** None.
- **Risk:** None today.

## Recommended Action

_(Filled during triage.)_

## Technical Details

- **Files affected:** `ts/packages/providers/mastra/test/mastra-dangling-defs.test.ts` (6 casts + `exec: any` cleanup). Optional: `mastra-ref.test.ts` (2 casts).
- **No source code changes.**
- **No public API changes.**

## Acceptance Criteria

- [ ] No more than one `as unknown as Tool` cast across new test fixtures.
- [ ] `let exec: any` replaced with `vi.fn<ExecuteToolFn>()` or equivalent typed mock.
- [ ] Existing assertions in the test file still pass.
- [ ] No new lint suppressions introduced.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- Tracking issue: https://github.com/ComposioHQ/composio/issues/3307
- `ExecuteToolFn` type: `ts/packages/core/src/types/provider.types.ts` (exported via `@composio/core`)
- Reference pattern: `mastra-ref.test.ts` (PLEN-2244)
