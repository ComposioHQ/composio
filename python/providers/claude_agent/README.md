# composio_claude_agent

Agentic Provider for claude-agent in the Composio SDK.

## Features

- **Full Tool Execution**: Execute tools with proper parameter handling
- **Agent Support**: Create agents with wrapped tools
- **Type Safety**: Full type annotations for better IDE support

## Installation

```bash
pip install composio_claude_agent
# or
uv add composio_claude_agent
```

## Quick Start

```python
from composio import Composio
from composio_claude_agent import ClaudeAgentSDKProvider

# Initialize Composio with claude-agent provider
composio = Composio(
    api_key="your-composio-api-key",
    provider=ClaudeAgentSDKProvider()
)

# Get available tools
tools = composio.tools.get(
    user_id="default",
    toolkits=["github", "gmail"]
)

# Use tools with claude-agent
# TODO: Add your usage example here
```

## Usage Examples

### Basic Example

```python
from composio import Composio
from composio_claude_agent import ClaudeAgentSDKProvider

# Initialize provider
provider = ClaudeAgentSDKProvider()

# Initialize Composio
composio = Composio(
    api_key="your-api-key",
    provider=provider
)

# Get tools
tools = composio.tools.get(
    user_id="default", 
    toolkits=["github"]
)

# Use the tools with your agent framework
# TODO: Implement your agent logic here
for tool in tools:
    print(fTool: {tool.name} - {tool.description}),
#         {"role": "user", "content": "Star the composiohq/composio repository"},
#     ],
# )
# 
# # Execute the function calls
# result = composio.provider.handle_tool_calls(response=response, user_id="default")
# print(result)}
```

## API Reference

### ClaudeAgentSDKProvider Class

The `ClaudeAgentSDKProvider` class extends `AgenticProvider` and provides claude_agent-specific functionality.

#### Methods

##### `wrap_tool(tool: Tool, execute_tool: AgenticProviderExecuteFn) -> ClaudeAgentSDKTool`

Wraps a tool in the claude_agent format.

```python
tool = provider.wrap_tool(composio_tool, execute_tool)
```

##### `wrap_tools(tools: Sequence[Tool], execute_tool: AgenticProviderExecuteFn) -> Claude_agentToolkit`

Wraps multiple tools in the claude_agent format.

```python
tools = provider.wrap_tools(composio_tools, execute_tool)
```

}
)
```}

## Development

1. Clone the repository
2. Install dependencies: `uv sync`
3. Make your changes
4. Run tests: `pytest`
5. Format code: `ruff format`
6. Lint code: `ruff check`

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

Apache License 2.0

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
