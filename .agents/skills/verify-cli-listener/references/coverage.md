# Listen, finish accepted events, and clean up

Property: `CleanupAttemptBeforeCompletion`. A normally completed listener with an acquired temporary trigger must have attempted to disable it.

Harm: A temporary trigger could remain active after its listener exits without even attempting cleanup.

## Code mapping

| Source                                                                                                       | Modeled transition or boundary                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| [src/commands/listen/listen.handler.ts](../../../../ts/packages/cli/src/commands/listen/listen.handler.ts)   | runListen acquireUseRelease; trigger upsert, per-event fibers, stop race, and release cleanup.          |
| [src/commands/triggers/sink-failures.ts](../../../../ts/packages/cli/src/commands/triggers/sink-failures.ts) | finishAcceptedEvents bounds normal draining; makeSinkFailures distinguishes diagnostics from fail-fast. |
| [src/services/triggers-realtime.ts](../../../../ts/packages/cli/src/services/triggers-realtime.ts)           | Subscribe acknowledgment precedes cooperative registration; unsubscribe/disconnect on scope release.    |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

Two accepted events with independently completing or failing sinks, project events versus temporary triggers, normal stop, signal, fail-fast, and forced stop. Stop events and callbacks can interleave.

Cleanup is best-effort: a disable request can fail and the invocation can still end. The property proves an attempt, not successful deletion or exactly-once delivery. Max-events counts accepted matching events even when saving fails; it is not a strict admission cap while callbacks overlap. Forced exits are excluded from cleanup guarantees. Subscription failures release acquired triggers. Chunk reassembly, reconnects, event filtering and duplicate-id implementation are abstracted; an AcceptEvent means filtering/deduplication already passed. Drain timeout or signals can leave partial writes.

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

Real-code mutation: Skip the temporary-trigger release call. The existing client test can no longer observe its failed disable request and warning, so its assertion must fail.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
