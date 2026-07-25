---
type: reference
title: "QuickBooks"
description: "Customer-safe support knowledge for QuickBooks."
category: toolkits/quickbooks
visibility: public
timestamp: 2026-07-16T00:00:00Z
tags:
  - quickbooks
---
# QuickBooks


## QuickBooks can be disabled by the MCP Payment Processing session policy

QuickBooks is tagged under both Accounting and Payment Processing. In MCP sessions where Payment Processing is disabled, that session policy currently disables the entire QuickBooks toolkit, including read-only accounting and reporting tools. The connected account can remain Active and schemas can load while execution returns `[Session Restriction] Toolkit 'quickbooks' is disabled for this session`.

The restriction is applied when the MCP session is created and cached for that session. Reconnecting or recreating the QuickBooks connected account does not change it, and there is no workspace/admin toggle that overrides it.

If QuickBooks is required, use the Composio SDK, direct tools execute API, or `composio execute` rather than another MCP client path that creates the same restricted session. Do not recommend Claude Code as a universal workaround unless the chosen path is verified to bypass that MCP session. Do not promise an ETA for narrower per-tool restrictions.

## QuickBooks tools require connection-level company metadata

QuickBooks API paths require Intuit's company ID, called `realmId`, but it is OAuth connection metadata rather than a normal per-tool argument. Do not assume every current auth scheme exposes a manual `realm_id` connection field.

If a tool request contains `/v3/company/None/`, the connection is missing usable company metadata. Before asking the customer to reconnect or pass a field, verify the deployed toolkit/auth scheme. Route an active connection with no stored realm ID to support because the runtime may have failed to persist or extract it.

## Use the sandbox QuickBooks API base URL for sandbox connections

For QuickBooks sandbox accounts, pass `https://sandbox-quickbooks.api.intuit.com` as the URL/base URL when initiating the connection. Production connections should use the production Intuit API base URL.

## QuickBooks auth configs need QuickBooks credentials and matching redirect URL

When creating a QuickBooks auth config, enter the QuickBooks OAuth credentials from the Intuit developer app and configure the Composio redirect URL in the QuickBooks auth app. A mismatch or missing redirect URL can break the OAuth flow.

## QuickBooks auth can accept custom auth and token URLs for sandbox/custom flows

QuickBooks toolkit support was updated to accept auth and token URLs during connection initiation. If a customer needs sandbox or custom Intuit OAuth endpoints, use a toolkit version that supports passing those URLs.

## QuickBooks payment scope requires payment module access

If the QuickBooks OAuth flow includes the payments scope `com.intuit.quickbooks.payment`, the QuickBooks payment module must be enabled for that account/app. If the customer does not need payment tools, remove that scope and retry the connection.

## Realm ID mapping fixes may require the latest QuickBooks toolkit version

For QuickBooks realm/company mapping issues, retry on `20260212_00` or the latest toolkit version, which includes the realm ID mapping fix.

## Multiple QuickBooks accounts can be selected in Claude/MCP by using separate user IDs or connected account IDs

Create separate connected accounts for each QuickBooks account, preferably with distinct `user_id` values. In Claude/MCP setup, append the desired `connected_account_id` or `user_id` to the MCP URL/configuration so the session targets the intended QuickBooks connection.

## QuickBooks tokens are refreshed periodically with retries before expiring the connection

QuickBooks OAuth refresh is handled by Composio through provider API endpoints. Refresh runs roughly every 15 minutes depending on toolkit, with retry handling for errors such as 429 or 500 before a connected account is marked expired and the user must reauthenticate.

## QuickBooks hosted auth screen can be skipped by sending users directly to the OAuth provider

The Composio auth screen can be skipped for QuickBooks by sending users directly to the OAuth provider, following Composio's white-labeling/direct-provider auth flow. Use this when the customer wants the user to see the provider consent screen without the intermediate Composio auth screen.

## Missing QuickBooks expense/bill tools should be filed with the exact Intuit API reference

If a QuickBooks endpoint is not available as a Composio tool, file a tool request and include the exact Intuit API reference or relevant docs. This helps the integrations team scope and prioritize the missing QuickBooks action.
