---
status: pending
priority: p2
issue_id: 002
tags: [code-review, agent-native, ux, jsonSchema]
dependencies: []
---

# LLM-visible degradation hint when sentinel replaces a dangling `$ref`

## Problem Statement

When `dereferenceJsonSchema` replaces a dangling `$ref` with the cycle-break sentinel (`{ type: 'object', additionalProperties: true }`), the only signal that the schema was degraded goes to **stderr via `logger.warn`** — visible to the human developer but invisible to the LLM consuming the wrapped tool. The LLM sees a property whose output is "an object with any keys", which is technically true but unhelpful — it cannot infer "this branch was supposed to be a structured response and is unresolved at the source."

The sibling-merge logic at `jsonSchema.ts:229-234` already preserves the original node's `description` (and other sibling keywords) on top of the sentinel — so a payload like `{ $ref: "#/$defs/Missing", description: "User email" }` correctly becomes `{ type: 'object', additionalProperties: true, description: "User email" }`. **But** when the source `$ref` node has no sibling `description` (the GMAIL_FETCH_EMAILS case — see `data: { $ref: "#/$defs/FetchEmailsResponse", description: "Data from the action execution" }` does have one, but many real-world schemas won't), the LLM is left with a useless permissive object and no prose context.

## Findings

- File: `ts/packages/core/src/utils/jsonSchema.ts:214-219` (the lenient-mode replacement site).
- Source: `agent-native-reviewer` agent ("Schema-as-context for the LLM" recommendation, point 2 of their review).
- Verified by the agent: sibling-merge at `:229-234` does preserve `description` when present. The gap is only the no-sibling case.
- The Composio SDK is "tools-for-AI-agents" first; degradation signals belong in-band (in the schema the LLM sees) not just out-of-band (in stderr).

## Proposed Solutions

### Option A — Inject a default `description` only when none is present (recommended)

Modify the lenient branch so the substituted sentinel carries a default description when the original `$ref` node has no `description` sibling:

```ts
} else if (strategy === 'sentinel') {
  onReplace?.(ref, result.reason);
  const hasOwnDescription =
    typeof (node as Record<string, unknown>).description === 'string';
  target = {
    ...CYCLE_BREAK_SENTINEL,
    ...(hasOwnDescription
      ? {}
      : {
          description:
            'Output shape unresolved at the schema source — validate loosely. ' +
            'See https://github.com/ComposioHQ/composio/issues/3307.',
        }),
  };
}
```

- **Pros:** Zero behavior change when caller provides their own `description` (the common, well-formed case). When `description` is absent, the LLM gets a clear "this is degraded" hint in-band. No public API change.
- **Cons:** A hard-coded user-facing string lives in `@composio/core`. The hint mentions a Composio URL — slight provider-leak into the core utility, but the helper is already opinionated for SDK-internal use.
- **Effort:** Small (~5 LOC + a test case).
- **Risk:** Low. The injected `description` is JSON-Schema-legal everywhere.

### Option B — Provide the default text via a new option, callers pass it

Add `onUnresolved` config:
```ts
dereferenceJsonSchema(schema, {
  onUnresolved: 'sentinel',
  unresolvedDescription: 'Output shape unresolved...',
  onReplace,
})
```

- **Pros:** No URL leak into core; provider provides its own text.
- **Cons:** Adds a third option knob — `dereferenceJsonSchema` keeps creeping into provider policy. Possible over-engineering.
- **Effort:** Small-Medium.
- **Risk:** Low.

### Option C — Do not inject; rely on `description` already in the schema

Status quo. Accept that some tools will lose the LLM hint.

- **Pros:** No code change.
- **Cons:** The agent UX gap remains; the SDK's "agent-native" promise weakens for affected toolkits.
- **Effort:** None.
- **Risk:** None, but doesn't address the finding.

## Recommended Action

_(Filled during triage.)_

## Technical Details

- **Files affected:** `ts/packages/core/src/utils/jsonSchema.ts` (lenient branch in `walk`), `ts/packages/core/test/utils/jsonSchema.test.ts` (new test asserting injected description; existing tests that assert `properties.v` deep-equals the sentinel must be updated to tolerate the new `description`).
- **No public API changes** under Option A; Option B adds one optional field to `DereferenceJsonSchemaOptions`.
- **Cross-package impact:** None — Mastra consumes the helper transparently.

## Acceptance Criteria

- [ ] New test in `jsonSchema.test.ts`: dangling `$ref` with no sibling description → output sentinel includes the injected hint.
- [ ] Existing test "preserves resolvable $defs while replacing only the dangling branch (mixed schema)" (and similar) updated to tolerate the new `description` field.
- [ ] Test that caller-provided `description` is preserved (regression for sibling-merge).
- [ ] `mastra-dangling-defs.test.ts` extended to assert the wrapped `outputSchema` carries either the original or injected hint string.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- Tracking issue: https://github.com/ComposioHQ/composio/issues/3307
- Source: `ts/packages/core/src/utils/jsonSchema.ts:214-219`, sibling-merge at `:229-234`.
- Agent-native principle: features visible to humans should be accessible to agents.
