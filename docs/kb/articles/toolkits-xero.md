## Xero redirect URI must match the current auth-config flow exactly

Make sure the redirect URI configured in the Xero OAuth app exactly matches the URI shown by the current Composio auth-config flow. Do not fall back to a legacy v1 callback from an older example; copy the current callback from the setup UI or auth-config documentation and match it exactly, without adding a trailing slash.

## Xero OAuth app should be a Web app and the client secret must match the auth config

For Xero BYOA/custom OAuth, verify the Xero developer app is configured as a `Web app`, not `Mobile or Desktop`. The redirect URI must match exactly, and the client secret in Composio must match the current secret in the Xero developer portal. If a connection remains in `EXPIRED` with `Connection initiation did not complete within 10 minutes`, restart the auth flow and complete the Xero consent step within the 10-minute window.

## Remove deprecated Xero scopes that cause invalid-scope/CSP/login errors

Remove the deprecated/invalid Xero scopes `accounting.journals.read`, `accounting.reports.read`, `accounting.transactions`, and `accounting.transactions.read` from the auth config. Reconnect after removing them. Use Xero's current OAuth scope documentation and keep required scopes such as `offline_access`, `email`, `profile`, `openid`, and the supported `accounting.*` scopes needed for the tools.

## Connect MCP discovers Xero tools through meta-tools instead of preloading every tool

Connect MCP uses meta-tools such as `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MULTI_EXECUTE_TOOL` to discover and execute toolkit-specific tools dynamically. For Xero, the expected flow is: ask/search for the task such as `get Xero contacts`, let the agent discover the relevant Xero tool, then execute it through the multi-execute tool. This avoids loading 1000+ tools into context up front.

## Connect MCP and Platform MCP Xero connections are independent

Connect MCP servers and Platform MCP servers are independent. A connection visible in Platform is not automatically available through Connect MCP, so confirm which surface created the Xero connection before debugging account selection.
