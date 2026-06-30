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

---

# Implementation Playbook — one-shotting triggers (FunnelWatch lessons)

Everything above is the upstream reference. This section is the opinionated, battle-tested
companion: every architectural decision, its tradeoffs, the default we chose, the exact
errors we hit, and the working code. It was written after wiring a real Slack trigger
(inbound channel message → bot answers / creates an alert → replies in Slack) into this app.
**Goal: set up a new trigger — webhook or polling — correctly in one pass.**

## 0. The opinionated default stack (use unless you have a specific reason not to)

| Concern | Default we chose | One-liner why |
|---|---|---|
| Delivery transport | **Single public webhook** `POST /webhooks/composio`, route by `metadata.trigger_slug` | Production-grade, decoupled, survives app restarts. Use SDK `subscribe()` only for throwaway local iteration. |
| Dev tunnel | **cloudflared quick tunnel** | No account/login, instant. Accept the URL is ephemeral. |
| Stable URL | **named cloudflared tunnel** (later) | Quick-tunnel URL changes every restart → must re-register. |
| Signature verification | **enforce only when a signature header is present** | Non-breaking for local test tools that POST unsigned; still verifies real Composio traffic. Flip to always-enforce + sign internal traffic in prod. |
| Verification impl | **SDK `triggers.verify_webhook()` if available, else manual HMAC** | SDK handles scheme/version drift. |
| Trigger creation | **programmatic + idempotent** (`list_active()` → create if absent) | Reproducible; no duplicate `ti_*` instances. |
| Identity | **one constant `user_id`** (single-tenant) | A namespace label; connect the account under the same id. |
| Reply tool execution | **`dangerously_skip_version_check=True`** (dev); pin versions (prod) | Manual execution requires a pinned toolkit version. |
| Loop safety | **bot/app-id check + recent-reply dedup** | Channel triggers also fire for the bot's own replies. |

Where each piece lives in this repo (mirror these):
- Receive + verify + route: `app/webhooks.py`
- Bot brain (answer / create alert / loop guard): `app/slackbot.py`
- Outbound Slack send: `app/slack.py`
- Discover + create triggers: `tools/setup_slack_trigger.py`
- Real send test: `tools/test_slack_send.py`; offline bot test (no Slack): `tools/test_slackbot.py`

## 1. End-to-end runbook (checklist)

1. **Connect the account** under the app's `user_id` (dashboard or SDK). Verify:
   `composio.connected_accounts.list()` lists the toolkit. *(A connection is scoped to a
   `user_id`/entity — the id you connect under must equal the id you create triggers and
   execute tools with. Mismatch = silent "no connected account".)*
2. **Discover the exact slug — never guess.** Slugs vary and wrong ones 404:
   `composio.triggers.list(toolkit_slugs=["slack"])` → e.g. `SLACK_CHANNEL_MESSAGE_RECEIVED`.
   (Slack exposes two families: `SLACK_*` and `SLACKBOT_*` — see Pending Questions.)
3. **Pick transport.** Webhook (default) → start the tunnel and set the **project webhook URL**
   = `<public-url>/webhooks/composio` in the dashboard. *Setting that URL is where the
   **signing secret** is shown* — copy it to `.env` as `COMPOSIO_WEBHOOK_SECRET`.
   (Local dev alternative: skip the tunnel entirely and use `composio.triggers.subscribe()`.)
4. **Create the trigger instance (idempotent):**
   `composio.triggers.create(slug="SLACK_CHANNEL_MESSAGE_RECEIVED", user_id=USER_ID)` → `ti_*`.
   Some types need config (GitHub needs `owner`/`repo`; some Slack ones a channel id). Discover
   required config via `composio.triggers.get_type(slug)` **or** by reading the create error.
5. **Receiver:** read the **raw body** → verify signature → parse JSON → dispatch on
   `metadata.trigger_slug` (prefix match) → handle.
6. **Response action** (e.g. Slack send) — mind §3 gotchas.
7. **Loop guard** if the trigger can observe your own outputs (channel messages do).
8. **Test offline first** (`tools/test_slackbot.py` posts a synthetic event), then a real event.

## 2. Architectural decisions & tradeoffs

**D1 — Delivery transport.** *Webhook* (Composio POSTs to your public URL) vs *SDK `subscribe()`*
(long-lived local connection, no public URL).
- Webhook: production-standard, decoupled, Composio can retry while you redeploy; needs a public
  URL (tunnel in dev) + signature verification.
- subscribe(): zero tunnel, fastest local loop, no signature handling; but tied to process
  lifetime (miss events while down unless buffered), not for serverless.
- **Default: webhook for anything real; subscribe() for local iteration.**

**D2 — Dev tunnel.** cloudflared quick (no account, ephemeral) vs ngrok (account, ephemeral free)
vs cloudflared named (stable, needs CF account) vs none (subscribe).
- **Default: cloudflared quick** to start; named tunnel once you're tired of re-registering.

**D3 — Webhook URL stability.** Ephemeral quick-tunnel URL changes on every restart → you must
re-paste it into the Composio project webhook each time. Named tunnel / deployed host = stable.
- **Default: accept ephemeral in dev; stable host in prod.**

**D4 — Signature verification policy.** off / enforce-when-present / always-enforce.
- off: anyone who learns your public URL can POST fake events.
- always-enforce: most secure, but breaks local tools that POST unsigned (you'd have to sign them).
- enforce-when-present: verifies real (signed) Composio traffic, lets unsigned localhost tools through.
- **Default: enforce-when-present in dev, always-enforce in prod (and sign internal callers).**

**D5 — Verification implementation.** SDK `triggers.verify_webhook()` vs hand-rolled HMAC.
- SDK abstracts the scheme + payload-version detection; manual can drift (secret prefix, label).
- **Default: SDK if present; manual HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`,
  base64, as a fallback (try both raw and `whsec_`-stripped key).**

**D6 — Endpoint topology.** One endpoint + dispatch on `trigger_slug` vs a route per trigger.
- **Default: one endpoint, prefix dispatch.** Adding a source becomes a one-line handler entry.

**D7 — Trigger creation: programmatic vs dashboard; idempotency.** Re-running create can spawn
duplicate `ti_*` instances → duplicate deliveries.
- **Default: programmatic, but `list_active()` first and skip if the (slug,user_id) already exists.**

**D8 — Trigger granularity (Slack-style, noise vs coverage).** channel-message (fires on *every*
message — chatty, replies to all) vs DM-to-bot vs @mention vs thread-reply.
- **Default: a dedicated bot channel + channel-message** for a demo; **DM or @mention** for a bot
  living in busy shared channels.

**D9 — Loop prevention.** When a trigger can see the bot's own output (channel messages), naive
handling loops forever.
- Options: detect bot/app messages (`bot_id`/`app_id`/`subtype==bot_message`); dedup against a
  bounded set of recently-sent replies; match the bot's own user id; tag outbound text.
- **Default: combine the bot/app-id check with a recent-reply dedup** (belt + suspenders, because
  the inbound payload may not always carry a bot marker).

**D10 — Identity / `user_id`.** single constant (single-tenant internal tool) vs per-end-user
(multi-tenant SaaS where each customer connects their own account).
- **Default: one constant for internal tools.** Multi-tenant: derive `user_id` from your own user.

**D11 — Tool version handling (for the response action).** `dangerously_skip_version_check=True`
vs pinning `toolkit_versions={...}` vs `COMPOSIO_TOOLKIT_VERSION_<SLUG>` env.
- skip: convenient, but a new toolkit version can change behavior under you.
- pin: reproducible.
- **Default: skip in dev, pin in prod.**

**D12 — Idempotency / retries.** Deliveries can repeat. Dedup on a stable id (`webhook-id` header
or `log_id` in the payload) before side effects.
- **Default: keep a bounded seen-set of delivery ids; drop repeats.**

**D13 — Webhook-style vs polling-style trigger *types*.** This is about how Composio learns of the
event, **not** how you receive it. Provider-push (real-time webhook into Composio) vs Composio
polling the provider API every N minutes. **From your code it is identical** — same endpoint, same
`metadata.trigger_slug`, same handler. Differences that matter: latency (poll interval), possible
extra config (interval), and cold-start/backfill behavior on first enable (a polling trigger may
emit a burst or may not backfill history). Don't special-case delivery; do account for latency and
a possible first-enable burst.

**D14 — Payload version (V3 vs V1).** Shapes differ (`data` vs `payload`, field names). Pin/handle
the version you expect; the SDK verify path can normalize.
- **Default: target V3, read `metadata.trigger_slug` + `data`.**

**D15 — Concurrency / ordering.** Events can arrive concurrently and out of order. Handlers must be
order-independent and safe under parallel calls (our volume appends are lock-guarded).

## 3. Hard-won gotchas (exact error → fix)

- **`ToolVersionRequiredError: Toolkit version not specified … "latest" is not supported in manual
  execution`** → pass `dangerously_skip_version_check=True` to `tools.execute(...)`, or pin
  `toolkit_versions`. Hit when *sending the reply*, not when creating the trigger.
- **Slack send returns `successful: False … Unsupported Slack send message field(s). text: Use
  markdown_text`** → the argument is **`markdown_text`**, not `text`.
- **`Slack API error: channel_not_found`** → the bot/app must be a **member** of the target channel
  (`/invite @app`); prefer the **channel ID** (`C0…`) over `#name`; watch for typo'd channel names.
- **`Tool <SLUG> not found` (404)** → wrong slug. Discover real ones via `triggers.list(...)` /
  the tools API. Verified-good here: send action `SLACK_SEND_MESSAGE`; trigger
  `SLACK_CHANNEL_MESSAGE_RECEIVED`.
- **Infinite reply loop** → a channel trigger re-delivers the bot's own replies. Guard (D9).
- **Local test tools start getting 401 after you set the secret** → use enforce-when-present (D4),
  or sign your test requests.
- **Signature never matches** → you must HMAC the **raw request bytes**, computed **before** JSON
  parsing/re-serialization. Also handle the `whsec_` secret prefix and the `v1,<sig>` header format.
- **Ephemeral tunnel** → quick-tunnel URL changes on restart; the old project webhook URL goes dead.
  Re-register, or use a named tunnel.
- **"Connected but nothing works"** → almost always a `user_id` mismatch between where you connected
  and where you create the trigger / execute tools.

## 4. Verified code patterns

```python
# Discover slugs (never guess)
composio.triggers.list(toolkit_slugs=["slack"])          # → [... 'SLACK_CHANNEL_MESSAGE_RECEIVED', ...]
composio.triggers.list_enum()                            # all types (no kwargs)
composio.triggers.get_type("SLACK_CHANNEL_MESSAGE_RECEIVED")   # required config schema

# Create idempotently
active = {(getattr(t,'trigger_name',None), ...) for t in composio.triggers.list_active().items}
ti = composio.triggers.create(slug="SLACK_CHANNEL_MESSAGE_RECEIVED", user_id=USER_ID)  # → ti.trigger_id 'ti_*'

# Verify a webhook (manual fallback; prefer composio.triggers.verify_webhook(...))
signing = f"{headers['webhook-id']}.{headers['webhook-timestamp']}.{raw_body}"
key = secret[6:] if secret.startswith("whsec_") else secret
for k in (secret.encode(), base64.b64decode(key)):       # try both encodings
    expected = base64.b64encode(hmac.new(k, signing.encode(), hashlib.sha256).digest()).decode()
    if any(hmac.compare_digest(expected, s.split(',',1)[-1]) for s in headers['webhook-signature'].split()):
        ok = True

# Respond (Slack send) — markdown_text + version skip
composio.tools.execute("SLACK_SEND_MESSAGE", user_id=USER_ID,
                       arguments={"channel": channel_id, "markdown_text": text},
                       dangerously_skip_version_check=True)

# Receiver skeleton (see app/webhooks.py)
raw = await request.body()                                # raw bytes FIRST
if not signature_ok(request.headers, raw.decode()): raise HTTPException(401)
payload = json.loads(raw)
slug = payload["metadata"]["trigger_slug"]                # dispatch on this

# Local dev without a tunnel
composio.triggers.subscribe()  # long-lived listener; register handlers, no public URL needed
```

## 5. Pending questions (resolve these to make it bulletproof)

1. **Inbound payload shape for `SLACK_CHANNEL_MESSAGE_RECEIVED`** — exact field names/nesting for
   `channel` / `text` / `user` and the bot-message marker were never confirmed against a live event;
   our `_extract` in `app/slackbot.py` is deliberately defensive (checks `event.*` and `data.*`,
   `channel`/`channel_id`, `bot_id`/`app_id`). Confirm with one real delivery and tighten.
2. **`SLACK_*` vs `SLACKBOT_*` trigger family** — which matches an OAuth *bot* connection vs user
   token? We used `SLACK_CHANNEL_MESSAGE_RECEIVED` and it created fine, but didn't confirm a live
   event end-to-end. Also confirm the DM (`SLACK_DIRECT_MESSAGE_RECEIVED`) and any @mention slug for
   a quieter UX.
3. **SDK `verify_webhook()` exact signature** — prefer it over hand-rolled HMAC; confirm args
   (headers vs individual fields, return shape) and whether it normalizes payload versions.
4. **Retry / idempotency semantics** — does Composio retry failed deliveries, with what backoff, and
   what stable id should we dedup on (`webhook-id` header? `log_id`?).
5. **Was the project webhook URL actually registered**, or should this app prefer `subscribe()` to
   avoid the tunnel entirely? Decide the canonical dev path.
6. **Toolkit version pinning syntax for prod** — `toolkit_versions={'slack': '<v>'}` on the client
   vs `COMPOSIO_TOOLKIT_VERSION_SLACK=<v>` env; and where to find the current version.
7. **Polling-trigger first-enable behavior** — does a polling trigger backfill recent history or only
   emit changes after creation? Affects whether you get a startup burst.
8. **Channel id vs name for replies** — we hit `channel_not_found` with a name; confirm whether a
   channel **ID** is required for reliable sends and store IDs, not names.


