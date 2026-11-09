# CLI state machines

Seven implicit state machines govern the CLI's highest-impact user flows. Each has
a local verification skill, a finite TLA+ model, a TLC-generated Mermaid statechart,
and an SVG rendered with Pele.

```bash
bun ts/packages/cli/scripts/formal/verify.ts execution --mutations
```

Replace `execution` with `login`, `link`, `routing`, `listener`, `shutdown`, or
`invocation`. The verifier checks the model and existing tests in a scratch copy.
With `--mutations`, it also removes a guard in that copy, requires an assertion
failure, restores it, and requires the same test to pass. In scratch only,
`Effect.flip` expectations observe the full `Exit` before asserting, so unexpected
successes and defects become explicit public-contract assertions. The checkout's
tests remain untouched. Dependencies must already
be installed. The first run installs checksum-pinned TLC 1.7.4 and pinned Java
through mise; it needs network access. Subsequent runs reuse them.

## Priority and ownership

Priority reflects the harm of a broken transition and the difficulty of exercising
its ordering in ordinary tests. It is an engineering judgment, not usage telemetry.

| Priority | Subsystem and skill                                                                                 | Why it matters                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | [Execute a tool](../../../../../.agents/skills/verify-cli-execution/SKILL.md)                       | An unintended execution can mutate external data or incur a charge. Dry-run, permission, transport, remote outcome, and local output are separate decisions.                                            |
| 2        | [Choose the acting identity and account](../../../../../.agents/skills/verify-cli-routing/SKILL.md) | A correct tool call under the wrong project, user, or account can affect the wrong mailbox or workspace. The high-level ambiguity guard matters even though the lower-level selector can choose newest. |
| 3        | [Sign in](../../../../../.agents/skills/verify-cli-login/SKILL.md)                                  | Browser approval and local credential persistence cross CLI invocations. A cached URL or pending session is not a verified login.                                                                       |
| 4        | [Connect an account](../../../../../.agents/skills/verify-cli-link/SKILL.md)                        | Creating an authorization link and confirming an ACTIVE account are different outcomes. A pending link must remain visibly pending.                                                                     |
| 5        | [Listen and stop](../../../../../.agents/skills/verify-cli-listener/SKILL.md)                       | Subscription acknowledgment, event callbacks, sink writes, stop conditions, and trigger cleanup can overlap. An exit code alone cannot prove delivery.                                                  |
| 6        | [Stop a supervised script](../../../../../.agents/skills/verify-cli-shutdown/SKILL.md)              | The first signal, scoped cooperation, child process groups, escalation timers, and the final exit status interact across several modules.                                                               |
| 7        | [Parse, dispatch, and report](../../../../../.agents/skills/verify-cli-invocation/SKILL.md)         | Parsing determines identity. Help, version, parse failures, hooks, authentication checks, telemetry, and reporting must retain their order.                                                             |

## Verification result

Checked on 2026-11-09 against source commit
`149514f2659eab97138c0d1781e7fa8de4e8b343`, with file hashes covering the
actual source, model, and verifier. [Receipts](evidence.json) record the tool versions,
lockfile hash, selected tests, and failing assertions from the deliberate mutations.

- All seven safety invariants and deadlock checks pass across 841 reachable states.
- All 214 selected existing behavior tests pass.
- Each of seven broken models violates its named invariant.
- Each corresponding TypeScript mutation causes assertion failures in existing tests.
- All 21 selected restoration checks pass after dropping the source mutations.

These results cover the stated finite models, not every execution of the
TypeScript or the remote services. Each skill's coverage record names the atomic
steps, assumptions, excluded cases, and confirmation commit. Source hashes stop
the verifier when a covered file changes; they do not prove model equivalence.
The negative-control charts below depict deliberately broken copies. They are
not findings against the current CLI.

## Read the user flows

Start with sign-in, connect an account, and execute. Use the listener and shutdown
charts for long-running work. Invocation is the shared envelope around each command.
The charts merge equivalent visible states and omit transitions that remain inside
one visible state. They do not otherwise filter arrows. Each generated report lists
the number of hidden steps. In particular, per-event writes, intermediate retries,
and child grace-period changes can remain inside a visible state.

### Sign in

[Skill and scope](../../../../../.agents/skills/verify-cli-login/SKILL.md) · [SVG](login/current.svg) · [Mermaid](login/current.mmd) · [TLC report](login/current-report.md)

![Sign in](login/current.svg)

```mermaid
---
title: "Sign in and complete a browser handoff"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: success
    lg1: failure
    lg2: active
  }
  class lg0 teal
  class lg1 orange
  class lg2 blue
  s0: Choose login method
  s1: Login failed#59; retry explicitly
  s2: Login method accepted
  s3: Keep browser handoff
  s4: Open the login URL
  s5: Credentials saved
  s6: Handoff expired#59; start again
  s7: Wait for browser approval
  s8: Signed in
  s9: Check login status
  [*] --> s0
  s0 --> s1: the supplied key or agent verification fails
  s0 --> s2: the supplied key or ready agent is verified
  s0 --> s3: request a browser login
  s2 --> s1: credential lookup or storage fails
  s2 --> s5: save the credential
  s3 --> s4: save the pending login
  s4 --> s6: resume after the local cache TTL
  s4 --> s7: complete login now or run login --poll
  s5 --> s8: report the stored login
  s7 --> s9: receive a poll response
  s9 --> s7: wait before polling again
  s9 --> s2: the browser session is linked
  s9 --> s1: exhaust the retry budget
  class s0 blue
  class s1 orange
  class s2 blue
  class s3 blue
  class s4 blue
  class s5 teal
  class s6 orange
  class s7 blue
  class s8 teal
  class s9 blue
```

`BrowserSessionMustBeLinked` holds in 65 reachable states.

Negative control: Accept an unlinked session in requireLinkedNow. The existing no-wait pending-session test must fail.

The shortest path has 5 steps: 0. Choose login method

1. request a browser login: Keep browser handoff
2. save the pending login: Open the login URL
3. complete login now or run login --poll: Wait for browser approval
4. receive a poll response: Check login status
5. accept an unlinked browser session: Unlinked browser session incorrectly accepted

[Broken-copy chart](login/counterexample.svg) · [Mermaid](login/counterexample.mmd) · [Counterexample report](login/counterexample-report.md)

### Connect an account

[Skill and scope](../../../../../.agents/skills/verify-cli-link/SKILL.md) · [SVG](link/current.svg) · [Mermaid](link/current.mmd) · [TLC report](link/current-report.md)

![Connect an account](link/current.svg)

```mermaid
---
title: "Connect an account and confirm authorization"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: success
    lg1: failure
    lg2: active
  }
  class lg0 teal
  class lg1 orange
  class lg2 blue
  s0: Resolve project and acting user
  s1: Check alias against visible accounts
  s2: Link request returned
  s3: Link failed#59; inspect account before retry
  s4: Show the authorization URL
  s5: Wait for account authorization
  s6: Authorization URL returned#59; still pending
  s7: Check account status
  s8: Account confirmed ACTIVE
  [*] --> s0
  s0 --> s1: resolve project and user#59; load alias hints
  s1 --> s2: request a Tool Router or legacy link
  s1 --> s3: the requested alias is already in use
  s2 --> s3: another account needs --alias#59; a remote link may already exist or account id or redirect URL is missing
  s2 --> s4: the returned new or reused account is allowed
  s4 --> s5: show the URL and open it when allowed
  s4 --> s6: --no-wait returns pending JSON
  s5 --> s7: retrieve the connected account
  s7 --> s8: the retrieved account is ACTIVE
  s7 --> s5: retry a non-ACTIVE status or transient request failure
  s7 --> s3: exhaust the polling budget
  class s0 blue
  class s1 blue
  class s2 blue
  class s3 orange
  class s4 blue
  class s5 blue
  class s6 teal
  class s7 blue
  class s8 teal
```

`ActiveOutputRequiresActiveAccount` holds in 62 reachable states.

Negative control: Accept the first non-ACTIVE account response as a successful authorization. The existing never-ACTIVE contract must fail.

The shortest path has 6 steps: 0. Resolve project and acting user

1. resolve project and user; load alias hints: Check alias against visible accounts
2. request a Tool Router or legacy link: Link request returned
3. the returned new or reused account is allowed: Show the authorization URL
4. show the URL and open it when allowed: Wait for account authorization
5. retrieve the connected account: Check account status
6. incorrectly announce a non-ACTIVE account: Reports ACTIVE before account authorization

[Broken-copy chart](link/counterexample.svg) · [Mermaid](link/counterexample.mmd) · [Counterexample report](link/counterexample-report.md)

### Choose the acting identity and account

[Skill and scope](../../../../../.agents/skills/verify-cli-routing/SKILL.md) · [SVG](routing/current.svg) · [Mermaid](routing/current.mmd) · [TLC report](routing/current-report.md)

![Choose the acting identity and account](routing/current.svg)

```mermaid
---
title: "Choose the project, acting user, and connected account"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: failure
    lg1: active
  }
  class lg0 orange
  class lg1 blue
  s0: Resolve the command project
  s1: Choose the acting user
  s2: Fix project, user, or account choice
  s3: Resolve --account or a default
  s4: Account selected
  s5: No active account#59; caller decides
  [*] --> s0
  s0 --> s1: resolve the consumer or developer project
  s0 --> s2: project is missing or lookup fails
  s1 --> s3: resolve a user against that project
  s1 --> s2: no acting user is available
  s3 --> s2: multiple usable accounts have no default or the selector matches no usable account
  s3 --> s4: use the sole, default, or explicitly selected account
  s3 --> s5: no active account exists
  class s0 blue
  class s1 blue
  class s2 orange
  class s3 blue
  class s4 blue
  class s5 blue
```

`NoAmbiguousAccountChosen` holds in 96 reachable states.

Negative control: Remove the high-level ambiguity guard. The unchanged low-level resolver then silently picks newest, and the existing ambiguity assertions must fail.

The shortest path has 3 steps: 0. Resolve the command project

1. resolve the consumer or developer project: Choose the acting user
2. resolve a user against that project: Resolve --account or a default
3. silently choose the newest account: Newest account guessed despite ambiguity

[Broken-copy chart](routing/counterexample.svg) · [Mermaid](routing/counterexample.mmd) · [Counterexample report](routing/counterexample-report.md)

### Execute a tool

[Skill and scope](../../../../../.agents/skills/verify-cli-execution/SKILL.md) · [SVG](execution/current.svg) · [Mermaid](execution/current.mmd) · [TLC report](execution/current-report.md)

![Execute a tool](execution/current.svg)

```mermaid
---
title: "Validate and execute a tool"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: success
    lg1: failure
    lg2: active
  }
  class lg0 teal
  class lg1 orange
  class lg2 blue
  s0: Resolve project, user, and account
  s1: Check arguments and connection hints
  s2: Build local dry-run summary
  s3: Command failed#59; inspect outcome before retry
  s4: Check tool permission
  s5: Result delivered
  s6: Prepare files and selected transport
  s7: Tool request sent
  s8: Read the tool result
  s9: No complete answer#59; outcome uncertain
  s10: Prepare stdout or result file
  [*] --> s0
  s0 --> s1: resolve execution context
  s1 --> s3: arguments or connection check fails
  s1 --> s4: arguments accepted [normal execution]
  s1 --> s2: arguments accepted [dry run]
  s2 --> s5: return a dry-run summary
  s4 --> s3: permission is denied
  s4 --> s6: permission allows or skips approval
  s6 --> s7: send once to the selected transport
  s7 --> s8: receive the tool result
  s7 --> s9: lose the response or reach the deadline
  s8 --> s3: emit failure and exit nonzero
  s9 --> s3: emit failure and exit nonzero
  s8 --> s10: tool reports success
  s10 --> s3: result storage or output fails
  s10 --> s5: write inline data or a result-file summary
  class s0 blue
  class s1 blue
  class s2 blue
  class s3 orange
  class s4 blue
  class s5 teal
  class s6 blue
  class s7 blue
  class s8 blue
  class s9 blue
  class s10 blue
```

`DryRunDoesNotExecute` holds in 50 reachable states.

Negative control: Bypass the dry-run branch so the handler reaches the executor. The dry-run result contract must fail.

The shortest path has 4 steps: 0. Resolve project, user, and account

1. resolve execution context: Check arguments and connection hints
2. arguments accepted [normal execution]: Check tool permission
3. permission allows or skips approval: Prepare files and selected transport
4. send once to the selected transport: Tool request sent (tool sent during a dry run)

[Broken-copy chart](execution/counterexample.svg) · [Mermaid](execution/counterexample.mmd) · [Counterexample report](execution/counterexample-report.md)

### Listen and stop

[Skill and scope](../../../../../.agents/skills/verify-cli-listener/SKILL.md) · [SVG](listener/current.svg) · [Mermaid](listener/current.mmd) · [TLC report](listener/current-report.md)

![Listen and stop](listener/current.svg)

```mermaid
---
title: "Listen, finish accepted events, and clean up"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: success
    lg1: failure
    lg2: active
  }
  class lg0 teal
  class lg1 orange
  class lg2 blue
  s0: Prepare event files
  s1: Create trigger if needed#59; subscribe
  s2: Forced stop#59; cleanup may be incomplete
  s3: Accept matching events
  s4: Release subscription and event workers
  s5: Wait for the trigger-disable result
  s6: Finish accepted writes, up to ten seconds
  s7: Report sink failures
  s8: Listener stopped
  [*] --> s0
  s0 --> s1: prepare subscription and temporary trigger
  s1 --> s2: second signal or runner deadline forces exit
  s1 --> s3: subscription succeeds
  s1 --> s4: subscription fails
  s3 --> s2: second signal or runner deadline forces exit
  s3 --> s6: event limit or timeout fires
  s3 --> s4: Ctrl+C or SIGTERM cancels pending writes or fail-fast stops after a sink failure
  s4 --> s5: attempt to disable the temporary trigger
  s4 --> s2: second signal or runner deadline forces exit
  s5 --> s2: second signal or runner deadline forces exit
  s5 --> s7: disable returns success or a warning
  s6 --> s2: second signal or runner deadline forces exit
  s6 --> s4: accepted writes settle or the ten-second drain budget expires or fail-fast stops after a sink failure
  s7 --> s8: report sink failures and finish
  class s0 blue
  class s1 blue
  class s2 orange
  class s3 blue
  class s4 blue
  class s5 blue
  class s6 blue
  class s7 blue
  class s8 teal
```

`CleanupAttemptBeforeCompletion` holds in 371 reachable states.

Negative control: Skip the temporary-trigger release call. The existing client test can no longer observe its failed disable request and warning, so its assertion must fail.

The shortest path has 4 steps: 0. Prepare event files

1. prepare subscription and temporary trigger: Create trigger if needed; subscribe
2. subscription fails: Release subscription and event workers
3. skip trigger cleanup: Report sink failures
4. report sink failures and finish: Stopped without attempting trigger cleanup

[Broken-copy chart](listener/counterexample.svg) · [Mermaid](listener/counterexample.mmd) · [Counterexample report](listener/counterexample-report.md)

### Stop a supervised script

[Skill and scope](../../../../../.agents/skills/verify-cli-shutdown/SKILL.md) · [SVG](shutdown/current.svg) · [Mermaid](shutdown/current.mmd) · [TLC report](shutdown/current-report.md)

![Stop a supervised script](shutdown/current.svg)

```mermaid
---
title: "Stop a listener or a supervised script"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: success
    lg1: failure
    lg2: active
  }
  class lg0 teal
  class lg1 orange
  class lg2 blue
  s0: Starting#59; signal would interrupt
  s1: Command or child determines exit
  s2: Ready to stop cooperatively
  s3: Signal interrupts the invocation
  s4: Forward stop to the child process group
  s5: Listener releases its resources
  s6: Second signal or deadline forces exit
  s7: Interrupted#59; exit 128 plus signal
  [*] --> s0
  s0 --> s1: command or child ends before a stop signal
  s0 --> s2: subscription is acknowledged or child supervision starts
  s0 --> s3: receive Ctrl+C, SIGTERM, or SIGHUP
  s2 --> s1: command or child ends before a stop signal
  s2 --> s5: receive Ctrl+C, SIGTERM, or SIGHUP
  s2 --> s3: receive Ctrl+C, SIGTERM, or SIGHUP
  s2 --> s4: receive Ctrl+C, SIGTERM, or SIGHUP
  s3 --> s6: receive another signal or exceed ten seconds
  s3 --> s7: finish an interrupted command
  s4 --> s6: receive another signal or exceed ten seconds
  s5 --> s1: listener releases resources and exits cleanly
  s5 --> s6: receive another signal or exceed ten seconds
  s4 --> s1: mirror the child outcome, preserving the first escalation signal
  class s0 blue
  class s1 teal
  class s2 blue
  class s3 blue
  class s4 blue
  class s5 blue
  class s6 orange
  class s7 orange
```

`CooperativeSignalIsNotInterruption` holds in 151 reachable states.

Negative control: Invert the runner cooperation branch while a cooperative command is still cleaning up. The existing in-progress-stop test must fail before the second signal.

The shortest path has 2 steps: 0. Starting; signal would interrupt

1. subscription is acknowledged or child supervision starts: Ready to stop cooperatively
2. receive Ctrl+C, SIGTERM, or SIGHUP: Signal interrupts the invocation (accepted stop incorrectly interrupted)

[Broken-copy chart](shutdown/counterexample.svg) · [Mermaid](shutdown/counterexample.mmd) · [Counterexample report](shutdown/counterexample-report.md)

### Parse, dispatch, and report

[Skill and scope](../../../../../.agents/skills/verify-cli-invocation/SKILL.md) · [SVG](invocation/current.svg) · [Mermaid](invocation/current.mmd) · [TLC report](invocation/current-report.md)

![Parse, dispatch, and report](invocation/current.svg)

```mermaid
---
title: "Parse a command and report its outcome once"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: success
    lg1: active
  }
  class lg0 teal
  class lg1 blue
  s0: Parse argv and identify registration
  s1: Start the selected command
  s2: Record command invoked
  s3: Validate login and run the handler or help
  s4: Record success or failure
  s5: Print only an unreported failure
  s6: Preserve exit markers for the runner
  s7: Invocation ended
  [*] --> s0
  s0 --> s1: effect/cli selects a registration or effect/cli prints the parse error and names its command
  s1 --> s2: run enabled hooks for parsed input or help, version, bare group, or parse error skips hooks
  s2 --> s3: record invoked after hooks
  s3 --> s4: handler or help succeeds or keep the parse failure already printed by effect/cli or handler fails before printing or parser or handler already reports the failure
  s4 --> s5: record the same command outcome
  s5 --> s6: nothing remains to print or print failure and preserve its cause
  s6 --> s7: runner uses the marked outcome
  class s0 blue
  class s1 blue
  class s2 blue
  class s3 blue
  class s4 blue
  class s5 blue
  class s6 blue
  class s7 teal
```

`HooksRequireParsedAction` holds in 46 reachable states.

Negative control: Run invocation hooks even without parsed input. The existing help/version/parse-error no-hook assertions must fail.

The shortest path has 2 steps: 0. Parse argv and identify registration

1. effect/cli selects a registration: Start the selected command
2. run enabled hooks for parsed input: Record command invoked (hooks ran without a parsed action)

[Broken-copy chart](invocation/counterexample.svg) · [Mermaid](invocation/counterexample.mmd) · [Counterexample report](invocation/counterexample-report.md)

## Behaviors to preserve

- Login caches expire by local `cachedAt`, not by the stored server `expiresAt`.
  Non-linked statuses are retried by the current generic polling helper. Interactive
  completion retains the pending file; `login --poll` clears it after success.
- `link --no-wait` returns a pending handoff. The additional-account alias check
  happens after the link request, so rejection does not prove no account was created.
- Account selection uses only active, enabled accounts. Without a selector, more
  than one usable account needs an explicit default alias. Blank selectors count
  as absent. This guarantee belongs to the high-level resolver.
- Dry runs can fetch schemas and resolve context. They send no tool execution.
  A lost response or a failed local output write can follow a completed remote action.
- Listener max-events counts accepted matches even when a sink fails. Normal
  stop drains accepted writes for at most ten seconds. A cooperative signal or
  fail-fast can cancel writes. Trigger disable is best-effort; forced exits can
  skip finalizers.
- Listener cooperation starts after subscription acknowledgment and covers INT
  and TERM. HUP and signals before registration interrupt normally. A supervised
  POSIX script receives forwarded signals, then TERM/KILL escalation if needed.
- Help, version, bare-group help, and parse failures skip invocation hooks.
  An own-action group is different. The parser can print an error before the
  invocation records its identity; already-reported failures retain their markers.

## Regenerate the charts

Use the current pstack `/statechart` skill, located by `pstack-skill path statechart`.
Read its instructions before running it; its command interface can change. Copy
the selected skill's `models/` files to a new scratch directory outside this repo,
then run the current statechart command on that module, its config, and `view.mjs`.
Use a new output directory. To reproduce the negative control, copy the config
and set `Mutant = TRUE`. Render each generated Mermaid file with Pele 1.9.0 as
the `/statechart` rendering reference describes, then copy reviewed outputs here.

The skills were created using pstack's current
[`create-formal-verification-skill`](https://github.com/backnotprop/pstack/tree/0b239bbfa26674efd5c371055eadfc5f488ac1be/skills/create-formal-verification-skill)
and [`statechart`](https://github.com/backnotprop/pstack/tree/0b239bbfa26674efd5c371055eadfc5f488ac1be/skills/statechart)
at revision `0b239bbfa26674efd5c371055eadfc5f488ac1be`, mirrored from
[`cursor/plugins/pstack`](https://github.com/cursor/plugins/tree/main/pstack).
The requested name `create-formal-specification` is absent from both current trees.
The managed dotfiles launcher was updated to this pin and verified against upstream.

For later source changes, use `/maintain-formal-verification-skill` to review
and refresh the relevant model before advancing its source hashes.

Historical orientation: Glen's “CLI authentication recovery” observations
`cmtx3f5ep003jgm0ao9jrr39g`, `cmtx3hrus001gl304di9665bo`, and
`cmtx4eih10005gm0aqtp9tm8f`; “CLI onboarding flow” observations
`cmt9yledq001qi504xz3cz36b` and `cmt9yleep001wi504nsux02a6`; and
“Composio CLI invocation identity design” observation `cmvqortrq0055l4082k635137`
helped prioritize the investigation. Current source and the recorded checks decide
the model's transitions.
