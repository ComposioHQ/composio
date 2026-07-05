## How do I set up custom OAuth credentials for Shopify?

For a step-by-step guide on creating and configuring your own Shopify OAuth credentials with Composio, see [How to create OAuth credentials for Shopify](https://composio.dev/auth/shopify).

## Why am I seeing "App not found" when connecting Shopify?

The default Shopify OAuth app may be under review or expired. Use your own OAuth app or API authentication method until the default is restored.

---

## How should I handle Shopify API-key/admin-token auth?

- Shopify docs: [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [admin-created custom app tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin)

Shopify deprecated the old admin-created custom-app token copy/paste path for new apps. New Dev Dashboard apps expose a Client ID and Client Secret, and the access token is generated programmatically with Shopify's client-credentials flow. In Composio, do not direct new Shopify users to API-key/Admin API Access Token auth. Use OAuth2 for user-facing Shopify integrations, or S2S auth when that matches the app's server-to-server/client-credentials use case.

## When should I use my own Shopify OAuth app?

Users should create their own Shopify OAuth app, configure the required scopes and redirect URL, and create a custom Composio auth config with that app's client ID and secret. Shopify is one of the OAuth toolkits where users generally need their own developer credentials.

## When should I use Composio's toolkit auth callback as the Shopify OAuth redirect URL?

Set the Shopify OAuth app redirect URL to `https://backend.composio.dev/api/v3/toolkits/auth/callback`. If the user is following custom-auth-config docs, this is the Composio callback endpoint the Shopify app should authorize. Older or mistyped redirect URLs can cause OAuth redirect failures.

## What should I know about Shopify OAuth scope customization?

The Dashboard / For You Shopify connection flow does not currently support configuring an arbitrary custom scope set. If a user needs broader Shopify scopes, treat it as a currently unsupported flow or use a custom OAuth app/authConfig path where the requested scopes are configured on the user's Shopify app.

## What changes when I use custom Shopify credentials?

Using custom Shopify OAuth credentials does not change the end-user hosted auth and redirect experience. Users still go through the same Composio connect flow, and Composio continues to handle token refresh and credential management automatically. Masking changes for managed credentials do not affect custom-credential toolkits in the same way.

## What should I know about Shopify OAuth 400s?

A Shopify OAuth 400 during token exchange or connection initiation is commonly caused by incorrect credentials, especially a wrong client secret, or by gated scopes that have not been verified/approved. Re-enter the authConfig client secret carefully and initiate a fresh connection. Also verify the requested Shopify scopes are available to the app.

## How should I handle shopify subdomain should be only the store name, not the full `.myshopify.com` host?

When Composio asks for the Shopify subdomain, pass only the store name, such as `your-store-name`. Do not pass the full host like `your-store-name.myshopify.com`; Composio constructs the Shopify domain from the subdomain.

## When should I use `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries?

Use the updated Shopify GraphQL tool slug `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries. If the tool is not visible in tool discovery, make sure enough tools are being fetched and that the tool is enabled in the MCP/config being used.

## How should I handle fetch more than the default 20 Shopify tools and enable the tool in MCP config?

Tool fetching can default to a limited number of tools. Pass a higher `limit`, for example `tools.get(user_id="<userId>", toolkits=["shopify"], limit=1000)`, to fetch the full Shopify tool set. For MCP, also confirm the target Shopify tool is enabled when creating the MCP config or by modifying the existing config.

## How should I handle multiple Shopify accounts in dashboard or Claude flows?

For multi-store or multi-user production use cases, use the Platform or Tool Router flow with explicit users and connected accounts rather than relying on a single-account dashboard connection UX.

## When should I use `SHOPIFY_GET_ORDER_LIST` to confirm orders and retrieve order IDs?

Call `SHOPIFY_GET_ORDER_LIST` first to confirm the store has orders and to retrieve the order ID from the response payload. Then pass that returned order ID into follow-up order actions such as retrieving or updating a specific order.

## How should I handle shopify order update 403s can be caused by missing `read_all_orders` scope?

Check the scopes on the Shopify connection. If order reads or updates require access beyond the default order scope set, reconnect with the needed order scopes such as `read_all_orders` before retrying.

## How should I handle custom Shopify tools can call GraphQL with Composio-injected auth?

Create a custom tool/action under the Shopify toolkit and call Shopify's GraphQL endpoint from inside it. Composio injects the Shopify auth automatically through the custom tool execution path. For newer examples, the endpoint can be `/graphql.json`; older snippets used the full `https://<shopify-sub-domain>.myshopify.com/admin/api/<version>/graphql.json` endpoint. Include the JSON content type header and pass the GraphQL query in the body.

## How should I handle Shopify MCP auth completing but tool calls failing?

As a workaround, get the MCP config ID, fetch the MCP server URL from the API, find the related authConfig and configured `user_id` in the dashboard, and append that `user_id` as a query parameter to the MCP server URL: `https://backend.composio.dev/v3/mcp/<server-id>/mcp?user_id=<user_id>`. Then retry the MCP server URL with that explicit user context.
