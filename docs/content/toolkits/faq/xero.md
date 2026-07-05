## How do I set up custom OAuth credentials for Xero?

For a step-by-step guide on creating and configuring your own Xero OAuth credentials with Composio, see [How to create OAuth credentials for Xero](https://composio.dev/auth/xero).

## When should I use my own Xero OAuth app credentials?

For Xero production usage, create a new auth config using the user's own Xero OAuth app credentials. If an older auth config does not support the needed Xero flow, create a fresh auth config with BYOA/custom credentials and connect again.

## What should the Xero redirect URI match?

Make sure the redirect URI configured in the Xero OAuth app exactly matches the URI configured in Composio. For Xero cases where the v3 toolkit callback fails, use `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URI. In other flows, `https://backend.composio.dev/api/v3/toolkits/auth/callback` is also accepted. Avoid trailing slashes and keep the Xero app's registered redirect URI in sync with the authConfig.

## How should I configure a Xero OAuth app and client secret?

For Xero BYOA/custom OAuth, verify the Xero developer app is configured as a `Web app`, not `Mobile or Desktop`. The redirect URI must match exactly, and the client secret in Composio must match the current secret in the Xero developer portal. If a connection remains in `EXPIRED` with `Connection initiation did not complete within 10 minutes`, restart the auth flow and complete the Xero consent step within the 10-minute window.

## When should I remove deprecated Xero scopes that cause invalid-scope/CSP/login errors?

Remove the deprecated/invalid Xero scopes `accounting.journals.read`, `accounting.reports.read`, `accounting.transactions`, and `accounting.transactions.read` from the auth config. Reconnect after removing them. Use Xero's current OAuth scope documentation and keep required scopes such as `offline_access`, `email`, `profile`, `openid`, and the supported `accounting.*` scopes needed for the tools.

## Why can Claude or Cowork block Xero in some sessions?

Toolkits that can process payments may be flagged under Payment Processing by Claude policy, which blocks Xero in that session. Users can still access Xero through Composio outside that restricted Claude/Cowork path, such as via the Composio CLI or Platform flows.

## What should I know about Connect MCP and Platform MCP Xero connections?

Connect MCP servers and Platform MCP servers are independent. A connection visible in Platform is not automatically available through Connect MCP. Connect MCP supports one connected account in that consumer flow, so if the user sees multiple active Xero connections they may be Platform-side connections rather than the Connect MCP connection being used.

## What should I do if the For You Xero connect button is unavailable?

If the For You dashboard connection path is unavailable, use Connect MCP (`connect.composio.dev/mcp`) from the client and connect Xero directly there.
