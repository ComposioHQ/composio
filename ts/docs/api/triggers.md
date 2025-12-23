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

Create a new trigger instance for a specific user and trigger type. The trigger instance version is determined by the global `toolkitVersions` configuration set during Composio initialization (defaults to `'latest'`). If a connected account ID is not provided, the SDK will automatically use the first available connected account for the user and toolkit.

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

**Behavior:**

- The method uses the global toolkit version configured in the Composio client (defaults to `'latest'`)
- To use a specific toolkit version for trigger creation, configure `toolkitVersions` when initializing the Composio instance
- See [Toolkit Versions Configuration](../getting-started.md#toolkit-versions) for details on setting toolkit versions

**Throws:**

- `ValidationError`: If the provided parameters are invalid
- `ComposioTriggerTypeNotFoundError`: If the trigger type with the given slug is not found
- `ComposioConnectedAccountNotFoundError`: If no connected account is found for the user, or if the specified connected account ID is not found

**Example with Specific Toolkit Version:**

```typescript
// Configure toolkit versions at initialization
const composio = new Composio({
  apiKey: 'your-api-key',
  toolkitVersions: {
    gmail: '12082025_00',
    github: '10082025_01'
  }
});

// Now create will use the configured version for Gmail
const trigger = await composio.triggers.create('default', 'GMAIL_NEW_GMAIL_MESSAGE', {
  connectedAccountId: 'ca_jjYIG9L40LDIS',
  triggerConfig: {
    labelIds: 'INBOX',
    userId: 'me',
    interval: 60,
  },
});
// This will create the trigger instance using version '12082025_00' for Gmail
```

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

#### List Trigger Types

List all available trigger types with optional filtering:

```typescript
const triggerTypes = await composio.triggers.listTypes({
  toolkits: ['github'],
  cursor: 'cursor-string',
  limit: 10
});
```

**Parameters:**

- `toolkits` (string[], optional): Filter trigger types by toolkit slugs
- `cursor` (string, optional): Pagination cursor for fetching the next page
- `limit` (number, optional): Maximum number of trigger types to return

**Returns:** Promise<TriggersTypeListResponse> - A paginated list of trigger types

#### Get Trigger Type

Retrieve details of a specific trigger type by its slug. The trigger type version is determined by the global `toolkitVersions` configuration set during Composio initialization.

```typescript
// Get trigger type using the globally configured toolkit version
const triggerType = await composio.triggers.getType('GMAIL_NEW_GMAIL_MESSAGE');
```

**Parameters:**

- `slug` (string, required): The slug of the trigger type to retrieve

**Returns:** Promise<TriggersTypeRetrieveResponse> - The trigger type object containing details such as:

```typescript
{
  slug: string;
  name: string;
  description: string;
  toolkit: {
    slug: string;
    name: string;
  };
  // ... other trigger type properties
}
```

**Behavior:**

- The method uses the global toolkit version configured in the Composio client (defaults to `'latest'` if not provided)
- To use a specific toolkit version, configure `toolkitVersions` when initializing the Composio instance
- See [Toolkit Versions Configuration](../getting-started.md#toolkit-versions) for details on setting toolkit versions

**Example with Specific Toolkit Version:**

```typescript
// Configure toolkit versions at initialization
const composio = new Composio({
  apiKey: 'your-api-key',
  toolkitVersions: {
    gmail: '12082025_00',
    github: '10082025_01'
  }
});

// Now getType will use the configured version for Gmail
const triggerType = await composio.triggers.getType('GMAIL_NEW_GMAIL_MESSAGE');
// This will fetch the trigger type using version '12082025_00' for Gmail
```

#### Get Trigger Enums

Fetch the list of all available trigger enums:

```typescript
const triggerEnum = await composio.triggers.listEnum();
```

This method returns an enumeration of all available trigger types and is primarily used by the CLI.
