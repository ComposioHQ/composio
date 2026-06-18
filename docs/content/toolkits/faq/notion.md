## Why do Notion operations show "Composio" instead of the user's name?

Notion attributes actions to the integration itself, not the individual user. The name and logo shown come from the integration configuration. To use a custom name or logo, create your own Notion integration. See [Notion integration docs](https://developers.notion.com/docs/create-a-notion-integration).

## How do I grant access to more Notion pages?

Open Notion, go to Settings & Members, then Connections. Select the integration (Composio or your custom integration), click "Select pages" or "Manage access", and add or remove pages as needed.

## Does Notion use OAuth scopes?

No. Notion controls access by granting integrations access to specific pages and databases, not through scopes. You don't need to pass scopes when creating an auth config.

## How does Notion's access model work?

It depends on the integration type. OAuth apps (public) let users select which pages to share during authorization. Internal integrations (API key) have page access managed in the integration settings.

## How do I set up the Notion webhook ingress endpoint?

With Composio-managed Notion credentials, the webhook ingress endpoint is already provisioned — just create the trigger. If you bring your own Notion OAuth app, the verification flow runs in reverse from Slack's: Notion sends a verification token to the ingress endpoint, and you paste that token back into Notion to finalize.

1. **Create the endpoint.**

   ```bash
   curl -X POST "https://backend.composio.dev/api/v3.1/webhook_endpoints" \
     -H "x-api-key: <YOUR_COMPOSIO_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"toolkit_slug": "notion", "client_id": "<YOUR_NOTION_OAUTH_CLIENT_ID>"}'
   ```

   Save the returned `id` and `webhook_url`.

2. **Paste the `webhook_url` into Notion** under your integration's Webhook settings. Notion will POST a verification token to the URL.

3. **Read the token from Composio.**

   ```bash
   curl "https://backend.composio.dev/api/v3.1/webhook_endpoints/<ENDPOINT_ID>" \
     -H "x-api-key: <YOUR_COMPOSIO_API_KEY>"
   ```

   The token is in `data.webhook_signing_secret`.

4. **Paste the token back into Notion's verify field** to complete setup. Continue with [Creating triggers](https://docs.composio.dev/docs/setting-up-triggers/creating-triggers#using-the-sdk).

---
