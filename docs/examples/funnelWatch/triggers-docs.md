---
title: Triggers
description: Understand how Composio delivers event data from connected apps
keywords: [triggers, webhooks, events, polling, webhook endpoint, concepts]
---

Triggers let your agent subscribe to live time events: a new Slack message, a GitHub commit, an incoming email.

You can either attach a webhook to your provider to get real-time updates or poll the provider on a schedule (such as every 15 minutes).

<Figure src="/images/triggers-flow.svg" srcDark="/images/triggers-flow-dark.svg" alt="Triggers flow: connected apps send events to Composio, which delivers them to your webhook subscription URL via HTTP POST" caption="How triggers deliver events from apps to your application" />


## Working with triggers

1. Subscribe to events so Composio knows which URL to deliver to. One-time per project.
2. **Discover** available trigger types for a toolkit (e.g., `GITHUB_COMMIT_EVENT`).
3. **Create** an active trigger scoped to a user's connected account — see [Creating triggers](/docs/setting-up-triggers/creating-triggers), which also covers [Configuring the webhook endpoint](/docs/setting-up-triggers/creating-triggers#configuring-the-webhook-endpoint) for triggers that need it.
4. **Receive events** at your subscription URL and route on `metadata.trigger_slug`.
5. **Manage** triggers — enable, disable, or delete as needed.

<Accordions>
<Accordion title="What is a trigger type?">
A trigger type is a template that defines what event to listen for and what configuration is required. For example, `GITHUB_COMMIT_EVENT` requires an `owner` and `repo`. Each toolkit exposes its own set of trigger types.
</Accordion>
<Accordion title="What is a trigger instance?">
When you create a trigger from a type, it's scoped to a specific [user and connected account](/docs/how-composio-works). For example, creating a `GITHUB_COMMIT_EVENT` trigger for user `alice` on the `composio` repo produces a trigger instance with its own `ti_*` ID that you can enable, disable, or delete independently.
</Accordion>
</Accordions>

<Callout>
Triggers are scoped to a connected account. If you haven't set up authentication yet, see [Authentication](/docs/authentication).
</Callout>

## Next steps

<Cards>
  <Card icon={<Plug />} title="Subscribing to events" href="/docs/setting-up-triggers/subscribing-to-events" description="One-time per project: tell Composio which URL to deliver events to" />
  <Card icon={<Zap />} title="Creating triggers" href="/docs/setting-up-triggers/creating-triggers" description="Inspect a trigger type and create trigger instances via the SDK or dashboard" />
  <Card icon={<ShieldCheck />} title="Verifying webhooks" href="/docs/webhook-verification" description="Verify webhook signatures and understand payload versions" />
  <Card icon={<Wrench />} title="Managing triggers" href="/docs/setting-up-triggers/managing-triggers" description="Discover, list, enable, disable, and delete triggers" />
  <Card icon={<BookOpen />} title="Example: Gmail labeler" href="/cookbooks/gmail-labeler" description="Build an automated email labeling agent using triggers" />
</Cards>

---
title: Creating triggers
description: Create trigger instances via the dashboard or SDK
keywords: [triggers, create trigger, trigger config]
---

Create a trigger to start receiving events. A trigger watches for a specific event (e.g., `GITHUB_COMMIT_EVENT`) on a specific user's connected account. For an overview of how triggers work, see [Triggers](/docs/triggers).

<Callout type="info" title="Prerequisites">
- An [auth config](/docs/authentication#how-composio-manages-authentication) for the toolkit you want to monitor
- A connected account for the user whose events you want to capture
- A [webhook subscription](/docs/setting-up-triggers/subscribing-to-events) on the project, so events have somewhere to land
</Callout>

You can create triggers using the [SDK](#using-the-sdk) or the Composio [dashboard](#using-the-dashboard). Some webhook triggers also need a webhook endpoint configured first — covered in [Configuring the webhook endpoint](#configuring-the-webhook-endpoint) below.

## Configuring the webhook endpoint

Some webhook triggers require a webhook endpoint registered with the provider before they can fire. With Composio-managed OAuth, this is already done for you. You only run the steps below when you bring your own OAuth app and the trigger type's `requires_webhook_endpoint_setup` flag is `true`.

Each OAuth app you bring gets its own ingress URL within a project:

```
https://backend.composio.dev/api/v3.1/webhook_ingress/{toolkit_slug}/{we_xxx}/trigger_event
```

A single OAuth app can serve at most one Composio project: providers accept only one callback URL per OAuth app, and each ingress URL routes to a single project. In return, every project becomes its own webhook tenant — with:

- **Its own ingress rate limit and backpressure budget**
- **Project-scoped credentials** — the signing secret and app-level token you provide are stored against this project alone, never shared across projects. Repeat verification handshakes are rejected after the endpoint is verified, so the signing secret can't be silently swapped by a forged challenge.
- **Clean fan-out** — events reach only that project's trigger instances
- **Per-project metering**

Every inbound event is signature-checked at ingress before any trigger fires:

- **HMAC-SHA256** for Slack, **Ed25519** or shared-token matching for other providers
- **Timestamp replay protection** — when the provider signs a request timestamp, requests outside the allowed skew window are rejected
- **Unsigned or tampered requests** are rejected with `400` at ingress, so third parties can't spoof events onto your triggers

<Callout type="warn">
**Sharing one OAuth app across projects?** Consolidate to a single project or register separate OAuth apps per project before continuing.
</Callout>

The walkthrough below uses Slack as the example and walks through the [Webhook Endpoints API](/reference/api-reference/webhook-endpoints). For setup notes specific to each toolkit, see its FAQ section — e.g., [Slack](/toolkits/slack), [Notion](/toolkits/notion).

### Step 1: Discover what credentials the endpoint needs

Call the schema endpoint for the toolkit. The `setup_fields` in the response tell you exactly what to collect from the provider's app dashboard.

```bash
curl "https://backend.composio.dev/api/v3.1/webhook_endpoints/schema?toolkit_slug=slack" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>"
```

Sample response:

```json
{
  "toolkit_slug": "slack",
  "setup_fields": {
    "webhook_signing_secret": {
      "display_name": "Signing Secret",
      "description": "Webhook request signing secret from your Slack app dashboard",
      "is_required": true,
      "is_secret": true
    },
    "app_token": {
      "display_name": "App-Level Token",
      "description": "Slack xapp- token with authorizations:read scope for event authorization",
      "is_required": true,
      "is_secret": true
    }
  }
}
```

### Step 2: Create the endpoint

```bash
curl -X POST "https://backend.composio.dev/api/v3.1/webhook_endpoints" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "toolkit_slug": "slack",
    "client_id": "<YOUR_OAUTH_CLIENT_ID>"
  }'
```

Sample response:

```json
{
  "id": "we_abc123",
  "toolkit_slug": "slack",
  "client_id": "<YOUR_OAUTH_CLIENT_ID>",
  "webhook_url": "https://backend.composio.dev/api/v3.1/webhook_ingress/slack/we_abc123/trigger_event",
  "data": null,
  "created_at": "2026-04-24T10:00:00.000Z"
}
```

Hold on to two values from the response: `id` (used as `<ENDPOINT_ID>` below) and `webhook_url` (you'll paste this into the provider's app dashboard in step 4). The call is **idempotent per `(toolkit_slug, client_id)` within a project** — calling it again with the same pair returns the existing endpoint without rotating the URL or wiping the secret.

### Step 3: Store the credentials returned by the schema

`PATCH` all the fields the schema returned in a single request. For Slack, that's the signing secret and (when needed) the app-level token together:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3.1/webhook_endpoints/<ENDPOINT_ID>" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "webhook_signing_secret": "<SIGNING_SECRET>",
      "app_token": "xapp-..."
    }
  }'
```

For Slack, the credentials come from:

- **Signing secret** — Slack app → Basic Information → App Credentials → Signing Secret.
- **App-level token** — Slack app → Basic Information → App-Level Tokens, with scope `authorizations:read`. Required for direct messages, private channels, and reactions; omit it if you only need public-channel events.

<Callout type="warn">
**Store the credentials before you switch the provider's callback URL in step 4.** If the provider posts to the URL without a secret on the endpoint, every request fails with `400`, and the provider may auto-disable the endpoint after a window of consecutive failures (Slack: ~36 hours).
</Callout>

### Step 4: Point the provider's app dashboard at the URL

Paste the `webhook_url` from step 2 into the provider's app dashboard:

- **Slack** → Event Subscriptions → Request URL
- **Notion** → Webhook Endpoints (in the integration's settings)

For providers that issue a verification challenge on save (Slack `url_verification`, Notion's verification token, and so on), Composio responds automatically — no handshake code on your side. Once the provider accepts the URL, continue to [Using the SDK](#using-the-sdk) to create your trigger.

### Updating an endpoint

To rotate the signing secret or update any single field, `PATCH` it (other fields are preserved):

```bash
curl -X PATCH "https://backend.composio.dev/api/v3.1/webhook_endpoints/<ENDPOINT_ID>" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "data": { "webhook_signing_secret": "<NEW_SECRET>" } }'
```

To **replace** `data` wholesale (any field you don't include is cleared), `POST` to the same URL:

```bash
curl -X POST "https://backend.composio.dev/api/v3.1/webhook_endpoints/<ENDPOINT_ID>" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "data": { "webhook_signing_secret": "<NEW_SECRET>", "app_token": "<NEW_APP_TOKEN>" } }'
```

The `webhook_url` is immutable for the lifetime of the endpoint — rotating the signing secret on the provider side is a `PATCH` on the existing endpoint, not a new one.

To inspect a single endpoint:

```bash
curl "https://backend.composio.dev/api/v3.1/webhook_endpoints/<ENDPOINT_ID>" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>"
```

To list every endpoint in the current project:

```bash
curl "https://backend.composio.dev/api/v3.1/webhook_endpoints" \
  -H "x-api-key: <YOUR_COMPOSIO_API_KEY>"
```

## Using the SDK

Before creating a trigger, inspect the trigger type to see what configuration it requires. Then create the trigger with the required config.

<Callout>
When you pass a `user_id`, the SDK automatically finds the user's connected account for the relevant toolkit. If the user has multiple connected accounts for the same toolkit, it uses the most recently created one. You can also pass a `connected_account_id`/`connectedAccountId` directly if you need more control.
</Callout>

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
from composio import Composio

composio = Composio()
user_id = "user-id-123435"

# Check what configuration is required
trigger_type = composio.triggers.get_type("GITHUB_COMMIT_EVENT")
print(trigger_type.config)
# Returns: {"properties": {"owner": {...}, "repo": {...}}, "required": ["owner", "repo"]}

# Create trigger with the required config
trigger = composio.triggers.create(
    slug="GITHUB_COMMIT_EVENT",
    user_id=user_id,
    trigger_config={"owner": "your-repo-owner", "repo": "your-repo-name"},
)
print(f"Trigger created: {trigger.trigger_id}")
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const userId = 'user-id-123435';

// Check what configuration is required
const triggerType = await composio.triggers.getType("GITHUB_COMMIT_EVENT");
console.log(triggerType.config);
// Returns: {"properties": {"owner": {...}, "repo": {...}}, "required": ["owner", "repo"]}

// Create trigger with the required config
const trigger = await composio.triggers.create(
    userId,
    'GITHUB_COMMIT_EVENT',
    {
        triggerConfig: {
            owner: 'your-repo-owner',
            repo: 'your-repo-name'
        }
    }
);
console.log(`Trigger created: ${trigger.triggerId}`);
```
  </Tab>
</Tabs>

<Callout>
Trigger instances default to the `'latest'` toolkit version. If your code parses trigger payloads programmatically against a fixed schema, you can pin a specific version at SDK initialization. See [Toolkit Versioning](/docs/tools-direct/toolkit-versioning#choosing-between-latest-and-a-pinned-version) for details.
</Callout>

## Using the dashboard

1. Navigate to [Auth Configs](https://dashboard.composio.dev/~/project/auth-configs) and select the auth config for the relevant toolkit
2. Navigate to **Active Triggers** and click **Create Trigger**
3. Select the connected account for which you want to create a trigger
4. Choose a trigger type and fill in the required configuration
5. Click **Create Trigger**

<Video src="/videos/triggers-creation.mp4" caption="Creating a GitHub Star Added trigger from the dashboard" />

## What to read next

<Cards>
  <Card icon={<Plug />} title="Subscribing to events" href="/docs/setting-up-triggers/subscribing-to-events" description="Set up the webhook subscription URL Composio delivers events to" />
  <Card icon={<ShieldCheck />} title="Verifying webhooks" href="/docs/webhook-verification" description="Validate webhook signatures so you know payloads came from Composio" />
  <Card icon={<Wrench />} title="Managing triggers" href="/docs/setting-up-triggers/managing-triggers" description="List, enable, disable, and delete trigger instances" />
</Cards>


---
title: Managing triggers
description: List, enable, disable, and delete trigger instances
keywords: [manage triggers, enable, disable, delete, discover]
---

## Listing active triggers

List trigger instances that have been created. Results are cursor-paginated.

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
from composio import Composio

composio = Composio()

active = composio.triggers.list_active(
    connected_account_ids=["ca_def456"],
)

for trigger in active.items:
    print(f"{trigger.id} ({trigger.trigger_name}) - disabled_at={trigger.disabled_at}")

# Paginate with cursor
if active.next_cursor:
    next_page = composio.triggers.list_active(cursor=active.next_cursor)
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

const active = await composio.triggers.listActive({
  connectedAccountIds: ['ca_def456'],
});

for (const trigger of active.items) {
  console.log(`${trigger.id} (${trigger.triggerName}) - disabled: ${trigger.disabledAt !== null}`);
}

// Paginate with cursor
if (active.nextCursor) {
  const nextPage = await composio.triggers.listActive({ cursor: active.nextCursor });
}
```
  </Tab>
</Tabs>

| Filter | Description |
|--------|-------------|
| `connected_account_ids` / `connectedAccountIds` | Array of connected account IDs |
| `trigger_ids` / `triggerIds` | Array of trigger instance IDs |
| `trigger_names` / `triggerNames` | Array of trigger type slugs |
| `auth_config_ids` / `authConfigIds` | Array of auth config IDs |
| `show_disabled` / `showDisabled` | Include disabled triggers (default: `false`) |

## Enable / Disable triggers

Pause a trigger temporarily without deleting it:

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
# Disable a trigger
composio.triggers.disable(trigger_id="ti_abcd123")

# Re-enable when needed
composio.triggers.enable(trigger_id="ti_abcd123")
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';
const composio = new Composio();
// ---cut---
// Disable a trigger
await composio.triggers.disable('ti_abcd123');

// Re-enable when needed
await composio.triggers.enable('ti_abcd123');
```
  </Tab>
</Tabs>

You can also toggle triggers from the dashboard:

1. Go to [Auth Configs](https://dashboard.composio.dev/~/project/auth-configs) and select your auth config
2. Navigate to **Active Triggers**
3. Toggle the trigger on or off

<Figure
  src="/images/trigger-enable-disable.png"
  alt="Enable/disable triggers from the dashboard"
  caption="Enable/disable triggers from the dashboard"
  size="lg"
/>

## Deleting triggers

Permanently remove a trigger instance:

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
composio.triggers.delete(trigger_id="ti_abcd123")
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';
const composio = new Composio();
// ---cut---
await composio.triggers.delete('ti_abcd123');
```
  </Tab>
</Tabs>

<Callout type="warn">
Deleting a trigger is permanent. Use `disable()` instead to temporarily stop receiving events.
</Callout>

## What to read next

<Cards>
  <Card icon={<ShieldCheck />} title="Verifying webhooks" href="/docs/webhook-verification" description="Validate webhook signatures to ensure payloads are authentic" />
  <Card icon={<Zap />} title="Creating triggers" href="/docs/setting-up-triggers/creating-triggers" description="Create trigger instances to start receiving events from connected apps" />
  <Card icon={<Zap />} title="Subscribing to events" href="/docs/setting-up-triggers/subscribing-to-events" description="Set up webhooks or SDK subscriptions to handle trigger events" />
</Cards>

---
title: Managing triggers
description: List, enable, disable, and delete trigger instances
keywords: [manage triggers, enable, disable, delete, discover]
---

## Listing active triggers

List trigger instances that have been created. Results are cursor-paginated.

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
from composio import Composio

composio = Composio()

active = composio.triggers.list_active(
    connected_account_ids=["ca_def456"],
)

for trigger in active.items:
    print(f"{trigger.id} ({trigger.trigger_name}) - disabled_at={trigger.disabled_at}")

# Paginate with cursor
if active.next_cursor:
    next_page = composio.triggers.list_active(cursor=active.next_cursor)
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

const active = await composio.triggers.listActive({
  connectedAccountIds: ['ca_def456'],
});

for (const trigger of active.items) {
  console.log(`${trigger.id} (${trigger.triggerName}) - disabled: ${trigger.disabledAt !== null}`);
}

// Paginate with cursor
if (active.nextCursor) {
  const nextPage = await composio.triggers.listActive({ cursor: active.nextCursor });
}
```
  </Tab>
</Tabs>

| Filter | Description |
|--------|-------------|
| `connected_account_ids` / `connectedAccountIds` | Array of connected account IDs |
| `trigger_ids` / `triggerIds` | Array of trigger instance IDs |
| `trigger_names` / `triggerNames` | Array of trigger type slugs |
| `auth_config_ids` / `authConfigIds` | Array of auth config IDs |
| `show_disabled` / `showDisabled` | Include disabled triggers (default: `false`) |

## Enable / Disable triggers

Pause a trigger temporarily without deleting it:

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
# Disable a trigger
composio.triggers.disable(trigger_id="ti_abcd123")

# Re-enable when needed
composio.triggers.enable(trigger_id="ti_abcd123")
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';
const composio = new Composio();
// ---cut---
// Disable a trigger
await composio.triggers.disable('ti_abcd123');

// Re-enable when needed
await composio.triggers.enable('ti_abcd123');
```
  </Tab>
</Tabs>

You can also toggle triggers from the dashboard:

1. Go to [Auth Configs](https://dashboard.composio.dev/~/project/auth-configs) and select your auth config
2. Navigate to **Active Triggers**
3. Toggle the trigger on or off

<Figure
  src="/images/trigger-enable-disable.png"
  alt="Enable/disable triggers from the dashboard"
  caption="Enable/disable triggers from the dashboard"
  size="lg"
/>

## Deleting triggers

Permanently remove a trigger instance:

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
composio.triggers.delete(trigger_id="ti_abcd123")
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';
const composio = new Composio();
// ---cut---
await composio.triggers.delete('ti_abcd123');
```
  </Tab>
</Tabs>

<Callout type="warn">
Deleting a trigger is permanent. Use `disable()` instead to temporarily stop receiving events.
</Callout>

## What to read next

<Cards>
  <Card icon={<ShieldCheck />} title="Verifying webhooks" href="/docs/webhook-verification" description="Validate webhook signatures to ensure payloads are authentic" />
  <Card icon={<Zap />} title="Creating triggers" href="/docs/setting-up-triggers/creating-triggers" description="Create trigger instances to start receiving events from connected apps" />
  <Card icon={<Zap />} title="Subscribing to events" href="/docs/setting-up-triggers/subscribing-to-events" description="Set up webhooks or SDK subscriptions to handle trigger events" />
</Cards>


---
title: Subscribing to events
description: Receive trigger events via webhooks or SDK subscriptions
keywords: [webhooks, subscribe, events, webhook payload, V3]
---

## Webhooks

Webhooks are the recommended way to receive trigger events in production. To start receiving events, create a webhook subscription with your endpoint URL and select which event types you want to receive. You can subscribe to any combination:

| Event type | Description |
|------------|-------------|
| `composio.trigger.message` | Fired when a trigger receives data from an external service. |
| `composio.connected_account.expired` | Fired when a connected account expires and needs re-authentication. See [Subscribing to connection expiry events](/docs/subscribing-to-connection-expiry-events). |
| `composio.trigger.disabled` | **Fired when** Composio automatically disables a trigger — expired connection, webhook refresh failure, or unhealthy polling. **Not fired when** you disable a trigger through the manage API or deactivate its connected account via `PATCH /api/v3/connected_accounts/{id}/status`. |

Set your webhook URL in the [dashboard settings](https://dashboard.composio.dev/~/project/settings/webhook) or via the [Webhook Subscriptions API](/reference/api-reference/webhook-subscriptions):

```bash
curl -X POST https://backend.composio.dev/api/v3.1/webhook_subscriptions \
  -H "X-API-KEY: <your-composio-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://example.com/webhook",
    "enabled_events": ["composio.trigger.message"]
  }'
```

<Callout>
Your webhook endpoint must be publicly accessible — Composio's outbound IPs are dynamic, so IP allowlisting and private/VPN-only endpoints will not work. Use [signature verification](/docs/webhook-verification) to authenticate payloads instead.
</Callout>

<Callout type="warn">
The response includes a `secret` for [verifying webhook signatures](/docs/webhook-verification). Store it securely.
</Callout>

### Handling events

All events arrive at the same endpoint. Route on the `type` field to handle each event type:

<Callout>
[Inspect the payload schema](#inspecting-trigger-payload-schemas) for a trigger before writing your handler. See [Webhook payload (V3)](#webhook-payload-v3) for the full event structure.
</Callout>

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
from composio import WebhookEventType

@app.post("/webhook")
async def webhook_handler(request: Request):
    payload = await request.json()
    event_type = payload.get("type")

    if event_type == WebhookEventType.TRIGGER_MESSAGE:
        trigger_slug = payload["metadata"]["trigger_slug"]
        event_data = payload["data"]

        if trigger_slug == "GITHUB_COMMIT_EVENT":
            print(f"New commit by {event_data['author']}: {event_data['message']}")

    # Handle connected account expired events

    return {"status": "ok"}
```
  </Tab>
  <Tab value="TypeScript">
```typescript
type NextApiRequest = { body: any };
type NextApiResponse = { status: (code: number) => { json: (data: any) => void } };
// ---cut---
export default async function webhookHandler(req: NextApiRequest, res: NextApiResponse) {
  const payload = req.body;

  if (payload.type === 'composio.trigger.message') {
    const triggerSlug = payload.metadata.trigger_slug;
    const eventData = payload.data;

    if (triggerSlug === 'GITHUB_COMMIT_EVENT') {
      console.log(`New commit by ${eventData.author}: ${eventData.message}`);
    }
  }

  // Handle connected account expired events

  res.status(200).json({ status: 'ok' });
}
```
  </Tab>
</Tabs>

<Callout type="warn">
Always [verify webhook signatures](/docs/webhook-verification) in production to ensure payloads are authentic.
</Callout>

### Inspecting trigger payload schemas

Each trigger type defines the schema of event data it sends. Use `get_type()`/`getType()` to inspect it before writing your handler:

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
from composio import Composio

composio = Composio()

trigger_type = composio.triggers.get_type("GITHUB_COMMIT_EVENT")
print(trigger_type.payload)
# Returns: {"properties": {"author": {...}, "id": {...}, "message": {...}, "timestamp": {...}, "url": {...}}}
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

const triggerType = await composio.triggers.getType("GITHUB_COMMIT_EVENT");
console.log(triggerType.payload);
// Returns: {"properties": {"author": {...}, "id": {...}, "message": {...}, "timestamp": {...}, "url": {...}}}
```
  </Tab>
</Tabs>

The payload schema tells you what fields will be in the `data` object of the webhook event.

### Webhook payload (V3)

New organizations receive V3 payloads by default. V3 separates event metadata from the actual event data:

```json
{
  "id": "msg_abc123",
  "type": "composio.trigger.message",
  "metadata": {
    "log_id": "log_abc123",
    "trigger_slug": "GITHUB_COMMIT_EVENT",
    "trigger_id": "ti_xyz789",
    "connected_account_id": "ca_def456",
    "auth_config_id": "ac_xyz789",
    "user_id": "user-id-123435"
  },
  "data": {
    "commit_sha": "a1b2c3d",
    "message": "fix: resolve null pointer",
    "author": "jane"
  },
  "timestamp": "2026-01-15T10:30:00Z"
}
```

<Callout>
See [webhook payload versions](/docs/webhook-verification#webhook-payload-versions) for V2 and V1 formats.
</Callout>

## Testing locally

### SDK subscriptions

Subscribe to trigger events directly through the SDK without setting up a webhook endpoint. Uses WebSockets under the hood.

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
from composio import Composio

composio = Composio()

subscription = composio.triggers.subscribe()

@subscription.handle(trigger_id="your_trigger_id")
def handle_event(data):
    print(f"Event received: {data}")

subscription.wait_forever()
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

await composio.triggers.subscribe(
    (data) => {
        console.log('Event received:', data);
    },
    { triggerId: 'your_trigger_id' }
);
```
  </Tab>
</Tabs>

### Using ngrok

To test the full webhook flow locally, use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 8000
```

Then use the ngrok URL as your webhook endpoint:

```bash
curl -X POST https://backend.composio.dev/api/v3.1/webhook_subscriptions \
  -H "X-API-KEY: <your-composio-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-ngrok-url.ngrok-free.app/webhook",
    "enabled_events": ["composio.trigger.message"]
  }'
```

Events will now be forwarded to your local server at `http://localhost:8000/webhook`.

## Identifying trigger events

Every webhook event includes a `metadata` object that tells you exactly where it came from:

| Field | What it tells you |
|-------|-------------------|
| `metadata.trigger_id` | Which trigger instance fired this event |
| `metadata.trigger_slug` | The type of trigger (e.g., `GITHUB_COMMIT_EVENT`) |
| `metadata.connected_account_id` | Which connected account it belongs to |
| `metadata.user_id` | Which user it's for |
| `metadata.auth_config_id` | Which auth config was used |

Use `trigger_id` to match events to a specific trigger instance, or `trigger_slug` to handle all events of a certain type. These fields can also be passed as filters when using [SDK subscriptions](#sdk-subscriptions).

## What to read next

<Cards>
  <Card icon={<Zap />} title="Managing triggers" href="/docs/setting-up-triggers/managing-triggers" description="List, enable, disable, and delete trigger instances" />
  <Card icon={<ShieldCheck />} title="Verifying webhooks" href="/docs/webhook-verification" description="Validate webhook signatures to ensure payloads are authentic" />
  <Card icon={<Zap />} title="Troubleshooting triggers" href="/docs/troubleshooting/triggers" description="Not receiving events? Check common trigger issues and how to fix them" />
</Cards>


---
title: Verifying webhooks
description: Verify webhook signatures to ensure payloads are authentic
keywords: [webhook, verification, signature, HMAC, security]
---

Composio signs every webhook request. Always verify signatures in production to ensure payloads are authentic.

## SDK verification

The SDK handles signature verification, payload parsing, and version detection (V1, V2, V3).

<Callout>
Store the webhook secret securely as `COMPOSIO_WEBHOOK_SECRET`. You can fetch it from the [webhook subscription](/reference/api-reference/webhook-subscriptions/getWebhookSubscriptionsById) at any time or [rotate it](/reference/api-reference/webhook-subscriptions/postWebhookSubscriptionsByIdRotateSecret) if it leaks.
</Callout>

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
try:
    result = composio.triggers.verify_webhook(
        id=request.headers.get("webhook-id", ""),
        payload=request.get_data(as_text=True),
        signature=request.headers.get("webhook-signature", ""),
        timestamp=request.headers.get("webhook-timestamp", ""),
        secret=os.getenv("COMPOSIO_WEBHOOK_SECRET", ""),
    )
    # result.version, result.payload, result.raw_payload
except Exception:
    return {"error": "Invalid signature"}, 401
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import { Composio } from '@composio/core';
const composio = new Composio();
const req = { headers: {} as Record<string, string>, body: '' };
// ---cut---
try {
  const result = await composio.triggers.verifyWebhook({
    id: req.headers['webhook-id'],
    payload: req.body,
    signature: req.headers['webhook-signature'],
    timestamp: req.headers['webhook-timestamp'],
    secret: process.env.COMPOSIO_WEBHOOK_SECRET!,
  });
  // result.version, result.payload, result.rawPayload
} catch (error) {
  // Return 401
}
```
  </Tab>
</Tabs>

<Callout>
An optional `tolerance` parameter (default: `300` seconds) controls how old a webhook can be before verification fails. Set to `0` to disable timestamp validation.
</Callout>

## Manual verification

If you are not using the Composio SDK and want to verify signatures manually.

<Callout>
Store the webhook secret securely as `COMPOSIO_WEBHOOK_SECRET`. You can fetch it from the [webhook subscription](/reference/api-reference/webhook-subscriptions/getWebhookSubscriptionsById) at any time or [rotate it](/reference/api-reference/webhook-subscriptions/postWebhookSubscriptionsByIdRotateSecret) if it leaks.
</Callout>

Every webhook request includes three headers: `webhook-signature`, `webhook-id`, and `webhook-timestamp`. Use these along with the raw request body to verify the signature:

<Tabs groupId="language" items={['Python', 'TypeScript']} persist>
  <Tab value="Python">
```python
import hmac
import hashlib
import base64
import json
import os

def verify_webhook(webhook_id: str, webhook_timestamp: str, body: str, signature: str) -> dict:
    secret = os.getenv("COMPOSIO_WEBHOOK_SECRET", "")
    signing_string = f"{webhook_id}.{webhook_timestamp}.{body}"
    expected = base64.b64encode(
        hmac.new(secret.encode(), signing_string.encode(), hashlib.sha256).digest()
    ).decode()
    received = signature.split(",", 1)[1] if "," in signature else signature
    if not hmac.compare_digest(expected, received):
        raise ValueError("Invalid webhook signature")

    payload = json.loads(body)
    # V3 payload
    return {
        "trigger_slug": payload["metadata"]["trigger_slug"],
        "data": payload["data"],
    }
```
  </Tab>
  <Tab value="TypeScript">
```typescript
import crypto from 'crypto';
// ---cut---
function verifyWebhook(
  webhookId: string,
  webhookTimestamp: string,
  body: string,
  signature: string
) {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET ?? '';
  const signingString = `${webhookId}.${webhookTimestamp}.${body}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signingString)
    .digest('base64');
  const received = signature.split(',')[1] ?? signature;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    throw new Error('Invalid webhook signature');
  }

  const payload = JSON.parse(body);
  // V3 payload
  return {
    triggerSlug: payload.metadata.trigger_slug,
    data: payload.data,
  };
}
```
  </Tab>
</Tabs>


## Webhook payload versions

`verifyWebhook()` auto-detects the version. If you process payloads manually, here are the formats:

<Tabs items={['V3 (default)', 'V2 (legacy)', 'V1 (legacy)']}>
  <Tab value="V3 (default)">
Metadata is separated from event data. New organizations receive V3 payloads by default.

```json
{
  "id": "msg_abc123",
  "type": "composio.trigger.message",
  "metadata": {
    "log_id": "log_abc123",
    "trigger_slug": "GITHUB_COMMIT_EVENT",
    "trigger_id": "ti_xyz789",
    "connected_account_id": "ca_def456",
    "auth_config_id": "ac_xyz789",
    "user_id": "user-id-123435"
  },
  "data": {
    "commit_sha": "a1b2c3d",
    "message": "fix: resolve null pointer",
    "author": "jane"
  },
  "timestamp": "2026-01-15T10:30:00Z"
}
```
  </Tab>
  <Tab value="V2 (legacy)">
Metadata fields are mixed into the `data` object alongside event data.

```json
{
  "type": "github_commit_event",
  "data": {
    "commit_sha": "a1b2c3d",
    "message": "fix: resolve null pointer",
    "author": "jane",
    "connection_id": "ca_def456",
    "connection_nano_id": "cn_abc123",
    "trigger_nano_id": "tn_xyz789",
    "trigger_id": "ti_xyz789",
    "user_id": "user-id-123435"
  },
  "timestamp": "2026-01-15T10:30:00Z",
  "log_id": "log_abc123"
}
```
  </Tab>
  <Tab value="V1 (legacy)">
```json
{
  "trigger_name": "github_commit_event",
  "trigger_id": "ti_xyz789",
  "connection_id": "ca_def456",
  "payload": {
    "commit_sha": "a1b2c3d",
    "message": "fix: resolve null pointer",
    "author": "jane"
  },
  "log_id": "log_abc123"
}
```
  </Tab>
</Tabs>

## What to read next

<Cards>
  <Card icon={<Plug />} title="Subscribing to events" href="/docs/setting-up-triggers/subscribing-to-events" description="Set up webhooks and SDK subscriptions to receive trigger events" />
  <Card icon={<RouteIcon />} title="Creating triggers" href="/docs/setting-up-triggers/creating-triggers" description="Configure the webhook endpoint when needed and create trigger instances" />
  <Card icon={<Zap />} title="Triggers overview" href="/docs/triggers" description="How Composio delivers event data from connected apps" />
  <Card icon={<Key />} title="Connection expiry events" href="/docs/subscribing-to-connection-expiry-events" description="Detect when OAuth connections expire and prompt re-authentication" />
</Cards>

