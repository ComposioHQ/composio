# Errors and provider gotchas

Use this guide for failures shared by Composio For You and Composio Platform. Keep product-specific credential and client setup in the selected product guide.

## Start with evidence

Get the Composio log or request ID and inspect Dashboard Logs before changing credentials or code. Agent frameworks often wrap the underlying provider error.

When the CLI is already installed and authenticated for the applicable product, consult the [CLI guide](https://docs.composio.dev/docs/cli.md) and installed command help for log and connection inspection commands.

Do not install or reinitialize the CLI solely to diagnose a dashboard log that already contains the failure.

## Tool does not exist

Never guess a slug. In a Platform session, use the [meta-tool reference](https://docs.composio.dev/toolkits/meta-tools.md) and returned schemas for discovery. In a CLI workflow, follow the [CLI discovery procedure](https://docs.composio.dev/docs/cli.md), then inspect the returned tool.

For legacy manual execution, a missing tool may be a toolkit-version problem. Fetch current migration and execution docs rather than assuming the provider lacks the operation. New session integrations should use runtime discovery.

## Tool call paused or blocked by session policy

Some results are the session working as configured. Read the current result-handling instructions before diagnosing auth or the provider:

- For a call waiting on user input, follow [Approvals](https://docs.composio.dev/docs/governance/approvals.md). Ask the user before resuming, preserve their answer, and use the documented continuation procedure. Check client support before configuring an MCP fallback.
- For a policy block, follow [Firewall](https://docs.composio.dev/docs/firewall.md) to inspect the matching policy. Don't reconnect the account or retry the same call to bypass it. Change the request, or change the policy only when the requested work authorizes that change.

## Custom MCP tools missing

Read [Custom MCP troubleshooting](https://docs.composio.dev/docs/extending-sessions/custom-mcp.md) for current discovery, synchronization, and API-version behavior. Compare the stored toolkit identifier, connection state, and returned schemas before choosing a recovery step. Do not assume resynchronizing fixes every discovery failure.

## Identify the authentication boundary

### Composio project or session 401

This happens before a provider tool call succeeds. The Platform project credential may be missing, masked, invalid, or associated with a different project.

Re-run the no-output credential checks from the Platform guide. Do not print, rotate, replace, or request the key in chat. If the developer arrived from Dashboard Getting Started, direct them back to the same project's credential source rather than provisioning another project.

### Provider connected-account 401

This appears on a real tool execution after the project and session reached the provider. The selected user's provider token may be revoked, expired, or invalidated by a password, 2FA, consent, or administrator-policy change.

Keep the same project key and application user ID. Generate a fresh Connect Link for that integration, reconnect the provider account, and retry the safe call. If a link expired, request a new one.

### For You client authentication

If the MCP client itself cannot authenticate, check its endpoint and authentication against [Composio Connect](https://docs.composio.dev/docs/composio-connect.md). Do not substitute a Platform project key.

## Common provider constraints

Read the affected [toolkit's current guide](https://docs.composio.dev/toolkits) and [managed versus custom auth guidance](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app.md) before diagnosing provider restrictions. Check the specific error, requested scopes, provider configuration, quotas, and administrator requirements against those sources. Do not prescribe a provider-specific fix from an error code alone.

## Branding and production auth

Read [managed versus custom auth](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app.md) before choosing a production authentication path. Match the choice to the application's branding, scopes, and quota requirements.

When someone asks to remove Composio branding, identify the surface first: Connect Link page, provider consent screen, secured badge, callback domain, or success page. They have different fixes. Read [authentication branding](https://docs.composio.dev/docs/authentication/white-labeling-authentication.md) before proposing an implementation.

## Triggers and webhooks

Check the Composio status page and trigger logs before changing a trigger. Follow [trigger troubleshooting](https://docs.composio.dev/docs/setting-up-triggers/troubleshooting.md) for connection and delivery checks. Use [event subscriptions](https://docs.composio.dev/docs/setting-up-triggers/subscribing-to-events.md) for webhook verification and [outbound IP documentation](https://docs.composio.dev/docs/security/outbound-ips.md) for network allowlisting. Do not copy event names, polling limits, or IP addresses into the skill.

## Canonical follow-up

For provider- or toolkit-specific behavior, fetch:

```text
https://docs.composio.dev/toolkits/<toolkit>.md
```

For APIs, migrations, triggers, or compliance questions, find the current page through `https://docs.composio.dev/llms.txt`. If the problem remains unresolved, include the log ID when escalating to Composio support.
