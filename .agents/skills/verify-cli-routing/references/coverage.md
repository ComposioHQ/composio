# Choose the project, acting user, and connected account

Property: `NoAmbiguousAccountChosen`. Multiple usable accounts without an explicit selector or default alias must never resolve to an account.

Harm: An agent could read from or write to the wrong mailbox or workspace.

## Code mapping

| Source                                                                                                                 | Modeled transition or boundary                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/services/connected-account-selection.ts](../../../../ts/packages/cli/src/services/connected-account-selection.ts) | resolveConnectedAccountForToolkit rejects ambiguity after filtering ACTIVE and non-disabled accounts. The lower-level selector alone still chooses newest. |
| [src/services/command-project.ts](../../../../ts/packages/cli/src/services/command-project.ts)                         | resolveCommandProject chooses consumer, explicit developer name, or directory developer context.                                                           |
| [src/services/project-context.ts](../../../../ts/packages/cli/src/services/project-context.ts)                         | Environment pair precedes directory .env/project.json search.                                                                                              |
| [src/commands/surface.ts](../../../../ts/packages/cli/src/commands/surface.ts)                                         | actingUser resolves a project before user precedence; directory user applies only to the same project.                                                     |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

Two command trees and six representative account sets, after decoding/filtering. Project/user sources are abstract categories. A directory user transition means the project-id equality check already passed.

This property checks the high-level resolver, not resolveConnectedAccountSelection or cached default mappings in isolation. Multiple accounts with the default alias still use newest-first ordering. Whitespace selectors count as absent. The model does not enumerate every string, pagination, cache invalidation, every project precedence combination, or account changes after selection.

Each yielding I/O operation is a separate model action; a successful model step
means the operation returned successfully. Pure branch decisions are modeled as
indivisible. Terminal self-loops represent an invocation that has already ended,
not a promise that an external service eventually responds. No fairness or
unbounded liveness claim is made.

## Negative control

Set `Mutant = TRUE` to enable the missing guard or reordered step in the model.
`--mutations` also copies the real CLI source and tests outside the checkout,
applies the concrete mutation recorded in `ts/packages/cli/scripts/formal/manifest.json`, and
requires an assertion failure in the selected existing test. A crash, timeout,
or test-load failure does not count as detecting a regression. In the scratch test
copy, expected failures are observed through `Effect.exit` before asserting, so
unexpected success or a defect produces a contract assertion instead of escaping
before the assertion runs. It restores the
copied file and requires the same test to pass again.

Real-code mutation: Remove the high-level ambiguity guard. The unchanged low-level resolver then silently picks newest, and the existing ambiguity assertions must fail.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
