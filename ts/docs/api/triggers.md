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

Create a new trigger instance for a specific trigger type:

```typescript
const trigger = await composio.triggers.create('trigger-slug', {
  connectedAccountId: 'connected-account-id',
  triggerConfig: {
    // Trigger specific configuration
  },
});
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
