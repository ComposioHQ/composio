# Composio Claude Code Agents Provider

Use Composio tools with the Claude Code Agents SDK.

## Installation

### Prerequisites

1. **Claude Code CLI**: The Claude Agent SDK requires Claude Code to be installed:

   ```bash
   # macOS/Linux/WSL
   curl -fsSL https://claude.ai/install.sh | bash

   # or via Homebrew
   brew install --cask claude-code

   # or via npm
   npm install -g @anthropic-ai/claude-code
   ```

2. **Anthropic API Key**: Set your API key as an environment variable:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key"
   ```

### Install the package

```bash
pip install composio-claude-agent-sdk
```

## Usage

```python
import asyncio
from composio import Composio
from composio_claude_agent_sdk import ClaudeAgentSDKProvider
from claude_agent_sdk import query, ClaudeAgentOptions

# Initialize Composio with the Claude Code Agents provider
composio = Composio(provider=ClaudeAgentSDKProvider())

async def main():
    # Get tools from Composio
    tools = composio.tools.get(
        user_id="default",
        toolkits=["gmail"],
    )

    # Create an MCP server configuration with the tools
    mcp_server = composio.provider.create_mcp_server(tools)

    # Run a Claude agent with access to Composio tools
    async for message in query(
        prompt="Fetch my latest email from Gmail",
        options=ClaudeAgentOptions(
            mcp_servers={"composio": mcp_server},
            permission_mode="bypassPermissions",
        ),
    ):
        if message.type == "assistant":
            print(message.message)

asyncio.run(main())
```

## API Reference

### ClaudeCodeAgentsProvider

The main provider class for integrating Composio tools with Claude Code Agents SDK.

#### Constructor Options

```python
ClaudeCodeAgentsProvider(
    server_name: str = "composio",  # Name for the MCP server
    server_version: str = "1.0.0",  # Version for the MCP server
)
```

#### Methods

- `wrap_tool(tool, execute_tool)` - Wraps a single Composio tool as a Claude Agent SDK MCP tool
- `wrap_tools(tools, execute_tool)` - Wraps multiple Composio tools
- `create_mcp_server(wrapped_tools)` - Creates an MCP server configuration from wrapped tools

## Environment Variables

- `COMPOSIO_API_KEY` - Your Composio API key (get one at https://app.composio.dev)
- `ANTHROPIC_API_KEY` - Your Anthropic API key (get one at https://console.anthropic.com)

## Links

- [Composio Documentation](https://docs.composio.dev)
- [Claude Agent SDK Documentation](https://platform.claude.com/docs/en/agent-sdk/python)
- [GitHub Repository](https://github.com/ComposioHQ/composio)
