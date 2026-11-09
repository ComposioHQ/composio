# Parse a command and report its outcome once

Property: `HooksRequireParsedAction`. Invocation hooks may run only for a selected action with parsed input.

Harm: Help, version, or a typo could cause network activity and update/plugin side effects before a real command is selected.

## Code mapping

| Source                                                                                               | Modeled transition or boundary                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [src/invocation/invocation.ts](../../../../ts/packages/cli/src/invocation/invocation.ts)             | begin gates hooks on parsed input; telemetry wraps dispatch; reportInvocationFailure and runnerCause preserve reporting/exit markers. |
| [src/commands/registration.ts](../../../../ts/packages/cli/src/commands/registration.ts)             | Registration identity enters before begin; selected handlers begin, reject flags, then enforce login.                                 |
| [src/invocation/command-identity.ts](../../../../ts/packages/cli/src/invocation/command-identity.ts) | Inherited metadata, hook opt-outs, and identity shape.                                                                                |
| [src/commands/root-help.ts](../../../../ts/packages/cli/src/commands/root-help.ts)                   | Help/version and bare-group actions begin without parsed input.                                                                       |

| [src/commands/index.ts](../../../../ts/packages/cli/src/commands/index.ts) | The parser prints ShowHelp before its tapError begins the named command. |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

Five parse outcomes, one selected registration, and success, unreported failure, or already-reported failure.

An own-action group such as dev is an action, not bare-group help. Hook opt-out predicates are abstracted as enabled/disabled decisions. Reporting and telemetry order appear in the flow, but this invariant does not prove exactly-once telemetry or exactly-one diagnostic for arbitrary mixed causes. The existing reporting tests provide example-based coverage. Hook failures, concurrent begin calls, inherited metadata combinations, and Effect cause composition are not exhaustively modeled.

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

Real-code mutation: Run invocation hooks even without parsed input. The existing help/version/parse-error no-hook assertions must fail.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
