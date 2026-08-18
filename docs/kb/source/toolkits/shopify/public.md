---
type: "reference"
title: "Shopify"
description: "Public support knowledge for Shopify."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "shopify"
---
# Shopify


## Shopify API-key/admin-token auth is deprecated; use OAuth2 or S2S auth instead

- Shopify docs: [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [admin-created custom app tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin)

Shopify deprecated the old admin-created custom-app token copy/paste path for new apps. New Dev Dashboard apps expose a Client ID and Client Secret, and the access token is generated programmatically with Shopify's client-credentials flow. In Composio, do not direct new Shopify users to API-key/Admin API Access Token auth. Use OAuth2 for user-facing Shopify integrations, or S2S auth when that matches the app's server-to-server/client-credentials use case.

If an auth screen still asks for an Admin API key, verify the authConfig is not using the deprecated API-key mode.

## Use Composio's toolkit auth callback as the Shopify OAuth redirect URL

Set the Shopify OAuth app redirect URL to the exact callback shown by the current Composio custom-auth-config flow. Older or mistyped v1/v3 callback paths can cause OAuth redirect failures, so copy the current value rather than relying on a hard-coded URL in this article.

## Custom Shopify credentials keep the same hosted auth UX and Composio still manages refresh

Using custom Shopify OAuth credentials does not change the end-user hosted auth and redirect experience. Users still go through the same Composio connect flow, and Composio continues to handle token refresh and credential management automatically. Masking changes for managed credentials do not affect custom-credential toolkits in the same way.

## Shopify OAuth 400s are commonly caused by incorrect client secrets or unverified gated scopes

A Shopify OAuth 400 during token exchange or connection initiation is commonly caused by incorrect credentials, especially a wrong client secret, or by gated scopes that have not been verified/approved. Re-enter the authConfig client secret carefully and initiate a fresh connection. Also verify the requested Shopify scopes are available to the app.

## Shopify subdomain should be only the store name, not the full `.myshopify.com` host

When Composio asks for the Shopify subdomain, pass only the store name, such as `your-store-name`. Do not pass the full host like `your-store-name.myshopify.com`; Composio constructs the Shopify domain from the subdomain.

## Use `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries

Use the updated Shopify GraphQL tool slug `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries. If the tool is not visible in tool discovery, make sure enough tools are being fetched and that the tool is enabled in the MCP/config being used.

## Fetch more than the default 20 Shopify tools and enable the tool in MCP config

Tool fetching can default to a limited number of tools. Pass a higher `limit`, for example `tools.get(user_id="<userId>", toolkits=["shopify"], limit=1000)`, to fetch the full Shopify tool set. For MCP, also confirm the target Shopify tool is enabled when creating the MCP config or by modifying the existing config.

## Use `SHOPIFY_GET_ORDERS_WITH_FILTERS` to confirm orders and retrieve order IDs

Call `SHOPIFY_GET_ORDERS_WITH_FILTERS` first to confirm the store has orders and retrieve order IDs from the response payload. Follow its `page_info` cursor when more than one page may match. Then pass a returned order ID into follow-up actions such as `SHOPIFY_GET_ORDER` or `SHOPIFY_UPDATE_ORDER`. The older `SHOPIFY_GET_ORDER_LIST` action is deprecated.

## Shopify order update 403s can be caused by missing `read_all_orders` scope

Check the scopes on the Shopify connection. If the connection lacks `read_all_orders`, reconnect with the needed order scopes before retrying order update/read calls that require access beyond the default order scope set.

## Custom Shopify tools can call GraphQL with Composio-injected auth

Create a custom tool/action under the Shopify toolkit and call Shopify's GraphQL endpoint from inside it. Composio injects the Shopify auth automatically through the custom tool execution path. For newer examples, the endpoint can be `/graphql.json`; older snippets used the full `https://<shopify-sub-domain>.myshopify.com/admin/api/<version>/graphql.json` endpoint. Include the JSON content type header and pass the GraphQL query in the body.
