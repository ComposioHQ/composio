---
status: pending
priority: p3
issue_id: 005
tags: [code-review, quality, jsonSchema, simplicity]
dependencies: []
---

# Tighten `throwResolutionError` to the unresolved variant only

## Problem Statement

`throwResolutionError` (`ts/packages/core/src/utils/jsonSchema.ts:98-119`) accepts a `ResolutionResult` and has a defensive `if (result.kind === 'ok')` branch labeled "unreachable; defensive so the type-narrow holds." The caller in `walk` (`:209-222`) already discriminates on `result.kind` before invoking the helper, so this branch is by construction unreachable. The dead code allocates a `JsonSchemaRefResolutionError` no one will ever see and pollutes coverage.

Two reviewers (`kieran-typescript-reviewer`, `code-simplicity-reviewer`) flagged this.

## Findings

- File: `ts/packages/core/src/utils/jsonSchema.ts:98-119`.
- The function's return type is `: never` — correct intent.
- The "defensive" branch was added so the function's parameter could be the union type without requiring narrowing at the call site, but the call site already narrows.

## Proposed Solutions

### Option A — Tighten the parameter type to the unresolved variant (recommended)

```ts
const throwResolutionError = (
  pointer: string,
  result: Extract<ResolutionResult, { kind: 'unresolved' }>
): never => {
  if (result.reason === 'malformed-pointer') {
    throw new JsonSchemaRefResolutionError(`Unsupported $ref pointer: ${pointer}`, {
      meta: { ref: pointer },
      possibleFixes: REF_RESOLUTION_FIXES,
    });
  }
  throw new JsonSchemaRefResolutionError(`Cannot resolve $ref ${pointer}`, {
    meta: {
      ref: pointer,
      ...(result.failedAt !== undefined ? { failedAt: result.failedAt } : {}),
    },
    possibleFixes: REF_RESOLUTION_FIXES,
  });
};
```

- **Pros:** Removes 6 lines of dead code. Caller's narrow is now load-bearing (compile-time guarantee). Cleaner semantics.
- **Cons:** Caller must narrow before invoking (already does).
- **Effort:** Trivial (~6 LOC removed, 1 type tightened).
- **Risk:** None.

### Option B — `assertNever` on the impossible branch

Replace the throw with `const _exhaust: never = result; throw new Error('unreachable');`.

- **Pros:** Explicit "this can't happen" rather than implicit defensive throw.
- **Cons:** Same amount of code; less idiomatic than tightening the type.
- **Effort:** Trivial.
- **Risk:** None.

### Option C — Status quo

Leave the defensive branch.

- **Pros:** No work.
- **Cons:** Dead code, minor coverage noise.
- **Effort:** None.
- **Risk:** None.

## Recommended Action

_(Filled during triage.)_

## Technical Details

- **File affected:** `ts/packages/core/src/utils/jsonSchema.ts` only.
- **No public API changes.**
- **No test changes** — coverage on the unreachable branch was zero before, will be zero (because it no longer exists) after.

## Acceptance Criteria

- [ ] `throwResolutionError` parameter typed as `Extract<ResolutionResult, { kind: 'unresolved' }>`.
- [ ] No more "unreachable; defensive" branch.
- [ ] All existing jsonSchema tests still pass.
- [ ] `pnpm typecheck` still clean.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- File: `ts/packages/core/src/utils/jsonSchema.ts:98-119`
