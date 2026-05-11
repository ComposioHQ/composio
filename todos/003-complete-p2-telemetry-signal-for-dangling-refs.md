---
status: pending
priority: p2
issue_id: 003
tags: [code-review, agent-native, telemetry, mastra]
dependencies: []
---

# Fire a telemetry signal when a dangling `$ref` is encountered

## Problem Statement

The dangling-`$ref` fallback is the canary for an upstream API bug — the Composio API ships `outputParameters` with a `$ref` into `#/$defs/...` without ever declaring `$defs`. Right now the SDK degrades silently (with a `logger.warn` to stderr) and **does not emit any telemetry**, so the Composio team has no aggregate visibility into which toolkits / tools are affected, how often, or whether the API-side fix lands successfully when it ships. Stderr noise is not a substitute for an event stream.

The agent-native review explicitly called this out: "should fire `TelemetryService.sendMetric` so the Composio team can prioritize the upstream API fix."

## Findings

- Source: `agent-native-reviewer` agent (point 3 of their review).
- Existing telemetry surface: `ts/packages/core/src/services/telemetry/TelemetryService.ts:12` exposes `sendMetric(payload)`. The payload schema at `TelemetryService.types.ts:29-57` accepts `functionName`, `props`, `metadata.provider`. Perfect fit.
- Dedup already exists via `warnedDanglingRefs` (`mastra/src/index.ts:42, 158-161`), so a one-shot-per-`(slug, ref)` event drops in naturally next to the warn call.
- Affected file: `ts/packages/providers/mastra/src/index.ts` (`warnDanglingRefOnce`).

## Proposed Solutions

### Option A — Emit one telemetry event per first dangling-ref replacement (recommended)

```ts
private warnDanglingRefOnce(tool: Tool, ref: string, reason: UnresolvedRefReason): void {
  const key = `${tool.slug}::${ref}`;
  if (this.warnedDanglingRefs.has(key)) return;
  this.warnedDanglingRefs.add(key);
  const toolkitSlug = tool.toolkit?.slug ?? 'unknown';
  logger.warn(/* ... existing warning ... */);
  // New: one-shot telemetry per (toolSlug, ref). The Composio team uses this
  // to prioritize fixing the upstream `outputParameters` schema.
  telemetry.sendMetric([
    {
      functionName: 'mastra.wrapTool.danglingRef',
      props: { toolSlug: tool.slug, toolkitSlug, ref, reason },
      metadata: { provider: 'mastra' },
    },
  ]);
}
```

- **Pros:** Tiny addition (~6 LOC). Uses an existing service, existing dedup. One event per `(slug, ref)` per process — bounded, low-volume. Composio team gets actionable aggregate data; customers respect existing `COMPOSIO_DISABLE_TELEMETRY=true` opt-out.
- **Cons:** Names a Mastra-internal event in the global telemetry stream; if other providers later opt into `'sentinel'` mode (e.g., a future Vercel AI SDK v5 integration), the event name should generalize. Suggest `composio.dereferenceJsonSchema.danglingRef` with `provider: 'mastra'` in metadata.
- **Effort:** Small.
- **Risk:** Low. Telemetry is fire-and-forget; failure does not block tool wrapping.

### Option B — Telemetry inside `dereferenceJsonSchema` itself (in core, not the provider)

Push the telemetry call into the lenient branch of `walk` so any consumer that opts into `'sentinel'` mode emits the signal automatically.

- **Pros:** Catches future providers that adopt the lenient path without each having to remember to wire telemetry.
- **Cons:** Couples `@composio/core`'s pure schema utility to the Composio telemetry service — a layering violation. Today only Mastra opts in; YAGNI.
- **Effort:** Small.
- **Risk:** Low–Medium. Wrong abstraction level.

### Option C — Status quo (no telemetry)

Rely on user-reported issues + log scraping.

- **Pros:** No work.
- **Cons:** The whole reason the warning exists is observability; we're stopping short of the closure. The Composio team can't see the rate or the affected toolkits unless someone files a bug.
- **Effort:** None.
- **Risk:** None today; perpetuates blindness on the API-side gap.

## Recommended Action

_(Filled during triage.)_

## Technical Details

- **Files affected:** `ts/packages/providers/mastra/src/index.ts` (`warnDanglingRefOnce` + telemetry import).
- **Telemetry payload:** `{ functionName, props: { toolSlug, toolkitSlug, ref, reason }, metadata: { provider: 'mastra' } }`.
- **Respects opt-out:** `COMPOSIO_DISABLE_TELEMETRY=true` already silences the telemetry service globally.
- **No public API changes.**

## Acceptance Criteria

- [ ] `warnDanglingRefOnce` emits exactly one telemetry event per `(toolSlug, ref)` pair per provider instance.
- [ ] Test verifying telemetry is fired on the dangling-ref path (mock the telemetry service).
- [ ] Test verifying telemetry is NOT fired for resolvable `$refs`.
- [ ] Test that telemetry opt-out (`COMPOSIO_DISABLE_TELEMETRY=true`) suppresses the new event.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- Tracking issue: https://github.com/ComposioHQ/composio/issues/3307
- Telemetry surface: `ts/packages/core/src/services/telemetry/TelemetryService.ts:12`
- Telemetry payload schema: `ts/packages/core/src/services/telemetry/TelemetryService.types.ts:29-57`
- Dedup Set: `ts/packages/providers/mastra/src/index.ts:42, 158-161`
