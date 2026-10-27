## Why do Notion operations show "Composio" instead of the user's name?

Notion attributes actions to the integration itself, not the individual user. The name and logo shown come from the integration configuration. To use a custom name or logo, create your own Notion integration. See [Notion integration docs](https://developers.notion.com/docs/create-a-notion-integration).

## How do I grant access to more Notion pages?

Open Notion, go to Settings & Members, then Connections. Select the integration (Composio or your custom integration), click "Select pages" or "Manage access", and add or remove pages as needed.

## Does Notion use OAuth scopes?

No. Notion controls access by granting integrations access to specific pages and databases, not through scopes. You don't need to pass scopes when creating an auth config.

## How does Notion's access model work?

It depends on the integration type. OAuth apps (public) let users select which pages to share during authorization. Internal integrations (API key) have page access managed in the integration settings.

## Reasons for Notion Connection expiry

- **The user disconnects the integration from Notion.** Notion documents that OAuth-installed public connections appear under `Settings` -> `Connections` and can be disconnected from the workspace. If a user removes the Composio-managed or custom Notion app there, the existing token set should be treated as revoked, and the user should reconnect Notion. See Notion's official guide to [adding and managing workspace connections](https://www.notion.com/help/add-and-manage-connections-with-the-api).

- **The same Notion user connects again through the same Notion app.** When a Notion user connects to a Notion app, Notion issues a new `access_token` and `refresh_token` pair for that connection. If the same user connects to the same Notion app again, whether it is Composio-managed or custom, Notion can issue a new token pair and invalidate the older `refresh_token`. The older `access_token` may continue working for some time, but once it expires, the older connection can no longer refresh and should be treated as expired. To avoid this, keep one active Notion connection per real user for a given Notion app, reuse that existing connection in your product, and avoid asking users to reconnect repeatedly. For production Notion integrations, we strongly recommend using your own Notion app so your users' tokens are isolated to your product. Follow the [Notion OAuth setup guide](https://composio.dev/auth/notion).

## How do I set up the Notion webhook ingress endpoint?

With Composio-managed Notion credentials, the webhook ingress endpoint is already provisioned, so just create the trigger. If you bring your own Notion OAuth app, the verification flow runs in reverse from Slack's: Notion sends a verification token to the ingress endpoint, and you paste that token back into Notion to finalize.

### Create the endpoint

#### Python

```python
from composio import Composio

composio = Composio()
endpoint = composio.webhooks.endpoints.create(
    toolkit_slug="notion",
    client_id="YOUR_NOTION_OAUTH_CLIENT_ID",
)
print(endpoint.root.id, endpoint.root.webhook_url)
```

#### TypeScript

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const endpoint = await composio.webhooks.endpoints.create({
  toolkitSlug: 'notion',
  clientId: 'YOUR_NOTION_OAUTH_CLIENT_ID',
});
console.log(endpoint.id, endpoint.webhookUrl);
```

#### API

```bash
curl -X POST https://backend.composio.dev/api/v3.1/webhook_endpoints \
  -H "x-api-key: $COMPOSIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"toolkit_slug": "notion", "client_id": "YOUR_NOTION_OAUTH_CLIENT_ID"}'
```

### Complete Notion verification

Save the returned `id` and `webhook_url`. Paste `webhook_url` into your Notion integration's Webhook settings. Notion sends a verification token to that URL.

Replace `we_123` with the saved endpoint ID and read the token:

#### Python

```python
from composio import Composio

composio = Composio()
endpoint = composio.webhooks.endpoints.get("we_123")
token = endpoint.data.get("webhook_signing_secret") if endpoint.data is not None else None
if token is None:
    raise RuntimeError("Notion has not sent a verification token yet")
print(token)
```

#### TypeScript

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const endpoint = await composio.webhooks.endpoints.get('we_123');
const token = endpoint.data?.webhook_signing_secret;
if (token == null) throw new Error('Notion has not sent a verification token yet');
console.log(token);
```

#### API

```bash
curl -s https://backend.composio.dev/api/v3.1/webhook_endpoints/we_123 \
  -H "x-api-key: $COMPOSIO_API_KEY" | jq -er '.data.webhook_signing_secret // error("Notion has not sent a verification token yet")'
```

<!-- end-languages -->

Paste the token back into Notion's verify field to complete setup. Continue with [Creating triggers](/docs/setting-up-triggers/creating-triggers#create-the-trigger).

## Notion database trigger fires for new pages, not updates

In manual testing, the Notion trigger fired when pages were added to the watched database, but not for updates. Test by adding a new page to the target database.
