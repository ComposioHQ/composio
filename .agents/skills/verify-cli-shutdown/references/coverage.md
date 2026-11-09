# Stop a listener or a supervised script

Property: `CooperativeSignalIsNotInterruption`. A first signal accepted by a registered cooperative command must not interrupt its invocation.

Harm: Ctrl+C or SIGTERM could abandon listener cleanup or prevent a child script from handling its stop signal.

## Code mapping

| Source                                                                                         | Modeled transition or boundary                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [src/services/shutdown-signal.ts](../../../../ts/packages/cli/src/services/shutdown-signal.ts) | makeShutdownController tracks scoped registrations; LISTENER_STOP accepts INT/TERM only.                                        |
| [src/run-main.ts](../../../../ts/packages/cli/src/run-main.ts)                                 | First signal offers cooperation before interruption; second signal/deadline forces exit; exitActionFor preserves child signals. |
| [src/commands/run/run.handler.ts](../../../../ts/packages/cli/src/commands/run/run.handler.ts) | superviseChild, relayStopToChild, two-second TERM/KILL escalation, scoped forwarding and force kill.                            |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

Three command modes; INT, TERM, and HUP; registration before or after first-signal availability; two child escalation steps and four child outcomes.

This models POSIX supervision. Windows uses the process spawner finalizer instead. The two-second child grace periods and ten-second runner deadline are discrete events. Signal delivery to process groups, ESRCH races, pipe flushing, the one-second re-raise fallback, and operating-system scheduling are not proved. A second signal forces using that signal; the deadline forces using the first signal. Only accepted first signals carry the cooperative guarantee; pre-registration signals and listener SIGHUP interrupt normally.

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

Real-code mutation: Invert the runner cooperation branch while a cooperative command is still cleaning up. The existing in-progress-stop test must fail before the second signal.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
