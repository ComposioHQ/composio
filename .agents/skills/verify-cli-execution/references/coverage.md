# Validate and execute a tool

Property: `DryRunDoesNotExecute`. A dry run must send zero tool execution requests.

Harm: A validation-only request could send email, alter files, or incur a tool charge.

## Code mapping

| Source                                                                                                                                 | Modeled transition or boundary                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [src/commands/tools/execute/tools.execute.handler.ts](../../../../ts/packages/cli/src/commands/tools/execute/tools.execute.handler.ts) | runExecuteWithSpinner exits its dryRun branch before executor.execute; results and output can fail separately. |
| [src/commands/tools/execute/tools.execute.context.ts](../../../../ts/packages/cli/src/commands/tools/execute/tools.execute.context.ts) | Resolve project/user/account and select the execution target before the call.                                  |
| [src/services/tools-executor.ts](../../../../ts/packages/cli/src/services/tools-executor.ts)                                           | Permission gate, uploads, selected send, and response normalization.                                           |
| [src/services/dashboard-tool-execution.ts](../../../../ts/packages/cli/src/services/dashboard-tool-execution.ts)                       | Consumer transport choice, request deadline, and input_required/error interpretation.                          |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

One single-tool invocation, two transport categories, two dry-run values, and abstract permission, response, and output outcomes.

Dry runs can still resolve projects/accounts, fetch schemas, refresh caches, and record local history. The model counts only tool execution sends. Parallel batches, schema-only mode, permission UI internals, uploads, and remote tool semantics are excluded. An interrupted or timed-out request can already have taken effect. A remote success followed by local output failure still exits unsuccessfully; this is not evidence that replay is safe. No automatic cross-transport retry is modeled.

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

Real-code mutation: Bypass the dry-run branch so the handler reaches the executor. The dry-run result contract must fail.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
