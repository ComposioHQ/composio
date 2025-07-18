# Composio Class

The `Composio` class is the main entry point to the Composio SDK. It initializes the SDK and provides access to all the core functionality.

## Initialization

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: 'your-api-key',
  baseURL: 'https://api.composio.dev', // Optional: Custom API endpoint
  allowTracking: true, // Optional: Enable/disable telemetry
  autoUploadDownloadFiles: true, // Optional: Enable/disable automatic file handling
  provider: new OpenAIProvider(), // Optional: Custom provider
});
```

## Configuration Options

The `Composio` constructor accepts a configuration object with the following properties:

| Property                 | Type                     | Required | Default                    | Description                                    |
| ----------------------- | ------------------------ | -------- | -------------------------- | ---------------------------------------------- |
| `apiKey`                | string                   | Yes      | -                          | Your Composio API key                          |
| `baseURL`               | string                   | No       | `https://api.composio.dev` | The base URL for the Composio API              |
| `allowTracking`         | boolean                  | No       | `true`                     | Whether to allow analytics/tracking            |
| `autoUploadDownloadFiles`| boolean                 | No       | `true`                     | Whether to automatically handle file operations |
| `provider`              | `BaseComposioProvider`   | No       | `new OpenAIProvider()`     | The provider to use for this Composio instance |

## Properties

The `Composio` class provides access to the following core models:

| Property            | Type                   | Description                                |
| ------------------- | ---------------------- | ------------------------------------------ |
| `tools`             | `Tools`                | Access to tools functionality              |
| `toolkits`          | `Toolkits`             | Access to toolkits functionality           |
| `triggers`          | `Triggers`             | Access to triggers functionality           |
| `authConfigs`       | `AuthConfigs`          | Access to auth configs functionality       |
| `connectedAccounts` | `ConnectedAccounts`    | Access to connected accounts functionality |
| `files`             | `Files`                | Access to file upload/download functionality|
| `provider`          | `BaseComposioProvider` | The provider being used                    |


## Methods

### getClient()

Returns the internal Composio API client.

```typescript
const client = composio.getClient();
```

**Returns:** `ComposioClient`

**Throws:** Error if the client is not initialized

## Examples

### Basic Initialization

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});
```

### Custom Provider

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

const openaiProvider = new OpenAIProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: openaiProvider,
});
```

### Disable Tracking

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  allowTracking: false,
});
```

### Disable Automatic File Handling

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  autoUploadDownloadFiles: false,
});
```
