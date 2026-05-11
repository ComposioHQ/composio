# fix: Tolerate dangling `$ref` in Mastra provider when API omits `$defs`

## Overview

`MastraProvider.wrapTool` calls `dereferenceJsonSchema` to inline JSON Schema `$ref`
pointers before handing the schema to `@mastra/schema-compat`. That contract was
introduced in PLEN-2244 (commit `cc673b654`) and assumes every `#/$defs/...` ref
has a resolvable target. The Composio API ships at least one toolkit family
(Gmail, and any other toolkit whose `outputParameters` uses `$ref`) where the
schema declares `"$ref": "#/$defs/FetchEmailsResponse"` **without ever declaring
`$defs`**. The current resolver correctly throws a typed
`JsonSchemaRefResolutionError`, but that error escapes `wrapTool` and crashes
`composio.tools.get(...)` upfront — making affected toolkits unusable through
the Mastra provider.

This plan makes `dereferenceJsonSchema` opt-in lenient against unresolved
internal refs (using the existing cycle sentinel, `{ type: 'object', additionalProperties: true }`),
opts the Mastra provider into that lenient mode with a one-shot per-tool warning,
and locks the behavior in with red-green regression tests that mirror the exact
`GMAIL_FETCH_EMAILS` shape from the Linear ticket.

> **API-side follow-up (out of scope here):** the proper long-term fix is for
> `/api/v3/tools/:slug` to emit a top-level `$defs` block alongside any `$ref`
> it produces. That fix benefits every consumer (Mastra, Vercel AI SDK, future
> providers). It is tracked separately so the SDK does not have to block on
> the backend roll-out.

## Problem Statement / Motivation

### Reproduction (from PLEN-2451, verified 2026-05-10)

Direct dump of `GMAIL_FETCH_EMAILS.outputParameters` via
`composio.tools.getRawComposioTools(...)`:

```jsonc
{
  "type": "object",
  "properties": {
    "data": {
      "description": "Data from the action execution",
      "title": "Data",
      "$ref": "#/$defs/FetchEmailsResponse"   // ← points into $defs
    },
    "error":      { "type": "string",  "description": "...", "title": "Error" },
    "successful": { "type": "boolean", "description": "...", "title": "Successful" }
  },
  "required": ["data", "successful"],
  "title": "FetchEmailsResponseWrapper"
  // ← no `$defs` block anywhere
}
```

Observed behavior:

| Version pair                      | Failure mode                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@composio/{core,mastra}@0.6.11`  | `tools.get` returns a degraded Standard Schema whose `output()` crashes at runtime; agent sees a ~600B validation-error stub. |
| `@composio/{core,mastra}@0.9.0` (latest) | `tools.get` itself throws `JsonSchemaRefResolutionError: Cannot resolve $ref #/$defs/FetchEmailsResponse` upfront. |

The 0.9.0 behavior is *correct* given the PLEN-2244 strict contract — but the
contract is wrong for upstream-supplied schemas the SDK cannot edit. Every
toolkit whose `outputParameters` carries a `$ref` (Gmail, Slack, Google
Calendar, …) currently breaks Mastra integration.

### Why the reporter's "Option A" fix does not work

GitHub issue [#3307](https://github.com/ComposioHQ/composio/issues/3307)
proposes inlining `$defs` before calling `applyCompatLayer`. That is exactly
what PLEN-2244 already does (`ts/packages/providers/mastra/src/index.ts:100-110`).
The root cause is **upstream of** `applyCompatLayer`: there is no `$defs` to
inline. PLEN-2244's fix surfaces a dangling pointer instead of silently
producing a permissive `anyOf`, which is the right developer experience for
custom tools but the wrong one for opaque API-supplied schemas.

## Proposed Solution

Two-tier fix that keeps the same architecture as PLEN-2244:

### 1. `@composio/core` — add an `onUnresolved` option to `dereferenceJsonSchema`

`ts/packages/core/src/utils/jsonSchema.ts`

```typescript
export type UnresolvedRefStrategy = 'throw' | 'sentinel';

export interface DereferenceJsonSchemaOptions {
  /**
   * What to do when a `#/$defs/...` or `#/definitions/...` $ref cannot be
   * resolved (target missing, $defs/definitions block absent, malformed
   * pointer beneath an internal #/ prefix).
   *
   * - `'throw'` (default): preserve current behavior — throw
   *   `JsonSchemaRefResolutionError`. Right for first-party / custom-tool
   *   schemas where a dangling ref is a developer bug.
   * - `'sentinel'`: replace the offending node with the cycle-break
   *   sentinel (`{ type: 'object', additionalProperties: true }`). Right for
   *   schemas sourced from an upstream service the caller cannot edit.
   *   Each replacement invokes `onReplace` exactly once.
   */
  onUnresolved?: UnresolvedRefStrategy;
  /**
   * Callback invoked once per replaced node (only when `onUnresolved === 'sentinel'`).
   * Lets callers emit one-shot warnings without losing the offending pointer.
   */
  onReplace?: (ref: string, reason: 'missing-target' | 'malformed-pointer') => void;
}

export function dereferenceJsonSchema<T = unknown>(
  schema: T,
  options?: DereferenceJsonSchemaOptions
): T { /* … */ }
```

Implementation notes:

- The walker already produces `CYCLE_BREAK_SENTINEL` on detected cycles
  (`jsonSchema.ts:9, 98, 107, 127`). The lenient branch reuses **the same
  sentinel constant** so cycles and dangling refs share semantics: "we can't
  resolve this further; fall back to a permissive object".
- `resolvePointer` currently throws via `failResolution`
  (`jsonSchema.ts:19-24, 26-36`). Refactor: have `failResolution` return a
  discriminator (`{ kind: 'unresolved', ref, reason }`) consumed by the walker,
  so the lenient and strict branches share a single code path. Strict mode
  throws at the boundary, lenient mode emits the sentinel + invokes
  `onReplace`. Net change to strict-mode behavior: zero.
- The chain-depth cap (`MAX_REF_CHAIN_DEPTH`) and node-depth cap
  (`MAX_NODE_DEPTH`) keep throwing in **both** modes — those are safety caps,
  not data-shape issues. Document this in the JSDoc.
- External (`http://`, `https://`, `file://`) refs continue to be left as-is
  with a single audit-log `logger.warn` per call (`jsonSchema.ts:113-118`).
  Unchanged.
- `$defs` / `definitions` continue to be stripped from the returned root
  (`jsonSchema.ts:148-152`). Unchanged.

### 2. `@composio/mastra` — opt into lenient mode with a per-tool warning

`ts/packages/providers/mastra/src/index.ts`

```typescript
wrapTool(tool: Tool, executeTool: ExecuteToolFn): MastraTool {
  // ...existing strict-mode branch for inputParameters...

  // Output schemas come straight from the Composio API. The API can emit a
  // `$ref: "#/$defs/..."` without declaring `$defs` (PLEN-2451) — strict
  // mode would crash `tools.get` upfront. Fall back to the permissive
  // object sentinel and emit a single warning so the degraded shape is
  // observable in the agent's logs.
  const onReplace = (ref: string) => this.warnDanglingRefOnce(tool.slug, ref);

  const inputSchema = applyCompatLayer({
    schema: dereferenceJsonSchema(parameters ?? {}, {
      onUnresolved: 'sentinel',
      onReplace,
    }),
    compatLayers: [],
    mode: 'jsonSchema',
  });

  const outputSchema = applyCompatLayer({
    schema: dereferenceJsonSchema(tool.outputParameters ?? {}, {
      onUnresolved: 'sentinel',
      onReplace,
    }),
    compatLayers: [],
    mode: 'jsonSchema',
  });

  // ...createTool(...)...
}
```

Add a small instance-scoped `Set<string>` (`warnedDanglingRefs`, keyed by
`${slug}:${ref}`) so a Mastra agent that wraps the same tool many times only
emits one warning per `(tool, ref)` pair. The warning message names the
toolkit slug, tool slug, and the dangling pointer:

```
[composio/mastra] Tool GMAIL_FETCH_EMAILS (toolkit gmail) declares
$ref #/$defs/FetchEmailsResponse but no matching $defs entry. Falling
back to a permissive object schema for this branch — the wrapped
Mastra tool will validate the response loosely. Tracked in
https://linear.app/composio/issue/PLEN-2451.
```

Why warn (not silent fallback)?

- **Why:** customers iterating on a Mastra agent need to know they got a
  degraded schema; otherwise the failure mode becomes "agent validates loosely
  and you never find out why a downstream typed consumer broke". The warning
  also gives us a signal we can pipe into telemetry to prioritize the
  API-side fix.
- **How to apply:** rate-limit per `(slug, ref)` so noisy agents don't spam
  the log; never emit at module-load (the warning has to point at a concrete
  tool slug).

### Why the fix stays inside `MastraProvider.wrapTool`

It is tempting to dereference centrally — in
`Tools.transformToolCases` (`Tools.ts:140`) or
`Tools.applyDefaultSchemaModifiers` (`Tools.ts:192`). That would be wrong for
three reasons:

1. **No other provider needs this for output schemas.** Vercel
   (`ts/packages/providers/vercel/src/index.ts:108-133`) only feeds
   `inputParameters` to its Zod converter, and OpenAI/Anthropic/Google bind
   tool *input* schemas to function-calling APIs that ignore output shapes.
   `outputParameters` validation is a Mastra-specific surface.
2. **Centralized dereferencing would mutate `tools.get()`'s public shape.**
   Users today read raw `inputParameters` / `outputParameters` from
   `tools.get` and `getRawComposioToolBySlug` and expect them to mirror the
   API response (modulo case transformation in `transformToolCases`).
   Inlining `$defs` for every caller — including ones whose consumers can
   resolve `$ref` natively — is a silent behavior change for non-Mastra
   users.
3. **PLEN-2244 set the precedent.** Both fixes share the same boundary:
   the provider that owns the validation contract is the provider that
   pre-processes the schema. Keeping the new lenient path at the same
   boundary preserves architectural consistency.

## Acceptance Criteria

### Code

- [x] `dereferenceJsonSchema` accepts an optional second arg
      `{ onUnresolved?: 'throw' | 'sentinel'; onReplace?: (ref, reason) => void }`.
- [x] Default behavior (no opts) is byte-for-byte unchanged: still throws
      `JsonSchemaRefResolutionError` on a dangling internal `$ref`.
- [x] Lenient mode (`onUnresolved: 'sentinel'`) replaces the offending node
      with the existing `CYCLE_BREAK_SENTINEL` and invokes `onReplace` exactly
      once per replacement, passing the original ref pointer + reason.
- [x] Lenient mode still throws on `MAX_REF_CHAIN_DEPTH` /
      `MAX_NODE_DEPTH` breaches (safety caps are not lenient).
- [x] `MastraProvider.wrapTool` calls `dereferenceJsonSchema(..., {
      onUnresolved: 'sentinel', onReplace })` for both `inputParameters` and
      `outputParameters`.
- [x] `MastraProvider` warns once per `(toolSlug, refPointer)` pair via
      `@composio/core`'s `logger.warn`.
- [x] No public TypeScript API is *removed*; the new opts arg is purely additive.

### Tests (red before fix; green after)

- [x] New unit tests in `ts/packages/core/test/utils/jsonSchema.test.ts`
      (9 new cases, all under `describe("with onUnresolved: 'sentinel' lenient mode")`):
      sentinel replaces dangling ref; sentinel replaces missing-key ref;
      `onReplace` invoked with ref + `'missing-target'`; `onReplace` invoked
      with `'malformed-pointer'` for non-`#/` pointers; chain-depth cap still
      throws; node-depth cap still throws; explicit `'throw'` matches default;
      `onReplace` not called in strict mode; mixed schema preserves resolvable
      branches while replacing only the dangling one.
- [x] New regression test file
      `ts/packages/providers/mastra/test/mastra-dangling-defs.test.ts`
      (6 cases, un-mocked `@mastra/schema-compat`): no throw on dangling
      output ref (GMAIL shape); defined outputSchema with no surviving `$ref`;
      one warn per `(slug, ref)` pair across repeat wraps; separate warning
      per slug; symmetric tolerance on input refs; resolvable `$defs` still
      preserved.
- [x] All existing tests still pass: core 908; mastra-ref 3; mastra.test 39;
      every other provider/cli package green.

### Changeset

- [x] `.changeset/fix-mastra-dangling-defs-ref.md` added — `@composio/core`
      and `@composio/mastra` both bumped patch; body describes the API
      behavior, the new `onUnresolved`/`onReplace` opt, and the Mastra opt-in.
      No Linear IDs (per repo convention — changesets ship to npm).

### Manual verification

- [ ] (Post-merge) Reproduce against the live API using the script from the
      tracking issue: `tools.get(userId, { tools: ['GMAIL_FETCH_EMAILS'] })`
      should return a `MastraTool` object whose `outputSchema` is defined.
- [ ] Confirm the SDK logs exactly one warning per process per `(slug, ref)`
      pair with the expected message.

## Red-Green Test Strategy

The TDD loop:

1. **Red — write tests + the new error/option signature.** No production
   implementation yet.
   - Add the new `DereferenceJsonSchemaOptions` interface and export it.
   - Type-only stub: `dereferenceJsonSchema` still accepts an unused second
     arg (`_options?: DereferenceJsonSchemaOptions`).
   - Add the four new `jsonSchema.test.ts` cases. They fail with
     `JsonSchemaRefResolutionError` (current strict behavior) or compile
     errors (if `onReplace` callback isn't exposed yet).
   - Add the four new `mastra-dangling-defs.test.ts` cases. They fail with
     `JsonSchemaRefResolutionError` propagated up from `wrapTool`.

2. **Green — minimum implementation.**
   - Plumb the `onUnresolved` strategy through `walk` / `resolvePointer` /
     `stepInto`. Reuse `CYCLE_BREAK_SENTINEL`.
   - Wire `onReplace` invocations at the two failure call sites
     (`resolvePointer`'s missing target, `stepInto`'s non-object cursor).
   - Add `warnDanglingRefOnce` to `MastraProvider`, invoke from the two
     `wrapTool` call sites.

3. **Refactor — tighten.**
   - Verify no allocation in the strict path (the new branch must be a
     zero-cost extension on the existing happy path).
   - Run the full `jsonSchema.test.ts` + `mastra-ref.test.ts` +
     `mastra-dangling-defs.test.ts` matrix to confirm no regressions.

## Technical Considerations

### Security

- The sentinel (`{ type: 'object', additionalProperties: true }`) is the
  most permissive valid object schema. A schema falling back to it means
  Mastra's `validateToolOutput` will accept anything — *for that branch
  only*. The siblings (e.g. `required`, `title`) at the parent level are
  unaffected. This is strictly more permissive than `dereferenceJsonSchema`'s
  current "throw and refuse to run" behavior, so it does not introduce a new
  validation-bypass vector for trusted tool authors.
- Prototype-pollution filter (`POLLUTING_KEYS` at `jsonSchema.ts:10`) and
  `WeakSet` cycle tracking are unaffected.

### Performance

- Walker still visits each node at most once. The new branch is an extra
  `if (strategy === 'sentinel') return CYCLE_BREAK_SENTINEL` after
  `resolvePointer` throws or returns the "unresolved" discriminator. No new
  allocations in the common (resolvable) path.

### Compatibility

- `DereferenceJsonSchemaOptions` is **additive**. Both the public
  `dereferenceJsonSchema` export (consumed by `@composio/mastra`) and the
  internal call sites can ignore the new parameter.
- The `JsonSchemaRefResolutionError` class is unchanged. Callers that catch
  it (none today outside the test suite) keep working.
- The default mode is `'throw'`, matching the PLEN-2244 contract. Custom-tool
  authors who deliberately point `$ref` at a non-existent `$defs` entry will
  still get a hard error — that is the right behavior for *their* schemas.

## Dependencies & Risks

- **No dependency bumps.** Unlike PLEN-2244 (which bumped
  `@mastra/schema-compat` to `^1.2.9`), this fix is internal to the SDK.
- **Risk: developer surprise on raw schemas.** A reader of
  `getRawComposioTools(...)` sees `$ref` in the raw schema and finds it
  resolved to a sentinel in `wrapTool` output. Mitigation: the JSDoc on
  `dereferenceJsonSchema` documents the lenient contract, and the warning
  emitted by `MastraProvider` names the offending pointer.
- **Risk: telemetry noise.** A user wrapping every Gmail tool in a wide
  toolkit fetch could see many warnings on first run. Mitigation: per-tool
  dedup in the Mastra provider; warning text points at the upstream Linear
  ticket so callers know it is a known, tracked issue.

## File-Level Plan

```
ts/packages/core/src/utils/jsonSchema.ts                           # add opts; reuse CYCLE_BREAK_SENTINEL
ts/packages/core/test/utils/jsonSchema.test.ts                     # 4 new cases (red → green)
ts/packages/core/src/index.ts                                      # re-export DereferenceJsonSchemaOptions if needed
ts/packages/providers/mastra/src/index.ts                          # opt into 'sentinel' + per-tool warn dedup
ts/packages/providers/mastra/test/mastra-dangling-defs.test.ts     # new file, 4 cases (red → green)
.changeset/fix-mastra-dangling-defs-ref.md                         # patch/patch
```

Pseudocode for the touchpoints:

### `ts/packages/core/src/utils/jsonSchema.ts`

```typescript
export type UnresolvedRefStrategy = 'throw' | 'sentinel';

export interface DereferenceJsonSchemaOptions {
  onUnresolved?: UnresolvedRefStrategy;
  onReplace?: (ref: string, reason: 'missing-target' | 'malformed-pointer') => void;
}

const failResolution = (
  pointer: string,
  segment: string,
  strategy: UnresolvedRefStrategy,
  onReplace?: DereferenceJsonSchemaOptions['onReplace']
): typeof CYCLE_BREAK_SENTINEL => {
  if (strategy === 'sentinel') {
    onReplace?.(pointer, 'malformed-pointer');
    return { ...CYCLE_BREAK_SENTINEL };
  }
  throw new JsonSchemaRefResolutionError(`Cannot resolve $ref ${pointer}`, {
    meta: { ref: pointer, failedAt: segment },
    possibleFixes: REF_RESOLUTION_FIXES,
  });
};
// `resolvePointer` and `stepInto` receive `strategy` + `onReplace` and forward to `failResolution`.
// `walk` checks for the sentinel return shape and stops descending.
```

### `ts/packages/providers/mastra/src/index.ts`

```typescript
private warnedDanglingRefs = new Set<string>();

private warnDanglingRefOnce(toolSlug: string, toolkitSlug: string, ref: string) {
  const key = `${toolSlug}:${ref}`;
  if (this.warnedDanglingRefs.has(key)) return;
  this.warnedDanglingRefs.add(key);
  logger.warn(
    `[composio/mastra] Tool ${toolSlug} (toolkit ${toolkitSlug}) declares ` +
    `$ref ${ref} but no matching $defs/definitions entry. Falling back to a ` +
    `permissive object schema for this branch — the wrapped Mastra tool will ` +
    `validate loosely. See https://linear.app/composio/issue/PLEN-2451.`
  );
}
```

## References & Research

### Linear / GitHub

- Linear ticket: PLEN-2451 — *MastraProvider $defs/$ref schema is dangling at the API source*.
- Customer-facing GitHub issue: https://github.com/ComposioHQ/composio/issues/3307 (reported by `@0xpaperhead`, 2026-04-28).
- Prior, related fix: PLEN-2244 (commits `5300bf8ba` red tests, `cc673b654` fix). Closed by `.changeset/fix-mastra-ref-dereference.md`.

### Files

- `ts/packages/providers/mastra/src/index.ts:80-126` — `MastraProvider.wrapTool` (the call site that needs to opt into lenient mode).
- `ts/packages/core/src/utils/jsonSchema.ts:64-153` — `dereferenceJsonSchema` (the helper that needs the new opt).
- `ts/packages/core/src/utils/jsonSchema.ts:9` — `CYCLE_BREAK_SENTINEL` (the sentinel to reuse).
- `ts/packages/core/src/utils/jsonSchema.ts:19-36` — `failResolution` / `stepInto` (refactor target).
- `ts/packages/core/src/errors/ValidationErrors.ts:89-99` — `JsonSchemaRefResolutionError` (unchanged).
- `ts/packages/core/test/utils/jsonSchema.test.ts:150-158` — existing strict-mode test (the contract we keep as default).
- `ts/packages/providers/mastra/test/mastra-ref.test.ts` — pattern to mirror for the new test file.
- `ts/packages/providers/vercel/src/index.ts:108-133` — confirms `outputParameters` is Mastra-only.
- `ts/packages/core/src/types/tool.types.ts:29-102` — `JSONSchemaPropertySchema` admits `$ref` / `$defs` / `definitions` (so the raw shape we test against is valid against `ToolSchema`).
- `ts/packages/core/src/models/Tools.ts:140-150, 192-198` — confirms the central pipeline does *not* pre-process schemas and that the provider boundary is the right one.

### External

- JSON Pointer (RFC 6901) — escape semantics already handled correctly at `jsonSchema.ts:16-17`.
- JSON Schema 2020-12 — sibling-keyword merge semantics already handled correctly at `jsonSchema.ts:133-141`.
- `@mastra/schema-compat` — AJV-backed; refuses to compile schemas with unresolved internal `$ref`. Bundles `convertSchemaToZod` which silently degrades `$ref` → permissive `anyOf` when AJV is bypassed (the pre-PLEN-2244 failure mode).
