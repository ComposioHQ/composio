## Why am I seeing a DNS error while connecting my QuickBooks account?

This usually happens when the `com.intuit.quickbooks.payment` scope is included in your auth config but the QuickBooks account hasn't enabled the Payments module. Either remove that scope from your auth config and reconnect, or enable the Payments module in QuickBooks first.

---

## Why can Claude block QuickBooks in consumer MCP sessions?

This behavior is intentional on Claude's side. QuickBooks has tools that can process payments, so Claude can classify it under Payment Processing and block execution in consumer MCP sessions. Use Claude Code or Cowork with Composio through the CLI/developer path where the agent can still access QuickBooks through Composio.

## QuickBooks connections require base URL and realm ID during connection initiation

QuickBooks needs connection-level values before OAuth/tool execution can work. Collect and pass the base URL and `realm_id`/generic ID during connection initiation. If an older connection was created before these values were captured, delete it and create a fresh connection so the data is stored correctly.

## When should I use the sandbox QuickBooks API base URL for sandbox connections?

For QuickBooks sandbox accounts, pass `https://sandbox-quickbooks.api.intuit.com` as the URL/base URL when initiating the connection. Production connections should use the production Intuit API base URL.

## What do QuickBooks auth configs need?

When creating a QuickBooks auth config, enter the QuickBooks OAuth credentials from the Intuit developer app and configure the Composio redirect URL in the QuickBooks auth app. A mismatch or missing redirect URL can break the OAuth flow.

## QuickBooks auth can accept custom auth and token URLs for sandbox/custom flows

QuickBooks toolkit support was updated to accept auth and token URLs during connection initiation. If a user needs sandbox or custom Intuit OAuth endpoints, use a toolkit version that supports passing those URLs.

## What is required for the QuickBooks payment scope?

If the QuickBooks OAuth flow includes the payments scope `com.intuit.quickbooks.payment`, the QuickBooks payment module must be enabled for that account/app. If the user does not need payment tools, remove that scope and retry the connection.

## QuickBooks realm/company selection issues

For QuickBooks realm/company selection issues, retry on the latest toolkit version. Make sure the connection stores the correct `realm_id` and base URL for the selected QuickBooks company.

## Multiple QuickBooks accounts can be selected in Claude/MCP by using separate user IDs or connected account IDs

Create separate connected accounts for each QuickBooks account, preferably with distinct `user_id` values. In Claude/MCP setup, append the desired `connected_account_id` or `user_id` to the MCP URL/configuration so the session targets the intended QuickBooks connection.

## What should I know about QuickBooks tokens?

QuickBooks OAuth refresh is handled by Composio through provider API endpoints. Refresh runs periodically depending on toolkit settings, with retry handling for transient errors such as 429 or 500 before a connected account is marked expired and the user must reauthenticate.

## QuickBooks hosted auth screen can be skipped by sending users directly to the OAuth provider

The Composio auth screen can be skipped for QuickBooks by sending users directly to the OAuth provider, following Composio's white-labeling/direct-provider auth flow. Use this when the user wants the user to see the provider consent screen without the intermediate Composio auth screen.

## Missing QuickBooks expense/bill tools should be filed with the exact Intuit API reference

If a QuickBooks endpoint is not available as a Composio tool, file a tool request and include the exact Intuit API reference or relevant docs. This helps the integrations team scope and prioritize the missing QuickBooks action.
