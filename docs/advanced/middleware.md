# Middleware and Modifiers

Composio SDK provides powerful middleware capabilities through modifiers that allow you to customize and extend the behavior of tools. This guide explains how to use modifiers to transform tool schemas, modify inputs before execution, and transform outputs after execution.

## What are Modifiers?

Modifiers are functions that intercept and modify the normal flow of tool operations. Composio supports three types of modifiers:

1. **Schema Modifiers**: Transform a tool's schema before it's wrapped for the provider
2. **Before Execution Modifiers**: Modify inputs before a tool is executed
3. **After Execution Modifiers**: Transform outputs after a tool has executed

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
    modifyToolSchema: (toolSlug, toolkitSlug, tool) => {
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
    beforeToolExecute: (toolSlug, toolkitSlug, params) => {
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
    afterToolExecute: (toolSlug, toolkitSlug, result) => {
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

You can use all three types of modifiers together:

```typescript
const tools = await composio.tools.get(
  'default',
  {
    toolkits: ['github'],
  },
  {
    // Schema modifier
    modifyToolSchema: (toolSlug, toolkitSlug, tool) => {
      // Enhance tool schema
      return tool;
    },

    // Before execution modifier
    beforeToolExecute: (toolSlug, toolkitSlug, params) => {
      // Modify execution parameters
      return params;
    },

    // After execution modifier
    afterToolExecute: (toolSlug, toolkitSlug, result) => {
      // Transform execution results
      return result;
    },
  }
);
```

## Creating Reusable Modifiers

For better code organization, you can create reusable modifier functions:

```typescript
// Define reusable modifiers
const addTimestamps = (toolSlug, toolkitSlug, result) => {
  if (result.successful) {
    result.data.executedAt = new Date().toISOString();
  }
  return result;
};

const logExecutions = (toolSlug, toolkitSlug, params) => {
  console.log(`Executing ${toolSlug} from ${toolkitSlug} at ${new Date().toISOString()}`);
  return params;
};

const sanitizeInputs = (toolSlug, toolkitSlug, params) => {
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
    beforeToolExecute: sanitizeInputs,
    afterToolExecute: addTimestamps,
  }
);
```

## Practical Use Cases

### Caching Tool Results

```typescript
// Simple in-memory cache
const cache = new Map();

const cacheModifier = (toolSlug, toolkitSlug, params) => {
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

const cacheAfterModifier = (toolSlug, toolkitSlug, result) => {
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
      beforeToolExecute: cacheModifier,
      afterToolExecute: cacheAfterModifier,
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
const authModifier = (toolSlug, toolkitSlug, params) => {
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
    beforeToolExecute: authModifier,
  }
);
```

### Data Transformation Pipeline

```typescript
// Create a pipeline of modifiers
const pipeModifiers = (...modifiers) => {
  return (toolSlug, toolkitSlug, result) => {
    return modifiers.reduce((modifiedResult, modifier) => {
      return modifier(toolSlug, toolkitSlug, modifiedResult);
    }, result);
  };
};

// Individual transformation steps
const addMetadata = (toolSlug, toolkitSlug, result) => {
  if (result.successful) {
    result.data.metadata = { source: toolkitSlug, tool: toolSlug };
  }
  return result;
};

const formatDates = (toolSlug, toolkitSlug, result) => {
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

const removeNulls = (toolSlug, toolkitSlug, result) => {
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
    afterToolExecute: pipeModifiers(addMetadata, formatDates, removeNulls),
  }
);
```

## Type Definitions

```typescript
// Schema Modifier
type TransformToolSchemaModifier = (toolSlug: string, toolkitSlug: string, tool: Tool) => Tool;

// Before Execution Modifier
type BeforeToolExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  params: ToolExecuteParams
) => ToolExecuteParams;

// After Execution Modifier
type AfterToolExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  result: ToolExecuteResponse
) => ToolExecuteResponse;

// Modifiers Object
interface ExecuteToolModifiers {
  beforeToolExecute?: BeforeToolExecuteModifier;
  afterToolExecute?: AfterToolExecuteModifier;
}

// Provider Options (includes schema modifier)
interface ProviderOptions<TProvider> {
  modifyToolSchema?: TransformToolSchemaModifier;
  beforeToolExecute?: BeforeToolExecuteModifier;
  afterToolExecute?: AfterToolExecuteModifier;
}
```
