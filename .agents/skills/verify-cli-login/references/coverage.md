# Sign in and complete a browser handoff

Property: `BrowserSessionMustBeLinked`. A browser session may proceed to credential lookup and storage only after it is linked.

Harm: A pending session could be accepted as authorized, leading to invalid credential requests or login failures.

## Code mapping

| Source                                                                                                     | Modeled transition or boundary                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [src/effects/browser-login.ts](../../../../ts/packages/cli/src/effects/browser-login.ts)                   | browserLogin, waitForLinkedSession, requireLinkedSession, storeCredentials; writes and remote reads yield separately.    |
| [src/commands/login/login.handler.ts](../../../../ts/packages/cli/src/commands/login/login.handler.ts)     | Five dispatch methods; handlePollLogin clears only after loginWithKey succeeds. Direct/agent verification is abstracted. |
| [src/services/pending-login-session.ts](../../../../ts/packages/cli/src/services/pending-login-session.ts) | read expires by cachedAt; clears expired entries, rather than trusting expiresAt.                                        |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

Four login modes, at most two poll replies, and abstract success/failure for credential storage. The headless waiting state spans two CLI invocations. Local cache expiry is a separate event.

The real retry schedule uses five-second minimum spacing plus exponential delay and a larger retry cap. Non-linked statuses, including expired, are retried by the current generic helper; the model preserves that behavior. Direct and agent HTTP verification, flag conflicts, org picking, key secrecy, concurrent login writers, and disk atomicity are outside this property. Interactive completion currently retains its pending file; only the poll path clears it.

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

The model violation occurs when the status guard accepts the pending session,
before any credential lookup. The real broken copy then exposes a missing-field
defect, which the expected-failure contract assertion detects. The model does not
claim that this broken copy can persist a working key from a pending response.

Real-code mutation: Accept an unlinked session in requireLinkedNow. The existing no-wait pending-session test must fail.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
