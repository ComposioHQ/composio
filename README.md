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
To use the composio tools with your Provider, please install the recommended packages along with `@composio/core`.

```
import { Composio } from "@composio/core";
import { OpenAIToolset } from "@composio/openai-toolset";


const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new OpenAIToolset(),
});

const tool = await composio.getTool("HACKERNEWS_SEARCH_POSTS");
console.log(tool);
```

For more examples, please check the `/examples` directory.

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
- [ ] Zod Schemas for type checking
- [ ] Action Execution
- [ ] Org/Project Mangement with API Keys
- [ ] CLI 
- [ ] MCP
- [ ] Team Members

These models can be still be accessed via the SDK explicitly by using the `@composio/client`.