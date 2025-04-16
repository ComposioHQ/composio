# @composio/core

The core Composio SDK which allows users to interact with the Composio Platform.

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions. Includes support for different trigger types and status management.
- **AuthConfigs**: Configure authentication providers and settings. Manage auth configs with features to create, update, enable/disable, and delete configurations.
- **ConnectedAccounts**: Manage third-party service connections. Includes functionality to create, list, refresh, and manage the status of connected accounts.
- **ActionExecution**: Track and manage the execution of actions within the platform.

## Internal
What's not included from @composio/client
- [ ] Zod Schemas for type checking
- [ ] Action Execution
- [ ] Org/Project Mangement with API Keys
- [ ] CLI 
- [ ] MCP
- [ ] Team Members

These models can be still be accessed via the SDK explicitly by using the `@composio/client`.