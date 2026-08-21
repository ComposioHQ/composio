Use this guide to configure Shopify authentication, discover the complete tool set, and work with Shopify orders and GraphQL.

## Configure Shopify authentication

**Use OAuth2 or S2S auth instead of API-key/admin-token auth.** Shopify deprecated the old admin-created custom-app token copy/paste path for new apps. New Dev Dashboard apps expose a Client ID and Client Secret, and the access token is generated programmatically with Shopify's client-credentials flow. In Composio, do not direct new Shopify users to API-key/Admin API Access Token auth. Use OAuth2 for user-facing Shopify integrations, or S2S auth when that matches the app's server-to-server/client-credentials use case.

- Shopify docs: [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [admin-created custom app tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin)

If an auth screen still asks for an Admin API key, verify the authConfig is not using the deprecated API-key mode.

**Use Composio's toolkit auth callback as the OAuth redirect URL.** Set the Shopify OAuth app redirect URL to the exact callback shown by the current Composio custom-auth-config flow. Older or mistyped v1/v3 callback paths can cause OAuth redirect failures, so copy the current value rather than relying on a hard-coded URL in this article.

**Keep the hosted auth experience when using custom credentials.** Using custom Shopify OAuth credentials does not change the end-user hosted auth and redirect experience. Users still go through the same Composio connect flow, and Composio continues to handle token refresh and credential management automatically. Masking changes for managed credentials do not affect custom-credential toolkits in the same way.

**Check credentials and gated scopes when OAuth returns 400.** A Shopify OAuth 400 during token exchange or connection initiation is commonly caused by incorrect credentials, especially a wrong client secret, or by gated scopes that have not been verified/approved. Re-enter the authConfig client secret carefully and initiate a fresh connection. Also verify the requested Shopify scopes are available to the app.

**Pass only the store name as the Shopify subdomain.** When Composio asks for the Shopify subdomain, pass only the store name, such as `your-store-name`. Do not pass the full host like `your-store-name.myshopify.com`; Composio constructs the Shopify domain from the subdomain.

## Discover and run Shopify tools

**Use the current GraphQL tool slug.** Use the updated Shopify GraphQL tool slug `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries. If the tool is not visible in tool discovery, make sure enough tools are being fetched and that the tool is enabled in the MCP/config being used.

**Fetch more than the default 20 tools when needed.** Tool fetching can default to a limited number of tools. Pass a higher `limit`, for example `tools.get(user_id="<userId>", toolkits=["shopify"], limit=1000)`, to fetch the full Shopify tool set. For MCP, also confirm the target Shopify tool is enabled when creating the MCP config or by modifying the existing config.

**Create custom Shopify tools with Composio-injected auth.** Create a custom tool/action under the Shopify toolkit and call Shopify's GraphQL endpoint from inside it. Composio injects the Shopify auth automatically through the custom tool execution path. For newer examples, the endpoint can be `/graphql.json`; older snippets used the full `https://<shopify-sub-domain>.myshopify.com/admin/api/<version>/graphql.json` endpoint. Include the JSON content type header and pass the GraphQL query in the body.

## Work with Shopify orders

**List orders before running follow-up actions.** Call `SHOPIFY_GET_ORDERS_WITH_FILTERS` first to confirm the store has orders and retrieve order IDs from the response payload. Follow its `page_info` cursor when more than one page may match. Then pass a returned order ID into follow-up actions such as `SHOPIFY_GET_ORDER` or `SHOPIFY_UPDATE_ORDER`. The older `SHOPIFY_GET_ORDER_LIST` action is deprecated.

**Check `read_all_orders` when order calls return 403.** Check the scopes on the Shopify connection. If the connection lacks `read_all_orders`, reconnect with the needed order scopes before retrying order update/read calls that require access beyond the default order scope set.
