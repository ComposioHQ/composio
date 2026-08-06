# Errors and provider gotchas

These rules apply to both Composio products.

## Start with the log ID

Get the Composio log ID or request ID before diagnosing a failure. Framework wrappers often hide the underlying error.

```bash
composio dev logs tools
composio dev logs triggers
composio connections list
```

The dashboard Logs page provides the same execution trail.

## Tool does not exist

Never guess the slug. In a Platform session, discover it through `COMPOSIO_SEARCH_TOOLS`. In a direct CLI workflow, use `composio search`, then inspect the result with `composio execute <slug> --get-schema`.

For manual legacy v3 execution, a missing tool is often a toolkit-version problem. Use a verified version or the v3.1 path that defaults to the current version. New session integrations should use runtime discovery instead of manually executing a guessed slug.

## Authentication failures

A 401 generally means the provider token was revoked, expired, or invalidated by a password, 2FA, or administrator-policy change. Reconnect the account and retry.

If an authorization link expired, request a new one. Do not reuse it.

## Provider constraints

- Google "App is blocked": remove unnecessary scopes or use a verified custom OAuth app.
- Slack 429s: managed apps share a provider quota; use a custom Slack app for a dedicated rate-limit bucket.
- Microsoft 403s: the tenant may require administrator consent.
- GitHub Apps: OAuth credentials and repository installation are separate steps.
- Session Restriction errors for payment tools are policy restrictions, not plan or connection failures.

## Production

Managed auth is intended to make initial development easy. Before launch, use custom OAuth apps for integrations that need the developer's branding, scopes, or dedicated quotas.

For toolkit-specific details, fetch:

```text
https://docs.composio.dev/toolkits/<toolkit>.md
```
