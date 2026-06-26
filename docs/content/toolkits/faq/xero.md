## How do I set up custom OAuth credentials for Xero?

For a step-by-step guide on creating and configuring your own Xero OAuth credentials with Composio, see [How to create OAuth credentials for Xero](https://composio.dev/auth/xero).

## How should I handle xero managed OAuth was removed/limited; use your own Xero OAuth app credentials?

Composio's managed Xero OAuth app hit Xero connection/quota limits and was later retired/removed for affected flows. To unblock Xero, create a new auth config using the user's own Xero OAuth app credentials. If an old authConfig still points to the managed Xero OAuth app, create a fresh authConfig with BYOA/custom credentials and connect again.

## What must Xero redirect URI do?

Make sure the redirect URI configured in the Xero OAuth app exactly matches the URI configured in Composio. For Xero cases where the v3 toolkit callback fails, use `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URI. In other flows, `https://backend.composio.dev/api/v3/toolkits/auth/callback` is also accepted. Avoid trailing slashes and keep the Xero app's registered redirect URI in sync with the authConfig.

## What must Xero OAuth app should be a Web app and the client secret do?

For Xero BYOA/custom OAuth, verify the Xero developer app is configured as a `Web app`, not `Mobile or Desktop`. The redirect URI must match exactly, and the client secret in Composio must match the current secret in the Xero developer portal. If a connection remains in `EXPIRED` with `Connection initiation did not complete within 10 minutes`, restart the auth flow and complete the Xero consent step within the 10-minute window.

## When should I remove deprecated Xero scopes that cause invalid-scope/CSP/login errors?

Remove the deprecated/invalid Xero scopes `accounting.journals.read`, `accounting.reports.read`, `accounting.transactions`, and `accounting.transactions.read` from the auth config. Reconnect after removing them. Use Xero's current OAuth scope documentation and keep required scopes such as `offline_access`, `email`, `profile`, `openid`, and the supported `accounting.*` scopes needed for the tools.

## How should I handle xero can be blocked in Claude/Cowork by payment-processing session restrictions?

This restriction is intentional in the referenced Claude/Cowork flow. Toolkits that can process payments may be flagged under Payment Processing by Claude policy, which blocks Xero in that session. As a workaround, users can still access Xero through Composio outside that restricted Claude/Cowork path, such as via the Composio CLI/Platform flows.

## How should I handle connect MCP discovers Xero tools through meta-tools instead of preloading every tool?

Connect MCP uses meta-tools such as `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MULTI_EXECUTE_TOOL` to discover and execute toolkit-specific tools dynamically. For Xero, the expected flow is: ask/search for the task such as `get Xero contacts`, let the agent discover the relevant Xero tool, then execute it through the multi-execute tool. This avoids loading 1000+ tools into context up front.

## What should I know about Connect MCP and Platform MCP Xero connections?

Connect MCP servers and Platform MCP servers are independent. A connection visible in Platform is not automatically available through Connect MCP. Connect MCP supports one connected account in that consumer flow, so if the user sees multiple active Xero connections they may be Platform-side connections rather than the Connect MCP connection being used.

## What does If For You Xero connect button mean?

When the For You dashboard connect button is blocked by temporary dashboard write limitations, use Connect MCP (`connect.composio.dev/mcp`) from the client and wire up Xero directly there. the MCP flow was operational while the dashboard write path was limited.
