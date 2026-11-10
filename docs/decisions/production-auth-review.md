# Production authentication documentation review

## Recommendation

Reuse the existing authentication guides. Make the three focused edits below to put application identity verification on the main production connection path.

This is the review deliverable for [DEVREL-324](https://linear.app/composio/issue/DEVREL-324), dated November 10, 2026. These edits are proposals, not approved product changes or implemented public guidance.

## Existing coverage

| Review area | Current coverage | Assessment |
| --- | --- | --- |
| Development versus production | [Managed vs custom auth](../content/docs/authentication/custom-app-vs-managed-app.mdx), “When to use Composio managed apps”; [Production readiness](../content/docs/production-readiness.mdx), “Production decisions at a glance” | Sufficient distinction: managed apps can fit production, subject to branding, scopes, and shared quotas. Preserve this conditional guidance. |
| Branding and credentials | [White-labeling](../content/docs/authentication/white-labeling-authentication.mdx), “Routing the callback through your domain” and “Verify the connection on your server” | Already separates provider consent, hosted branding, provider redirect, application callback, and server-side secrets. Custom app ownership does not change token custody. |
| Application and provider identity | [Authentication](../content/docs/authentication/index.mdx), introduction; [Manual auth](../content/docs/authentication/manually-authenticating.mdx), “Identify the connected account” | The distinction exists, but the main entry point does not explain where the application must authenticate the person before choosing a Composio user ID. |
| Completion and failure handling | White-labeling, “Verify the connection on your server” and “Deployment checklist”; Manual auth, “Authorize a toolkit” | Substantial coverage already exists. Link it directly from the callback example and production checklist so readers need not infer that verification also matters without custom branding. |
| Deferred OAuth verification | [Connected accounts](../content/docs/auth-configuration/connected-accounts.mdx), “Complete deferred OAuth” | Public API and SDK support exists. Configuration prerequisites and an end-to-end verifier example need separate validation before expansion. |

## Proposed edits

1. **Authentication introduction** — In `docs/content/docs/authentication/index.mdx`, immediately after the stable-user-ID guidance, explain that the application authenticates its user and derives the Composio user ID on the server. A caller-supplied user ID is not a login credential. Link to the existing server verification section in White-labeling. Rationale: the current “Composio handles the auth from there” sentence can obscure the application's responsibility for choosing the identity.

2. **Manual auth callback example** — In `docs/content/docs/authentication/manually-authenticating.mdx`, under “Redirecting users after authentication,” replace the illustrative callback `user_id` with an opaque attempt identifier bound to the authenticated application session in server storage. Put the existing callback-ownership warning next to these examples and link to “Verify the connection on your server.” Preserve the distinction between application attempt correlation and the provider's OAuth `state`. Rationale: the page already warns about callback ownership later; the example should teach that rule at the point of use.

3. **Production readiness connection path** — In `docs/content/docs/production-readiness.mdx`, under “Decide how customers authenticate,” add a direct link to the existing verification section, with a short outcome checklist: derive the user from the authenticated application session; save the pending account and expected auth config; verify the stored attempt and active account server-side; reject mismatches; handle denial, expiry, abandoned flows, and retries without enabling access. Rationale: this guidance applies to managed and custom flows, while the current link is introduced only for branding needs. Keep the detailed flow in one guide.

Keep the managed-versus-custom decision page unchanged for this review. DEVREL-190 owns its broader surface and Google Ads validation. DEVREL-309 owns commercial and production-setup constraints. This review does not resolve either issue or change pricing claims.

## Behavior checked against Composio sources

Reviewed the repository at `e7c4aac1e`, including these implementation and contract sources:

- [TypeScript connection request](../../ts/packages/core/src/models/ConnectionRequest.ts): polling retrieves the saved account ID, returns on `ACTIVE`, and raises errors for terminal failure states or timeout. It does not authenticate an application browser session. Application identity and attempt correlation therefore remain application responsibilities.
- [TypeScript connected accounts](../../ts/packages/core/src/models/ConnectedAccounts.ts), `completeAuth`: validates input, sends `user_id` and `session_uri` to the API, and transforms the result.
- [Python connected accounts](../../python/composio/core/models/connected_accounts.py), `complete_auth`: sends the same two fields to the API.
- [Published API contract snapshot](../public/openapi.json), `POST /api/v3.1/connected_accounts/complete_auth`: describes project and user matching, single-use redemption, an active account on success, identity mismatch under HTTP 400, and unavailable or consumed sessions under HTTP 404. These are contract statements, not results from a live OAuth experiment.
- White-labeling already requires server-side account filtering by saved account, user, auth config, toolkit, and active status. It separately checks whether the provider identity meets the application's policy. The proposed edits reuse those requirements.

The [Arcade production-auth guide](https://docs.arcade.dev/en/build/user-facing-agents/secure-auth-production), read November 10, 2026, provides a useful comparison for the reading sequence: environment choice, identity verification, completion, then failure handling. Its default-app restrictions and verifier protocol are Arcade-specific. Do not copy those restrictions, endpoint names, or error codes into Composio guidance.

## Verification and remaining limits

This review checks existing documentation against SDK implementation and the checked-in API contract. No live OAuth connection, provider consent, verifier configuration, or dashboard setting was exercised. The proposed edits do not depend on new claims about those settings.

Before publishing a complete deferred-verifier recipe, verify its supported configuration path and eligibility with Platform, then exercise matching-user, mismatched-user, expired-session, and repeated-redemption cases. Keep that recipe separate from ordinary callback verification. Do not imply that every Composio project must configure a verifier or that every production app needs custom OAuth credentials.

[PR #5253](https://github.com/ComposioHQ/composio/pull/5253) proposes renaming the execution-time project setting to “connection user binding.” That setting is a separate concept from authenticating the browser user or redeeming a deferred OAuth session. Coordinate terminology after that PR lands.

For this record, verify repository-relative links and whitespace. It changes no rendered page, code example, SDK behavior, or API contract. Implementation PRs for the proposed edits should run the docs checks for the affected pages and validate a sample application's callback outcomes before describing that example as tested.
