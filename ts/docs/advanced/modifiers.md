# Modifiers

Composio SDK provides powerful middleware capabilities through modifiers that allow you to customize and extend the behavior of tools. This guide explains how to use modifiers to transform tool schemas, modify inputs before execution, and transform outputs after execution.

> **Important:** Not all modifiers are supported by all provider types. Schema modifiers work with all providers, but execution modifiers (beforeExecute and afterExecute) are only supported by agentic providers. See the [Provider-Specific Modifier Support](#provider-specific-modifier-support) section for details.

## What are Modifiers?

Modifiers are functions that intercept and modify the normal flow of tool operations. Composio supports three types of modifiers:

1. **Schema Modifiers**: Transform a tool's schema before it's wrapped for the provider (supported by all providers)
2. **Before Execution Modifiers**: Modify inputs before a tool is executed (supported by agentic providers only)
3. **After Execution Modifiers**: Transform outputs after a tool has executed (supported by agentic providers only)

### Schema Modifiers

Schema modifiers allow you to transform a tool's schema before it's wrapped for the provider. This is useful for customizing tool descriptions, parameter definitions, or adding metadata.

```typescript
// Modify tool schema when getting tools
const tools = await composio.tools.get(
  'default',
  {
    toolkits: ['github'],
  },
  {
    modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
      // Add a prefix to all tool descriptions
      if (tool.description) {
        tool.description = `[Enhanced] ${tool.description}`;
      }

      // Modify parameters for a specific tool
      if (toolSlug === 'GITHUB_GET_REPO') {
        if (tool.inputParameters?.properties?.owner) {
          // Add more detailed description
          tool.inputParameters.properties.owner.description =
            'GitHub organization or user name (e.g., "composio")';
        }
      }

      return tool;
    },
  }
);
```

### Before Execution Modifiers

Before execution modifiers allow you to modify the input parameters before a tool is executed. This is useful for parameter validation, transformation, or adding default values.

```typescript
// Modify parameters before execution
const result = await composio.tools.execute(
  'GITHUB_GET_REPO',
  {
    userId: 'default',
    arguments: {
      owner: 'composio',
      repo: 'sdk',
    },
  },
  {
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
      // Convert owner names to lowercase
      if (params.arguments.owner) {
        params.arguments.owner = params.arguments.owner.toLowerCase();
      }

      // Add a default branch parameter
      if (toolSlug === 'GITHUB_GET_REPO' && !params.arguments.branch) {
        params.arguments.branch = 'main';
      }

      // Add tracing for debugging
      console.log(`Executing ${toolSlug} from ${toolkitSlug} toolkit`);

      return params;
    },
  }
);
```

### After Execution Modifiers

After execution modifiers allow you to transform the output after a tool has executed. This is useful for data formatting, filtering, or enrichment.

```typescript
// Modify results after execution
const result = await composio.tools.execute(
  'GITHUB_GET_REPO',
  {
    userId: 'default',
    arguments: {
      owner: 'composio',
      repo: 'sdk',
    },
  },
  {
    afterExecute: ({ toolSlug, toolkitSlug, result }) => {
      // Only when execution was successful
      if (result.successful) {
        // Filter out sensitive data
        if (result.data.token) {
          delete result.data.token;
        }

        // Add a timestamp
        result.data.fetchedAt = new Date().toISOString();

        // Transform data formats
        if (result.data.created_at) {
          result.data.createdAt = new Date(result.data.created_at).toLocaleString();
          delete result.data.created_at;
        }
      }

      return result;
    },
  }
);
```

### Using Multiple Modifiers

You can use multiple modifiers together, but remember that execution modifiers (beforeExecute and afterExecute) only work with agentic providers:

```typescript
// With an agentic provider (e.g., Vercel, Langchain)
const agenticProvider = new VercelProvider();
const composio = new Composio({
  apiKey: 'your-api-key',
  provider: agenticProvider,
});

// All modifiers work with agentic providers
const tools = await composio.tools.get(
  'default',
  {
    toolkits: ['github'],
  },
  {
    // Schema modifier
    modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
      // Enhance tool schema
      return schema;
    },

    // Before execution modifier (only works with agentic providers)
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
      // Modify execution parameters
      return params;
    },

    // After execution modifier (only works with agentic providers)
    afterExecute: ({ toolSlug, toolkitSlug, result }) => {
      // Transform execution results
      return result;
    },
  }
);

// With a non-agentic provider (e.g., OpenAI)
const nonAgenticProvider = new OpenAIProvider();
const composioNonAgentic = new Composio({
  apiKey: 'your-api-key',
  provider: nonAgenticProvider,
});

// Only schema modifiers work with non-agentic providers
const openaiTools = await composioNonAgentic.tools.get(
  'default',
  {
    toolkits: ['github'],
  },
  {
    // Schema modifier (works with all providers)
    modifySchema: (toolSlug, toolkitSlug, tool) => {
      // Enhance tool schema
      return tool;
    },

    // These will be ignored by non-agentic providers
    beforeExecute: () => {}, // No effect with non-agentic providers
    afterExecute: () => {}, // No effect with non-agentic providers
  }
);
```

## Creating Reusable Modifiers

For better code organization, you can create reusable modifier functions:

```typescript
// Define reusable modifiers
const addTimestamps = ({ toolSlug, toolkitSlug, result }) => {
  if (result.successful) {
    result.data.executedAt = new Date().toISOString();
  }
  return result;
};

const logExecutions = ({ toolSlug, toolkitSlug, params }) => {
  console.log(`Executing ${toolSlug} from ${toolkitSlug} at ${new Date().toISOString()}`);
  return params;
};

const sanitizeInputs = ({ toolSlug, toolkitSlug, params }) => {
  // Sanitize input parameters to prevent injection attacks
  if (params.arguments) {
    Object.keys(params.arguments).forEach(key => {
      if (typeof params.arguments[key] === 'string') {
        params.arguments[key] = sanitizeString(params.arguments[key]);
      }
    });
  }
  return params;
};

// Use the reusable modifiers
const result = await composio.tools.execute(
  'GITHUB_GET_REPO',
  {
    userId: 'default',
    arguments: {
      owner: 'composio',
      repo: 'sdk',
    },
  },
  {
    beforeExecute: sanitizeInputs,
    afterExecute: addTimestamps,
  }
);
```

## Practical Use Cases

### Comparing Agentic and Non-Agentic Provider Usage

Here's a side-by-side comparison of how to use modifiers with different provider types:

```typescript
// Example from examples/modifiers/src/index.ts

// Non-agentic provider example (OpenAI)
const openai = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

// Schema modifiers work with non-agentic providers
const nonAgenticTools = await openai.tools.get('default', 'HACKERNEWS_GET_USER', {
  // Schema modifier works with all providers
  modifySchema: (toolSlug, toolkitSlug, tool) => {
    // Customize the input parameters
    if (tool.inputParameters?.properties?.userId) {
      tool.inputParameters.properties.userId.description = 'HackerNews username (e.g., "pg")';
    }
    return tool;
  },
});

// Agentic provider example (Vercel)
const vercel = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// All modifiers work with agentic providers
const agenticTools = await vercel.tools.get('default', 'HACKERNEWS_GET_USER', {
  // Schema modifier
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    if (tool.inputParameters?.properties?.userId) {
      tool.inputParameters.properties.userId.description = 'HackerNews username (e.g., "pg")';
    }
    return schema;
  },
  // Execution modifiers (only work with agentic providers)
  beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
    console.log(`Executing ${toolSlug} from ${toolkitSlug}`);
    return params;
  },
  afterExecute: ({ toolSlug, toolkitSlug, result }) => {
    if (result.successful) {
      result.data.processedAt = new Date().toISOString();
    }
    return result;
  },
});
```

### Manual Execution Modifiers with Non-Agentic Providers

For non-agentic providers, you can use the provider's helper methods to apply execution modifiers:

```typescript
// Get the OpenAI provider instance
const openaiProvider = composio.provider as OpenAIProvider;

// When handling a tool call from OpenAI
const toolOutputs = await openaiProvider.handleToolCalls(
  'default', // userId
  completion, // OpenAI completion object
  { connectedAccountId: 'account_123' }, // Options
  {
    // Manually apply execution modifiers
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
      console.log(`Executing ${toolSlug}`);
      return params;
    },
    afterExecute: ({ toolSlug, toolkitSlug, result }) => {
      result.data.processedAt = new Date().toISOString();
      return result;
    },
  }
);
```

### Caching Tool Results (Agentic Providers Only)

> Note: This example uses execution modifiers and will only work with agentic providers.

```typescript
// Simple in-memory cache
const cache = new Map();

const cacheModifier = ({ toolSlug, toolkitSlug, params }) => {
  // Create a cache key based on tool slug and arguments
  const cacheKey = `${toolSlug}-${JSON.stringify(params.arguments)}`;

  // Add cache key to params for the after modifier to use
  params.__cacheKey = cacheKey;

  // Check if we have a cached result
  if (cache.has(cacheKey)) {
    const cachedResult = cache.get(cacheKey);
    if (Date.now() - cachedResult.timestamp < 60000) {
      // 1 minute cache
      // Throw a special error to short-circuit execution
      throw { __cached: true, result: cachedResult.result };
    }
  }

  return params;
};

const cacheAfterModifier = ({ toolSlug, toolkitSlug, result }) => {
  if (result.successful && result.__cacheKey) {
    // Store in cache
    cache.set(result.__cacheKey, {
      result,
      timestamp: Date.now(),
    });

    // Remove the cache key from the result
    delete result.__cacheKey;
  }

  return result;
};

// Use with try/catch to handle the cache hit
try {
  const result = await composio.tools.execute(
    'GITHUB_GET_REPO',
    {
      userId: 'default',
      arguments: {
        owner: 'composio',
        repo: 'sdk',
      },
    },
    {
      beforeExecute: cacheModifier,
      afterExecute: cacheAfterModifier,
    }
  );

  console.log('Fresh result:', result);
} catch (error) {
  if (error.__cached) {
    console.log('Cached result:', error.result);
  } else {
    throw error; // Re-throw if it's a real error
  }
}
```

### Adding Authentication Headers

```typescript
const authModifier = ({ toolSlug, toolkitSlug, params }) => {
  // Add authentication parameters for specific toolkits
  if (toolkitSlug === 'custom-api') {
    if (!params.customAuthParams) {
      params.customAuthParams = {};
    }

    if (!params.customAuthParams.parameters) {
      params.customAuthParams.parameters = [];
    }

    // Add an API key to the headers
    params.customAuthParams.parameters.push({
      in: 'header',
      name: 'X-API-Key',
      value: process.env.CUSTOM_API_KEY,
    });
  }

  return params;
};

// Apply the auth modifier to all tools from a specific toolkit
const tools = await composio.tools.get(
  'default',
  {
    toolkits: ['custom-api'],
  },
  {
    beforeExecute: authModifier,
  }
);
```

### Data Transformation Pipeline

```typescript
// Create a pipeline of modifiers
const pipeModifiers = (...modifiers) => {
  return ({ toolSlug, toolkitSlug, result }) => {
    return modifiers.reduce((modifiedResult, modifier) => {
      return modifier({ toolSlug, toolkitSlug, result: modifiedResult });
    }, result);
  };
};

// Individual transformation steps
const addMetadata = ({ toolSlug, toolkitSlug, result }) => {
  if (result.successful) {
    result.data.metadata = { source: toolkitSlug, tool: toolSlug };
  }
  return result;
};

const formatDates = ({ toolSlug, toolkitSlug, result }) => {
  if (result.successful) {
    // Convert all dates to a consistent format
    Object.keys(result.data).forEach(key => {
      if (key.includes('date') || key.includes('time') || key.endsWith('At')) {
        if (result.data[key]) {
          result.data[key] = new Date(result.data[key]).toLocaleString();
        }
      }
    });
  }
  return result;
};

const removeNulls = ({ toolSlug, toolkitSlug, result }) => {
  if (result.successful) {
    // Remove null and undefined values
    Object.keys(result.data).forEach(key => {
      if (result.data[key] === null || result.data[key] === undefined) {
        delete result.data[key];
      }
    });
  }
  return result;
};

// Apply the pipeline
const result = await composio.tools.execute(
  'GITHUB_GET_REPO',
  {
    userId: 'default',
    arguments: {
      owner: 'composio',
      repo: 'sdk',
    },
  },
  {
    afterExecute: pipeModifiers(addMetadata, formatDates, removeNulls),
  }
);
```

## Provider-Specific Modifier Support

Composio SDK supports two types of providers:

1. **Agentic Providers**: Providers that have control over tool execution (e.g., Vercel, Langchain)
2. **Non-Agentic Providers**: Providers that only format tools but don't control execution (e.g., OpenAI)

### Technical Differences

The key technical distinction between these provider types affects which modifiers they support:

- **Agentic Providers** receive an `ExecuteToolFn` parameter in their `wrapTool`/`wrapTools` methods, allowing them to embed execution modifiers directly into the wrapped tools. This means they support all three types of modifiers: schema, beforeExecute, and afterExecute.

- **Non-Agentic Providers** only format tools for external consumption and don't control execution. When tools are wrapped by non-agentic providers, the context is lost, making it impossible to automatically apply execution modifiers. These providers only support schema modifiers.

Here's how the provider implementations differ:

```typescript
// Non-Agentic Provider (e.g., OpenAI)
class OpenAIProvider extends BaseNonAgenticProvider<OpenAiToolCollection, OpenAiTool> {
  // No executeToolFn parameter
  override wrapTool(tool: Tool): OpenAiTool {
    // Simply formats the tool for OpenAI
    return {
      type: 'function',
      function: {
        name: tool.slug,
        description: tool.description,
        parameters: tool.inputParameters,
      },
    };
  }
}

// Agentic Provider (e.g., Vercel)
class VercelProvider extends BaseAgenticProvider<VercelToolCollection, VercelTool> {
  // Receives executeToolFn parameter
  wrapTool(tool: Tool, executeTool: ExecuteToolFn): VercelTool {
    return tool({
      description: tool.description,
      parameters: jsonSchema(tool.inputParameters ?? {}),
      execute: async params => {
        // Can apply modifiers through executeTool
        return await executeTool(tool.slug, params);
      },
    });
  }
}
```

### Using Modifiers with Non-Agentic Providers

For non-agentic providers like OpenAI, you can still apply execution modifiers manually using the provider's helper methods:

```typescript
// Get OpenAI provider instance
const openaiProvider = composio.provider as OpenAIProvider;

// Execute a tool call with modifiers
const result = await openaiProvider.executeToolCall(
  'default', // userId
  toolCall, // OpenAI tool call object
  { connectedAccountId: 'account_123' }, // Options
  {
    // Manually apply execution modifiers
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
      console.log(`Executing ${toolSlug}`);
      return params;
    },
    afterExecute: ({ toolSlug, toolkitSlug, result }) => {
      result.data.processedAt = new Date().toISOString();
      return result;
    },
  }
);
```

## Tool Router Modifiers (v0.4.0+)

Tool Router sessions support enhanced modifier types that include session context. This is useful for tracking and managing tool execution across different user sessions.

### Using Session Modifiers with Tool Router

```typescript
import { Composio } from '@composio/core';
import { SessionExecuteMetaModifiers } from '@composio/core';

const composio = new Composio();

const session = await composio.create('user_123', {
  toolkits: ['gmail', 'slack'],
});

// Use session-specific modifiers
const tools = await session.tools({
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    // Customize tool schemas
    console.log(`Modifying schema for ${toolSlug} from ${toolkitSlug}`);
    return schema;
  },
  beforeExecute: ({ toolSlug, toolkitSlug, sessionId, params }) => {
    // Access session ID for tracking
    console.log(`[Session: ${sessionId}] Executing ${toolSlug} from ${toolkitSlug}`);
    
    // Add session-specific metadata
    params.sessionMetadata = {
      sessionId,
      timestamp: new Date().toISOString(),
    };
    
    return params;
  },
  afterExecute: ({ toolSlug, toolkitSlug, sessionId, result }) => {
    // Transform results with session context
    console.log(`[Session: ${sessionId}] Completed ${toolSlug}`);
    
    if (result.successful) {
      result.data.sessionId = sessionId;
      result.data.executedAt = new Date().toISOString();
    }
    
    return result;
  },
});
```

### Session-Specific Modifier Benefits

The session-specific modifiers provide several advantages:

1. **Session Tracking**: Access to `sessionId` allows you to track which session executed which tools
2. **User Context**: Associate tool executions with specific users through session IDs
3. **Audit Logging**: Log tool executions with session context for compliance and debugging
4. **Performance Monitoring**: Track tool execution performance per session

### Getting Meta Tools Directly

You can also fetch tool router meta tools directly using the new method:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

// Get raw meta tools for a session
const metaTools = await composio.tools.getRawToolRouterMetaTools('session_123', {
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    // Customize meta tool schemas
    if (toolSlug === 'composio_authorize_toolkit') {
      schema.description = 'Custom description for authorization';
    }
    return schema;
  }
});

// Use the meta tools with your AI framework
console.log('Available meta tools:', metaTools.map(t => t.name));
```

## Type Definitions

```typescript
// Schema Modifier (supported by all providers)
type TransformToolSchemaModifier = (toolSlug: string, toolkitSlug: string, tool: Tool) => Tool;

// Before Execution Modifier (supported by agentic providers only)
type beforeExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  params: ToolExecuteParams
) => ToolExecuteParams;

// After Execution Modifier (supported by agentic providers only)
type afterExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  result: ToolExecuteResponse
) => ToolExecuteResponse;

// Modifiers Object
interface ExecuteToolModifiers {
  beforeExecute?: beforeExecuteModifier;
  afterExecute?: afterExecuteModifier;
}

// Provider Options
interface ProviderOptions<TProvider> {
  modifySchema?: TransformToolSchemaModifier;
  beforeExecute?: beforeExecuteModifier; // Only applied by agentic providers
  afterExecute?: afterExecuteModifier; // Only applied by agentic providers
}

// Session-Specific Modifiers (v0.4.0+)
interface SessionExecuteMetaModifiers {
  modifySchema?: (context: {
    toolSlug: string;
    toolkitSlug: string;
    schema: any;
  }) => any;
  
  beforeExecute?: (context: {
    toolSlug: string;
    toolkitSlug: string;
    sessionId: string;
    params: any;
  }) => any;
  
  afterExecute?: (context: {
    toolSlug: string;
    toolkitSlug: string;
    sessionId: string;
    result: any;
  }) => any;
}

// Session Meta Tool Options (v0.4.0+)
interface SessionMetaToolOptions {
  modifySchema?: (context: {
    toolSlug: string;
    toolkitSlug: string;
    schema: any;
  }) => any;
}
```
