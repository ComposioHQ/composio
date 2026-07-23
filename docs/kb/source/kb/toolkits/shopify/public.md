---
type: reference
title: "Shopify"
description: "Customer-safe support knowledge for Shopify."
category: toolkits/shopify
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - shopify
---
# Shopify


## Shopify API-key/admin-token auth is deprecated; use OAuth2 or S2S auth instead

- Shopify docs: [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [admin-created custom app tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin)

Shopify deprecated the old admin-created custom-app token copy/paste path for new apps. New Dev Dashboard apps expose a Client ID and Client Secret, and the access token is generated programmatically with Shopify's client-credentials flow. In Composio, do not direct new Shopify users to API-key/Admin API Access Token auth. Use OAuth2 for user-facing Shopify integrations, or S2S auth when that matches the app's server-to-server/client-credentials use case.

If an auth screen still asks for an Admin API key, verify the authConfig is not using the deprecated API-key mode.

For Composio For You / consumer MCP, users cannot change the auth scheme themselves today; treat this as a product gap until the deprecated API-key auth scheme is removed from consumer defaults.

## Shopify managed/default OAuth is not available; use your own Shopify OAuth app

Composio-managed/default Shopify OAuth is not available. Customers should create their own Shopify OAuth app, configure the required scopes and redirect URL, and create a custom Composio authConfig with that app's client ID and secret.

## Use Composio's toolkit auth callback as the Shopify OAuth redirect URL

Set the Shopify OAuth app redirect URL to `https://backend.composio.dev/api/v3/toolkits/auth/callback`. If the customer is following custom-auth-config docs, this is the Composio callback endpoint the Shopify app should authorize. Older or mistyped redirect URLs can cause OAuth redirect failures.

## For You Shopify OAuth scopes cannot currently be customized

The Dashboard / For You Shopify connection flow does not currently support configuring an arbitrary custom scope set. If a customer needs broader Shopify scopes, treat it as a product gap or use a custom OAuth app/authConfig path where the requested scopes are configured on the customer's Shopify app.

## Custom Shopify credentials keep the same hosted auth UX and Composio still manages refresh

Using custom Shopify OAuth credentials does not change the end-user hosted auth and redirect experience. Users still go through the same Composio connect flow, and Composio continues to handle token refresh and credential management automatically. Masking changes for managed credentials do not affect custom-credential toolkits in the same way.

## Shopify OAuth 400s are commonly caused by bad client secrets or unverified gated scopes

A Shopify OAuth 400 during token exchange or connection initiation is commonly caused by incorrect credentials, especially a wrong client secret, or by gated scopes that have not been verified/approved. Re-enter the authConfig client secret carefully and initiate a fresh connection. Also verify the requested Shopify scopes are available to the app.

## Shopify subdomain should be only the store name, not the full `.myshopify.com` host

When Composio asks for the Shopify subdomain, pass only the store name, such as `your-store-name`. Do not pass the full host like `your-store-name.myshopify.com`; Composio constructs the Shopify domain from the subdomain.

## Use `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries

Use the updated Shopify GraphQL tool slug `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries. If the tool is not visible in tool discovery, make sure enough tools are being fetched and that the tool is enabled in the MCP/config being used.

## Fetch more than the default 20 Shopify tools and enable the tool in MCP config

Tool fetching can default to a limited number of tools. Pass a higher `limit`, for example `tools.get(user_id="<userId>", toolkits=["shopify"], limit=1000)`, to fetch the full Shopify tool set. For MCP, also confirm the target Shopify tool is enabled when creating the MCP config or by modifying the existing config.

## Dashboard/Claude Shopify flow does not currently support multiple connected accounts for the same app

The Dashboard flow used with clients like Claude Cowork does not currently support multiple connected accounts for a single app/toolkit in that experience. For multi-store or multi-user production use cases, use the Platform/Tool Router flow with explicit users and connections rather than relying on the single-account dashboard connection UX.

## Use `SHOPIFY_GET_ORDER_LIST` to confirm orders and retrieve order IDs

Call `SHOPIFY_GET_ORDER_LIST` first to confirm the store has orders and to retrieve the order ID from the response payload. Then pass that returned order ID into follow-up order actions such as retrieving or updating a specific order.

## Shopify order update 403s can be caused by missing `read_all_orders` scope

Check the scopes on the Shopify connection. If the connection lacks `read_all_orders`, reconnect with the needed order scopes before retrying order update/read calls that require access beyond the default order scope set.

## Custom Shopify tools can call GraphQL with Composio-injected auth

Create a custom tool/action under the Shopify toolkit and call Shopify's GraphQL endpoint from inside it. Composio injects the Shopify auth automatically through the custom tool execution path. For newer examples, the endpoint can be `/graphql.json`; older snippets used the full `https://<shopify-sub-domain>.myshopify.com/admin/api/<version>/graphql.json` endpoint. Include the JSON content type header and pass the GraphQL query in the body.

## If Shopify MCP auth completes but tools fail, append the configured `user_id` to the MCP server URL

As a workaround, get the MCP config ID, fetch the MCP server URL from the API, find the related authConfig and configured `user_id` in the dashboard, and append that `user_id` as a query parameter to the MCP server URL: `https://backend.composio.dev/v3/mcp/<server-id>/mcp?user_id=<user_id>`. Then retry the MCP server URL with that explicit user context.
