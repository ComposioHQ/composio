---
type: "reference"
title: "QuickBooks"
description: "Public support knowledge for QuickBooks."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "quickbooks"
---
# QuickBooks


## Use the sandbox QuickBooks API base URL for sandbox connections

For QuickBooks sandbox accounts, pass `https://sandbox-quickbooks.api.intuit.com` as the URL/base URL when initiating the connection. Production connections should use the production Intuit API base URL.

## QuickBooks auth configs need QuickBooks credentials and matching redirect URL

When creating a QuickBooks auth config, enter the QuickBooks OAuth credentials from the Intuit developer app and configure the Composio redirect URL in the QuickBooks auth app. A mismatch or missing redirect URL can break the OAuth flow.

## QuickBooks auth can accept custom auth and token URLs for sandbox/custom flows

QuickBooks toolkit support was updated to accept auth and token URLs during connection initiation. If a customer needs sandbox or custom Intuit OAuth endpoints, use a toolkit version that supports passing those URLs.

## QuickBooks payment scope requires payment module access

If the QuickBooks OAuth flow includes the payments scope `com.intuit.quickbooks.payment`, the QuickBooks payment module must be enabled for that account/app. If the customer does not need payment tools, remove that scope and retry the connection.

## Realm ID mapping fixes may require the latest QuickBooks toolkit version

For QuickBooks realm/company mapping issues, retry on the latest toolkit version rather than a historical pinned version.

## Multiple QuickBooks accounts can be selected in Claude/MCP by using separate user IDs or connected account IDs

Create separate connected accounts for each QuickBooks account, preferably with distinct `user_id` values. In Claude/MCP setup, append the desired `connected_account_id` or `user_id` to the MCP URL/configuration so the session targets the intended QuickBooks connection.

## QuickBooks tokens are refreshed periodically with retries before expiring the connection

QuickBooks OAuth refresh is handled by Composio through the provider's token endpoint. The current refresh path retries transient failures and uses credential-expiry timing rather than promising a fixed 15-minute schedule. If the provider conclusively rejects the grant or failures persist past the platform's retry budget, the connected account expires and the user must reauthenticate through a new auth link.

## QuickBooks hosted auth screen can be skipped by sending users directly to the OAuth provider

The Composio auth screen can be skipped for QuickBooks by sending users directly to the OAuth provider, following Composio's white-labeling/direct-provider auth flow. Use this when the customer wants the user to see the provider consent screen without the intermediate Composio auth screen.
