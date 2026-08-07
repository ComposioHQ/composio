# Errors and provider gotchas

These rules apply to both Composio products.

## Start in Dashboard Logs

Open the applicable product's Dashboard Logs first and use the Composio log ID or request ID to inspect the exact execution. Framework wrappers often hide the underlying error.

CLI diagnostics are optional. Use them only when the CLI is already installed and configured for the applicable product:

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

Identify which boundary returned the 401 before changing anything.

### Composio API or session 401

This failure happens while creating or using a session, before a provider tool call succeeds. The project credential may be invalid, masked, a placeholder, or for the wrong dashboard project.

Stop and re-run the no-output `COMPOSIO_API_KEY` preflight from the Platform guide. Do not print, rotate, replace, or request the key in chat. Direct the developer to Platform → project → Getting Started → Step 1 when the repository does not have the correct unmasked project credential. The next SDK request, not key length, validates it over the network.

### Provider tool-call 401

This failure appears on a real tool execution in Dashboard Logs, usually with a Composio log ID. The Composio project credential and session reached the provider, but the selected user's connected-account credential was revoked, expired, or invalidated by a password, 2FA, consent, or administrator-policy change.

Keep the same project key and user ID. Generate a fresh Connect Link for that integration, reconnect the account, and retry the safe read-only call. Do not replace the Composio project credential.

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
