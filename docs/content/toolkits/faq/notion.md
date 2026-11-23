## How do I set up custom OAuth credentials for Notion?

Use your own Notion integration when you want your own name and logo on the consent screen and in Notion's activity, or to keep your users' tokens isolated to your product.

### Create the Notion integration

1. Go to [Notion integrations](https://www.notion.so/profile/integrations) and click **New integration**.
2. Enter a name, such as `Composio Notion Integration`, and select the associated workspace.
3. Set the integration type to **Public**. Composio's OAuth flow requires a public integration.
4. Under **OAuth domains & URIs**, add the redirect URI `https://backend.composio.dev/api/v1/auth-apps/add`. Use it exactly as shown: HTTPS, no trailing slash, no fragments or wildcards. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
5. Under **Capabilities**, select only what your integration needs, such as **Read content**, **Update content**, **Insert content**, and **Read user information**. Notion uses capabilities instead of OAuth scopes.

   ![Notion integration Capabilities section with content and user capabilities](/images/toolkits/notion/capabilities.webp)
6. Save, then copy the **Client ID** and **Client Secret**.

   ![Notion integration configuration with redacted OAuth Client ID and hidden Client Secret](/images/toolkits/notion/oauth-credentials.webp)

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Notion**.

   ![Composio Auth Configs page with the Create Auth Config button](/images/toolkits/shared/wIAvY0hheAM7HQEF4kG2KTYATY.webp)

   ![Create Auth Config search results showing Notion](/images/toolkits/notion/composio-search-notion.webp)
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.

   ![Notion auth config with OAUTH2 selected and the Use your own developer credentials toggle](/images/toolkits/notion/oauth2-auth-config.webp)
3. Paste the **Client ID** and **Client Secret** and click **Create Notion Auth Config**. Leave scopes empty.
4. Click **Connect Account**, choose the pages to share during Notion's authorization, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

## How do I connect Notion with an API key?

Use an internal integration secret when you connect your own workspace, don't need multi-user OAuth, and want to skip the redirect flow. API keys only work with internal integrations; public integrations must use OAuth.

1. On [Notion integrations](https://www.notion.so/profile/integrations), click **New integration**, enter a name, select the workspace, and set the type to **Internal**.
2. Copy the integration secret. It starts with `ntn_` or `secret_`.
3. Share the pages and databases you want Composio to reach with the integration. The integration can only access pages shared with it.
4. In the Composio dashboard, create a **Notion** auth config with the **API Key** auth type. Click **Connect Account**, paste the secret, and confirm the account shows as **Active**.

   ![Notion auth config with API KEY selected as the authentication method](/images/toolkits/notion/api-key-auth-config.webp)

   ![Composio connect screen with a redacted Notion API key](/images/toolkits/notion/connect-api-key.webp)

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

- **The same Notion user connects again through the same Notion app.** When a Notion user connects to a Notion app, Notion issues a new `access_token` and `refresh_token` pair for that connection. If the same user connects to the same Notion app again, whether it is Composio-managed or custom, Notion can issue a new token pair and invalidate the older `refresh_token`. The older `access_token` may continue working for some time, but once it expires, the older connection can no longer refresh and should be treated as expired. To avoid this, keep one active Notion connection per real user for a given Notion app, reuse that existing connection in your product, and avoid asking users to reconnect repeatedly. For production Notion integrations, we strongly recommend using your own Notion app so your users' tokens are isolated to your product. See "How do I set up custom OAuth credentials for Notion?" on this page for the steps.

## How do I set up the Notion webhook ingress endpoint?

With Composio-managed Notion credentials, the webhook ingress endpoint is already provisioned, so just create the trigger. If you bring your own Notion OAuth app, the verification flow runs in reverse from Slack's: Notion sends a verification token to the ingress endpoint, and you paste that token back into Notion to finalize.

### Create the endpoint

#### Python

##### Async

```python
from composio import AsyncComposio

composio = AsyncComposio()

endpoint = await composio.webhooks.endpoints.create(
    toolkit_slug="notion",
    client_id="YOUR_NOTION_OAUTH_CLIENT_ID",
)
print(endpoint.root.id, endpoint.root.webhook_url)
```

##### Sync

```python
from composio import Composio

composio = Composio()
endpoint = composio.webhooks.endpoints.create(
    toolkit_slug="notion",
    client_id="YOUR_NOTION_OAUTH_CLIENT_ID",
)
print(endpoint.root.id, endpoint.root.webhook_url)
```

<!-- end-python-modes -->

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

##### Async

```python
from composio import AsyncComposio

composio = AsyncComposio()

endpoint = await composio.webhooks.endpoints.get("we_123")
token = endpoint.data.get("webhook_signing_secret") if endpoint.data is not None else None
if token is None:
    raise RuntimeError("Notion has not sent a verification token yet")
print(token)
```

##### Sync

```python
from composio import Composio

composio = Composio()
endpoint = composio.webhooks.endpoints.get("we_123")
token = endpoint.data.get("webhook_signing_secret") if endpoint.data is not None else None
if token is None:
    raise RuntimeError("Notion has not sent a verification token yet")
print(token)
```

<!-- end-python-modes -->

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
