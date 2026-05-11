---
status: pending
priority: p3
issue_id: 007
tags: [code-review, api, follow-up, cross-team]
dependencies: []
---

# API-side: emit a top-level `$defs` block alongside any `$ref`

## Problem Statement

This SDK PR (PR #3400) makes the Mastra provider resilient to dangling `$ref` pointers, but it does **not** fix the root cause. The Composio API (`/api/v3/tools/:slug`) serves some tools (Gmail, Slack, Google Calendar, anything whose generator emits `outputParameters` with internal references) with a `$ref` into `#/$defs/...` and **no top-level `$defs` block**. Every consumer downstream — Mastra (validates output), Vercel AI SDK (if it ever validates output), any future provider, third-party tooling that reads `tools.get` raw — has to compensate.

The proper long-term fix lives in the backend: emit a `$defs` block whose entries cover every `#/$defs/...` pointer the schema references. The SDK fix is intentionally independent so we don't block on this, but it should be tracked so the API-side work isn't forgotten.

## Findings

- Source: every review agent observed the SDK fix is a workaround for an API-side defect.
- Confirmed via the reproducer in the original issue: `composio.tools.getRawComposioTools({ tools: ['GMAIL_FETCH_EMAILS'] })` returns `outputParameters` with `$ref` and no `$defs`.
- Affected toolkits (incomplete): Gmail, Slack, Google Calendar, anything whose `outputParameters` carries a `$ref`. A full audit is part of the backend fix.

## Proposed Solutions

### Option A — File a backend ticket; coordinate with the Composio platform team (recommended)

- Open a Linear ticket in the API project (not in the SDK project) describing:
  - The failure mode (with the GMAIL_FETCH_EMAILS reproduction).
  - The expected fix (emit `$defs` alongside every `$ref` the generator produces).
  - The acceptance criterion (after fix: no Mastra `warnDanglingRefOnce` triggers in production for any toolkit).
  - Telemetry from todo #003 (if landed) as a proxy for "is this still happening?"
- Link the SDK PR #3400 and GitHub issue #3307 from the backend ticket.

- **Pros:** Closes the loop. Once the API fix lands, the SDK fallback is purely defensive (still useful for older API versions).
- **Cons:** Requires cross-team coordination; the SDK team is now blocked on the API team for the *real* fix.
- **Effort:** Small for the SDK team (a ticket); larger for the API team (the actual fix + regen of affected schemas).
- **Risk:** Low.

### Option B — Document the gap publicly (do nothing internally)

Leave it to external users to discover via the warning. Wait for community pressure.

- **Pros:** Zero work.
- **Cons:** Customers see degraded schemas on Gmail / Slack / GCal until the backend gets around to it. Misses the chance to close the issue cleanly.
- **Effort:** None.
- **Risk:** Low–Medium (reputation).

## Recommended Action

_(Filled during triage. Option A is strongly recommended.)_

## Technical Details

- **No code changes** in this repo for this todo. The "deliverable" is a backend ticket.
- **Verification, once landed:** the telemetry from todo #003 should trend to zero for the affected toolkits. The SDK warning should stop firing in production.

## Acceptance Criteria

- [ ] A Linear ticket exists in the API project, owned by the API team.
- [ ] The ticket references SDK PR #3400 and GitHub issue #3307.
- [ ] The ticket lists at least Gmail, Slack, and Google Calendar as known-affected toolkits.
- [ ] (Post-fix) Telemetry for `mastra.wrapTool.danglingRef` (if landed) shows zero events for the listed toolkits.

## Work Log

_(empty)_

## Resources

- PR: https://github.com/ComposioHQ/composio/pull/3400
- Tracking issue: https://github.com/ComposioHQ/composio/issues/3307
- SDK-side todo for telemetry signal: todos/003-pending-p2-telemetry-signal-for-dangling-refs.md
