---
type: reference
title: "Xero"
description: "Customer-safe support knowledge for Xero."
category: toolkits/xero
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - xero
---
# Xero


## Xero managed OAuth was removed/limited; use your own Xero OAuth app credentials

Composio's managed Xero OAuth app hit Xero connection/quota limits and was later retired/removed for affected flows. To unblock Xero, create a new auth config using the customer's own Xero OAuth app credentials. If an old authConfig still points to the managed Xero OAuth app, create a fresh authConfig with BYOA/custom credentials and connect again.

## Xero redirect URI must match exactly; v1 auth-apps callback can be required

Make sure the redirect URI configured in the Xero OAuth app exactly matches the URI configured in Composio. For Xero cases where the v3 toolkit callback fails, use `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URI. In other flows, `https://backend.composio.dev/api/v3/toolkits/auth/callback` is also accepted. Avoid trailing slashes and keep the Xero app's registered redirect URI in sync with the authConfig.

## Xero OAuth app should be a Web app and the client secret must match the auth config

For Xero BYOA/custom OAuth, verify the Xero developer app is configured as a `Web app`, not `Mobile or Desktop`. The redirect URI must match exactly, and the client secret in Composio must match the current secret in the Xero developer portal. If a connection remains in `EXPIRED` with `Connection initiation did not complete within 10 minutes`, restart the auth flow and complete the Xero consent step within the 10-minute window.

## Remove deprecated Xero scopes that cause invalid-scope/CSP/login errors

Remove the deprecated/invalid Xero scopes `accounting.journals.read`, `accounting.reports.read`, `accounting.transactions`, and `accounting.transactions.read` from the auth config. Reconnect after removing them. Use Xero's current OAuth scope documentation and keep required scopes such as `offline_access`, `email`, `profile`, `openid`, and the supported `accounting.*` scopes needed for the tools.

## Xero can be blocked in Claude/Cowork by payment-processing session restrictions

This restriction is intentional in Claude/Cowork flows. Toolkits that can process payments may be flagged under Payment Processing by Claude policy, which blocks Xero in that session. Customers can still access Xero through Composio outside that restricted path, such as through Composio CLI or Platform flows.

## Connect MCP discovers Xero tools through meta-tools instead of preloading every tool

Connect MCP uses meta-tools such as `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MULTI_EXECUTE_TOOL` to discover and execute toolkit-specific tools dynamically. For Xero, the expected flow is: ask/search for the task such as `get Xero contacts`, let the agent discover the relevant Xero tool, then execute it through the multi-execute tool. This avoids loading 1000+ tools into context up front.

## Connect MCP and Platform MCP Xero connections are independent

Connect MCP servers and Platform MCP servers are independent. A connection visible in Platform is not automatically available through Connect MCP. Connect MCP supports one connected account in that consumer flow, so if the customer sees multiple active Xero connections they may be Platform-side connections rather than the Connect MCP connection being used.

## If For You Xero connect button is blocked, use Connect MCP directly while dashboard writes are limited

When the For You dashboard connect button is blocked by temporary dashboard write limitations, use Connect MCP (`connect.composio.dev/mcp`) from the client and connect Xero directly there. Verify the current Dashboard state before assuming this fallback is still needed.
