# Docs Decisions

Neutral decision records and long-running docs plans. Add every new decision record here.

Read these when a docs change touches an existing architecture, generated-data pipeline, or documented product pattern:

- `examples.md` - cookbook/examples restructuring plan.
- `feedback.md` - feedback collection system.
- `llm-guardrails.md` - LLM guardrail injection for markdown endpoints.
- `toolkits.md` - toolkit page data and rendering decisions.
- `cookbooks-revamp-plan.md` - historical cookbook revamp tracker.

## SDK and release decisions

Cross-language decisions that govern how the TypeScript and Python SDKs reach and hold a stable 1.0:

- `sdk-1.0-stability-contract.md` - what 1.0 promises, the stable vs experimental split, and version coordination.
- `cross-sdk-parity-policy.md` - the parity rules, the living parity matrix, and the planned `validate:sdk-parity` check.
- `sdk-v0-to-v1-migration.md` - the staged 0.x to 1.0 transition, alias bridges, and migration tooling.
- `generated-client-codegen.md` - replacing Stainless with Hey API as the self-hosted generator for the two client repos, keeping the deterministic PR pipeline.
- `tool-router-session-hooks.md` - experimental TypeScript and Python middleware hooks for Tool Router session helpers.
- `sdk-v1-readiness.md` - the parity comparison and the engineering backlog behind the three records above (analysis, not a decision).
