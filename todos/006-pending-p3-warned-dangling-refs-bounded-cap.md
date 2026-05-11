---
status: pending
priority: p3
issue_id: 006
tags: [code-review, mastra, dos, performance]
dependencies: []
---

# Consider bounding `warnedDanglingRefs` for long-lived agent processes

## Problem Statement

`MastraProvider.warnedDanglingRefs` (`ts/packages/providers/mastra/src/index.ts:42`) is a per-instance `Set<string>` keyed by `${tool.slug}::${ref}`. Entries are added on first dangling-`$ref` replacement and never evicted for the provider's lifetime. For a single Composio toolkit (~1000 tools, a few refs each), the practical worst case is ~5000 entries × ~60–80 bytes ≈ ~300–500 KB per provider. Acceptable today.

The security-sentinel agent flagged this as **CWE-770 (Allocation of Resources Without Limits)** in the theoretical case of a long-lived multi-tenant agent process talking to a misbehaving / attacker-shaped upstream that serves distinct refs per `wrapTool` call. The architecture and performance agents both observed this and judged it acceptable for current workloads. Three agents — no immediate action, but track as a follow-up.

## Findings

- File: `ts/packages/providers/mastra/src/index.ts:42, 158-161`.
- Source: `security-sentinel` (CWE-770), `architecture-strategist` (P2), `performance-oracle` (P3, "Acceptable").
- Real-world bound: `(#tools × avg #dangling-refs-per-tool)`. Currently small.
- The same dedup pattern is used by `Tools.warnedAutoUploadDisabledForTool` (`ts/packages/core/src/models/Tools.ts:88-93`), which is also unbounded. Whatever solution lands here should match that one for consistency.

## Proposed Solutions

### Option A — LRU cap (e.g., max 1000 entries) (recommended if action is taken)

Use a small LRU instead of a `Set`. Replace with:

```ts
import { LRUCache } from 'lru-cache'; // or roll a tiny inline LRU
private warnedDanglingRefs = new LRUCache<string, true>({ max: 1000 });
```

- **Pros:** Bounded memory; matches OWASP guidance for log-suppression caches. Worst case ~500 KB.
- **Cons:** Adds `lru-cache` as a dependency to `@composio/mastra` (it isn't currently). Or hand-roll a 20-line LRU.
- **Effort:** Small (Medium if hand-rolling).
- **Risk:** Low. After the cap is reached, an evicted-then-re-encountered `(slug, ref)` will warn a second time — a minor UX regression in pathological cases, acceptable.

### Option B — `WeakMap<Tool, Set<string>>` keyed on the tool object

Eviction comes for free when the `Tool` is GC'd.

- **Pros:** No cap needed; eviction is automatic when callers stop holding the `Tool` reference.
- **Cons:** Doesn't actually solve the problem — agents typically retain `Tool` references for the session, so this doesn't help long-lived processes much. Also doesn't match the existing `Tools.warnedAutoUploadDisabledForTool` pattern.
- **Effort:** Small.
- **Risk:** Low.

### Option C — Status quo (accept the unbounded set)

- **Pros:** Zero work. Consistent with `Tools.warnedAutoUploadDisabledForTool` precedent.
- **Cons:** Latent risk in the multi-tenant / pathological case. Both security and architecture reviewers said "not blocking but track."
- **Effort:** None.
- **Risk:** Low (and is the current state).

## Recommended Action

_(Filled during triage. Reviewer consensus is "Option C is fine for now; revisit if telemetry shows growth." The triager may want to coordinate with the analogous unbounded-set in `Tools.ts:88-93` for a single sweep.)_

## Technical Details

- **Files affected (if Option A/B):** `ts/packages/providers/mastra/src/index.ts`, possibly `package.json` for a new dep.
- **Cross-cutting decision:** Whether to apply the same fix to `Tools.warnedAutoUploadDisabledForTool` for consistency.
- **No public API changes.**

## Acceptance Criteria

- [ ] Decide between Options A / B / C.
- [ ] If A: cap behavior tested (after N+1 distinct entries, eviction occurs but the warning still emits at most once until eviction).
- [ ] If A or B: matches `Tools.warnedAutoUploadDisabledForTool` pattern, or document the divergence.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- CWE-770: https://cwe.mitre.org/data/definitions/770.html
- Analogous pattern: `ts/packages/core/src/models/Tools.ts:88-93` (`warnedAutoUploadDisabledForTool`)
