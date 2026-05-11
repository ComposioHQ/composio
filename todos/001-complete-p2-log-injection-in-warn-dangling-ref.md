---
status: pending
priority: p2
issue_id: 001
tags: [code-review, security, mastra, logging]
dependencies: []
---

# Log injection / forging in `warnDanglingRefOnce` (CWE-117)

## Problem Statement

`MastraProvider.warnDanglingRefOnce` interpolates three API-controlled strings (`tool.slug`, `tool.toolkit?.slug`, `ref`) directly into a `logger.warn` template. `ref` is the most exposed: it comes verbatim from the Composio API's tool schema. Under the threat model the rest of this PR accepts (a trusted-but-not-fully-controlled upstream), an attacker who can shape `outputParameters` can plant a `$ref` value containing `\n`, `\r`, ANSI escape sequences (`\x1b[…`), or terminal-clearing CSI sequences. These will be written verbatim to stderr — classic CWE-117 (Improper Output Neutralization for Logs).

Real-world impact:
- Forged log lines that masquerade as later, unrelated entries.
- Terminal corruption when a developer is running a Composio-powered agent locally and stderr is colorized.
- SIEM / log-aggregator noise when ANSI bytes leak into structured ingest.

## Findings

- File: `ts/packages/providers/mastra/src/index.ts:163-169`
- Source: `security-sentinel` agent (Medium severity finding) and `agent-native-reviewer` agent (recommended structured logging as a related fix).
- The repo's logger (`ts/packages/core/src/utils/logger.ts:42-66`) only `JSON.stringify`s object args, not interpolated strings. There is no built-in sanitization.
- The same CWE-117 pattern exists at `ts/packages/core/src/utils/jsonSchema.ts:197` (the pre-existing external-`$ref` warn). Out of scope for this todo but worth a follow-up commit when this one lands.

## Proposed Solutions

### Option A — `JSON.stringify` the user-controlled segments (recommended)

```ts
logger.warn(
  `[composio/mastra] Tool ${JSON.stringify(tool.slug)} ` +
    `(toolkit ${JSON.stringify(toolkitSlug)}) declares ` +
    `$ref ${JSON.stringify(ref)} but no matching $defs/definitions entry ` +
    `(${reason}). Falling back to a permissive object schema for this ` +
    `branch — the wrapped Mastra tool will validate this property loosely. ` +
    `Tracked in https://github.com/ComposioHQ/composio/issues/3307.`
);
```

- **Pros:** Minimal change. Renders quoted strings (clear visual marker that the value is data, not log prose). Neutralizes newlines / control / ANSI. Idiomatic and well-known.
- **Cons:** Slightly noisier-looking output — the slug and ref get wrapped in `"..."`.
- **Effort:** Small (~5 LOC).
- **Risk:** Low. Updates the existing 3-`toContain` assertion in `mastra-dangling-defs.test.ts:130-138` to expect the quoted forms.

### Option B — Strip control bytes before interpolating

```ts
const safe = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, '');
logger.warn(
  `[composio/mastra] Tool ${safe(tool.slug)} (toolkit ${safe(toolkitSlug)}) ` +
    `declares $ref ${safe(ref)} ...`
);
```

- **Pros:** Output reads identically when input is benign. Strict allowlist of safe bytes.
- **Cons:** Hand-rolled regex; one more place to update if the threat model expands; loses visual signal that the data is attacker-shaped.
- **Effort:** Small.
- **Risk:** Low.

### Option C — Pass user data as a structured 2nd arg to `logger.warn`

```ts
logger.warn('[composio/mastra] Dangling $ref in tool schema. Falling back...', {
  toolSlug: tool.slug,
  toolkitSlug,
  ref,
  reason,
  issue: 'https://github.com/ComposioHQ/composio/issues/3307',
});
```

- **Pros:** Logger `JSON.stringify`s objects (`logger.ts:42-58`), which intrinsically neutralizes control bytes. Also addresses the agent-native finding (structured args for log scrapers). Best long-term shape.
- **Cons:** Slightly larger refactor; tests need to assert against both args.
- **Effort:** Small-Medium.
- **Risk:** Low.

## Recommended Action

_(Filled during triage.)_

## Technical Details

- **Files affected:** `ts/packages/providers/mastra/src/index.ts` (`warnDanglingRefOnce`), `ts/packages/providers/mastra/test/mastra-dangling-defs.test.ts` (one warn-content assertion).
- **No database changes.**
- **No public API changes** under Option A or B. Option C would also be a non-breaking addition.

## Acceptance Criteria

- [ ] A test in `mastra-dangling-defs.test.ts` constructs a tool whose `$ref` contains `\n` and ANSI escape sequences; asserts the warning message does NOT contain raw newlines or `\x1b` bytes.
- [ ] All existing tests in `mastra-dangling-defs.test.ts` still pass after the assertion is updated.
- [ ] Lint / typecheck clean.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- Related upstream tracking: https://github.com/ComposioHQ/composio/issues/3307
- CWE-117: https://cwe.mitre.org/data/definitions/117.html
- Source file: `ts/packages/providers/mastra/src/index.ts:163-169`
