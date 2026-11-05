---
name: verify-change
description: Maintain resumable task records, select repository verification profiles, inspect revision-bound receipts, and carry work between coding agents. Use for substantial SDK or CLI work spanning sessions, evidence review, or carrying work between coding agents; use package-specific skills for implementation and ordinary small edits.
---

# Verify Change

Write agent-tooling scripts and tests in TypeScript and execute them with Bun; do not add `.mjs` or Node entrypoints. Existing SDK languages and package-management commands keep their repository ownership.

Use [the verification map](references/verification-map.md) to select the existing
checks and preserve a task's goal, authority, next step and blockers across sessions.

1. For substantial work, initialize one task with the requested outcome and a
   matching profile. Keep the actual user request authoritative.
2. Inspect `status` when resuming, update `nextStep` and `blocker` in its local
   `task.json`, and refresh external issue, PR and CI state before acting.
3. Run the profile after implementation. Read the receipt and its boundary before
   reporting what passed. A passing profile establishes only its named checks.
4. Treat a recurring intervention as a candidate for an existing behavioral test,
   type or lint check. Prove the check rejects the original mistake. Preserve
   one-off judgment locally instead of expanding global instructions.

Do not create task records for trivial edits. Private task data and command output
stay under ignored `.artifacts/`; never attach them wholesale to a PR. This tool
records context and evidence, and does not grant commit, push, merge or release
authority.
