# Connect an account and confirm authorization

Property: `ActiveOutputRequiresActiveAccount`. The CLI may emit active-link success only after retrieving an ACTIVE connected account.

Harm: An authorization URL or initiated account could be mistaken for a usable connection.

## Code mapping

| Source                                                                                                                                                                         | Modeled transition or boundary                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [src/commands/connected-accounts/link/connected-accounts.link.handler.ts](../../../../ts/packages/cli/src/commands/connected-accounts/link/connected-accounts.link.handler.ts) | handleToolRouterLink and handleLegacyAuthConfigLink; alias guards, validateLinkResponse, finishLink, pollUntilActive. |
| [src/commands/connected-accounts/link/connected-accounts.link.format.ts](../../../../ts/packages/cli/src/commands/connected-accounts/link/connected-accounts.link.format.ts)   | Pending JSON and active JSON are distinct public output contracts.                                                    |

Sync commit: `149514f2659eab97138c0d1781e7fa8de4e8b343`. The manifest records SHA-256 hashes of these
files so a later edit cannot silently reuse this confirmation.

## Scope and assumptions

Two waiting modes, four representative existing-account/alias scenarios, two account polls, and three remote account statuses.

The existing-accounts hint lookup can fail open, so the alias guard is not a global uniqueness proof. The additional-account alias guard runs after the remote link request; its error does not prove no remote account was created. --no-wait returns pending even if authorization later succeeds. Browser-open failure falls back to a manual URL and still polls; --no-browser changes presentation, not authorization. Unmanaged-auth Dashboard routing, alias strings, concurrent link requests, session reuse, pagination, and remote auth correctness are excluded. Non-ACTIVE statuses and transient retrieve errors share the bounded retry abstraction.

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

Real-code mutation: Accept the first non-ACTIVE account response as a successful authorization. The existing never-ACTIVE contract must fail.

The matching counterexample describes this deliberately broken copy, not a
finding against the current CLI. Read the generated TLC trace through `/statechart`.
