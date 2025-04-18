# @composio/core

The core Composio SDK which allows users to interact with the Composio Platform.

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions. Includes support for different trigger types and status management.
- **AuthConfigs**: Configure authentication providers and settings. Manage auth configs with features to create, update, enable/disable, and delete configurations.
- **ConnectedAccounts**: Manage third-party service connections. Includes functionality to create, list, refresh, and manage the status of connected accounts.
- **ActionExecution**: Track and manage the execution of actions within the platform.


## Usage
@composio/core ships with openai toolset by default. You can directly use the tools from composio in `openai` methods.
```
import { Composio } from "@composio/core";

// By default composio ships with OpenAI toolset
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tool = await composio.getTool("HACKERNEWS_SEARCH_POSTS");
console.log(tool);
```

For more examples, please check the `/examples` directory.

## Using with a different toolset
To use a different toolset, please install the recommended toolset packages.

```
import { Composio } from "@composio/core";
import { VercelToolset } from "@composio/vercel"

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset();
});

const tool = await composio.getTool("HACKERNEWS_SEARCH_POSTS");
console.log(tool);
```


## Creating a new toolset
To create a new Toolset, you need to extend the `BaseComposioToolset<YourToolType>` and implement the `_wrapTool` method to return the tool type of your choice.

To Quickly create a toolset project, execute the following command from the root of the project
```
pnpm run create-toolset <your toolset name>
```
eg:
```
pnpm run create-toolset langchain
```

## Internal
What's not included from @composio/client
- [X] Org/Project Mangement with API Keys
- [X] Trigger Subscriptions
- [ ] Zod Schemas for type checking `Ideally strike a minimal balance, since backend has most`
- [ ] Action Execution
- [ ] CLI `Do we need this in the core SDK?`
- [ ] MCP `Not required as this is not necessary`
- [ ] Team Members 
- [ ] File uploads/user files
- [ ] Tests

These models can be still be accessed via the SDK explicitly by using the `@composio/client`.