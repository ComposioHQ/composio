# Triggers

The Triggers API allows you to manage and subscribe to real-time events from your connected accounts. This guide explains how to work with triggers using the Composio SDK.

## Overview

Triggers are real-time events that occur in your connected accounts. The SDK provides methods to:

- List active triggers
- Create new trigger instances
- Update existing triggers
- Enable/disable triggers
- Subscribe to real-time trigger events
- Manage trigger types

## Methods

### List Active Triggers

Fetch a list of all active triggers with optional filtering:

```typescript
const triggers = await composio.triggers.listActive({
  authConfigIds: ['auth-config-id'],
  connectedAccountIds: ['connected-account-id'],
  limit: 10,
  page: 1,
  showDisabled: false,
  triggerIds: ['trigger-id'],
  triggerNames: ['trigger-name'],
});
```

### Create Trigger Instance

Create a new trigger instance for a specific user and trigger type. If a connected account ID is not provided, the SDK will automatically use the first available connected account for the user and toolkit.

**With Connected Account ID:**

```typescript
const trigger = await composio.triggers.create('default', 'GMAIL_NEW_GMAIL_MESSAGE', {
  connectedAccountId: 'ca_jjYIG9L40LDIS', // Specify which connected account to use
  triggerConfig: {
    labelIds: 'INBOX',
    userId: 'me',
    interval: 60,
  },
});
```

**Without Connected Account ID (Using First Available):**

```typescript
const trigger = await composio.triggers.create('default', 'GMAIL_NEW_GMAIL_MESSAGE', {
  triggerConfig: {
    labelIds: 'INBOX',
    userId: 'me',
    interval: 60,
  },
}); // Will use the first available connected account
```

> **Note:** It's recommended to provide a `connectedAccountId` when you have multiple connected accounts for the same toolkit to ensure the trigger is created for the intended account. If not provided, the SDK will use the first available connected account and log a warning.

**Parameters:**

- `userId` (string, required): The ID of the user to create the trigger instance for
- `slug` (string, required): The slug of the trigger type to create
- `body` (TriggerInstanceUpsertParams, optional): Configuration for the trigger instance
  - `connectedAccountId` (string, optional): ID of the connected account to use. If not provided, will use the first available connected account for the user and toolkit
  - `triggerConfig` (object, optional): Trigger-specific configuration parameters

**Returns:** Promise<TriggerInstanceUpsertResponse> - The created trigger instance with the following structure:

```typescript
{
  triggerId: string; // The ID of the created trigger instance
}
```

**Throws:**

- `ValidationError`: If the provided parameters are invalid
- `ComposioTriggerTypeNotFoundError`: If the trigger type with the given slug is not found
- `ComposioConnectedAccountNotFoundError`: If no connected account is found for the user, or if the specified connected account ID is not found

**Example with Error Handling:**

```typescript
try {
  const trigger = await composio.triggers.create('default', 'GMAIL_NEW_GMAIL_MESSAGE', {
    // Connected account ID is optional - if not provided, will use first available
    connectedAccountId: 'ca_jjYIG9L40LDIS',
    triggerConfig: {
      labelIds: 'INBOX',
      userId: 'me',
      interval: 60,
    },
  });
  console.log('Trigger created:', trigger.triggerId);
} catch (error) {
  if (error instanceof ComposioTriggerTypeNotFoundError) {
    console.error('Trigger type not found:', error.message);
    // Handle invalid trigger type
  } else if (error instanceof ComposioConnectedAccountNotFoundError) {
    console.error('Connected account issue:', error.message);
    // Handle missing or invalid connected account
    // This can happen if:
    // 1. No connected accounts exist for the user and toolkit
    // 2. The specified connectedAccountId was not found
  } else if (error instanceof ValidationError) {
    console.error('Invalid parameters:', error.message);
    // Handle validation errors
  } else {
    console.error('Unexpected error:', error);
    // Handle other errors
  }
}
```

### Update Trigger Instance

Update an existing trigger instance:

```typescript
const updatedTrigger = await composio.triggers.update('trigger-id', {
  // Updated configuration
});
```

### Enable/Disable Triggers

Control trigger activation state:

```typescript
// Disable a trigger
await composio.triggers.disable('trigger-id');

// Enable a trigger
await composio.triggers.enable('trigger-id');
```

### Real-time Trigger Subscription

Subscribe to real-time trigger events with optional filtering:

```typescript
composio.triggers.subscribe(
  triggerData => {
    console.log('Received trigger:', triggerData);
  },
  {
    toolkits: ['toolkit-name'],
    triggerId: 'specific-trigger-id',
    connectedAccountId: 'connected-account-id',
    triggerSlug: ['trigger-type'],
    triggerData: 'custom-data',
    userId: 'user-id',
  }
);
```

#### Trigger Payload Format

When you receive a trigger event, the payload will have the following structure:

```typescript
interface IncomingTriggerPayload {
  id: string; // Unique trigger instance ID
  triggerSlug: string; // Type of trigger
  toolkitSlug: string; // Associated toolkit
  userId: string; // User ID associated with the trigger
  payload: unknown; // Processed trigger payload
  originalPayload: unknown; // Raw trigger payload
  metadata: {
    id: string;
    triggerConfig: unknown; // Trigger configuration
    triggerSlug: string;
    toolkitSlug: string;
    triggerData: string;
    connectedAccount: {
      id: string; // Connected account nano ID
      uuid: string; // Connected account UUID
      authConfigId: string; // Auth config nano ID
      authConfigUUID: string; // Auth config UUID
      userId: string; // User ID
      status: string; // Connection status
    };
  };
}
```

### Unsubscribe from Triggers

Stop receiving trigger events:

```typescript
await composio.triggers.unsubscribe();
```

### Manage Trigger Types

List and retrieve available trigger types:

```typescript
// List all trigger types
const triggerTypes = await composio.triggers.listTypes();

// Get details of a specific trigger type
const triggerType = await composio.triggers.getType('trigger-slug');

// Get enum of all available triggers
const triggerEnum = await composio.triggers.listEnum();
```
