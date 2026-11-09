---
name: verify-cli-link
description: Verify CLI connection authorization. Use for changes to connected-account linking, pending-link output, or ACTIVE authorization confirmation.
---

# Connect an account and confirm authorization

Run from the repository root:

```bash
bun ts/packages/cli/scripts/formal/verify.ts link
```

Read [the coverage record](references/coverage.md) before interpreting a pass.
Read the [TLA+ model](models/CliLink.tla),
[configuration](models/CliLink.cfg), and [chart view](models/view.mjs).
Use the pstack `/statechart` skill to read every TLA+ result and visualize
counterexamples. Resolve its current instructions with `pstack-skill path statechart`.

The command checks source hashes, the bounded model, and existing behavior tests
in a temporary copy. Add `--mutations` to confirm that both a broken model and
a matching change to real TypeScript fail, then rerun the restored code.
It never changes the checkout's product code or calls live Composio services.

Last confirmed against `149514f2659eab97138c0d1781e7fa8de4e8b343`.
When a covered function changes, compare its transitions with the model first.
Update the model and coverage record for intentional behavior changes, replay
any counterexample against the real code, and rerun with `--mutations`.
Only then update `sources` hashes and `syncCommit` in `ts/packages/cli/scripts/formal/manifest.json`
and advance this skill's confirmation commit. A changed source hash is a request
to review the model, not a proof that behavior changed. Never weaken a property
just to pass, or change product behavior as part of verifying it.

This pass covers the stated finite model. It is not a proof of the TypeScript,
Effect runtime, operating system, or remote service.
